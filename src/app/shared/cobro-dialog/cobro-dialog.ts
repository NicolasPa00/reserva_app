import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, input, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { Cita, MetodoPago } from '../../core/models';
import { ModalComponent } from '../modal/modal';
import { MultipagoSelectorComponent, PagoSeleccion } from '../multipago-selector/multipago-selector';
import { MonedaPipe } from '../moneda.pipe';

/**
 * Diálogo de cobro: el único sitio desde el que se completa una cita.
 *
 * Existe porque completar dejó de ser un cambio de estado y pasó a mover dinero. Antes había un
 * botón «Completar» en el detalle de la cita que llamaba a la API y ya; ahora hay que elegir con
 * qué se paga, y esa pregunta debe ser la misma se lance desde Citas o desde la Agenda. Tenerla
 * escrita dos veces garantizaría que un día se validen distinto.
 *
 * Se apoya en `multipago-selector` para el cuadre y solo añade lo propio del cobro: el resumen
 * de lo que se va a cobrar, el aviso de caja cerrada y el envío.
 */
@Component({
  selector: 'reserva-cobro-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MonedaPipe, ModalComponent, MultipagoSelectorComponent],
  templateUrl: './cobro-dialog.html',
  styleUrl: './cobro-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CobroDialogComponent {
  private readonly api = inject(ReservaApiService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  @Input({ required: true }) idNegocio!: number;
  @Input() metodos: MetodoPago[] = [];
  @Input() permiteMultipago = false;

  /**
   * Estado del turno. Señal, no `@Input` plano: el padre lo refresca justo antes de abrir el
   * diálogo, y un `@Input` normal no despertaría al `computed` que apaga el botón.
   */
  readonly cajaAbierta = input(true);

  @Input() set cita(v: Cita | null) {
    this.citaSig.set(v);
    if (v) this.seleccion.set(null);
  }

  @Output() close = new EventEmitter<void>();
  @Output() cobrada = new EventEmitter<Cita>();

  readonly citaSig = signal<Cita | null>(null);
  readonly seleccion = signal<PagoSeleccion | null>(null);
  readonly enviando = signal(false);

  readonly total = computed(() => Number(this.citaSig()?.monto_total ?? 0));

  /**
   * Abono ya recibido (perfiles con depósito). Solo cuenta si el comprobante se aprobó: uno
   * pendiente o rechazado no es dinero del negocio. Sin abono —el caso de siempre— es 0 y todo
   * lo de abajo es lo de antes.
   */
  readonly abono = computed(() => {
    const c = this.citaSig();
    if (!c || c.monto_abono == null || c.pago_estado !== 'aprobado') return 0;
    return Math.min(Number(c.monto_abono), this.total());
  });
  /** Lo que falta por cobrar ahora: el total menos el abono. */
  readonly aCobrar = computed(() => Math.max(0, this.total() - this.abono()));
  /** Un abono aprobado con la caja cerrada entra a la caja al completar la cita. */
  readonly abonoPorAsentar = computed(() => this.abono() > 0 && !this.citaSig()?.id_caja_abono);

  /** Una cita de importe cero no necesita forma de pago: no hay nada que cobrar. */
  readonly requierePago = computed(() => this.aCobrar() > 0);

  /**
   * Sin turno abierto no se cobra, y no hay ajuste que lo permita.
   *
   * Antes dependía de `exige_caja_abierta`: con el flag apagado la cita se completaba y el
   * dinero quedaba fuera de toda caja, avisado solo al cerrar el día. El backend ya lo rechaza
   * con `CAJA_CERRADA` pase lo que pase; esto es la mitad amable, para que el botón esté apagado
   * antes de intentarlo. Una cita de importe cero no mueve dinero, así que sí se puede completar.
   */
  readonly bloqueadoPorCaja = computed(() => (this.requierePago() || this.abonoPorAsentar()) && !this.cajaAbierta());

  /**
   * ¿Puede ESTE usuario abrir el turno, o tiene que pedírselo a alguien?
   *
   * El aviso decía «abre la caja en Caja» a todo el mundo, y quien no tiene ese módulo se
   * quedaba mirando un menú donde Caja no aparece. Abrir turno pide las dos cosas: ver la
   * vista y tener la acción `caja_abrir`; con una sola el usuario llegaría a una pantalla
   * sin botón. Cuando no las tiene, el aviso le dice a quién acudir en vez de a dónde ir.
   */
  readonly puedeAbrirCaja = computed(() =>
    this.auth.canAccessRoute('/caja') && this.auth.puedeAccion('caja_abrir'));

  readonly puedeCobrar = computed(() => {
    if (this.enviando() || this.bloqueadoPorCaja()) return false;
    if (!this.requierePago()) return true;
    return this.seleccion()?.valido === true;
  });

  readonly resumenServicios = computed(() =>
    (this.citaSig()?.servicios ?? [])
      .map(s => s.servicio?.nombre)
      .filter(Boolean)
      .join(', '),
  );

  onSeleccion(s: PagoSeleccion) { this.seleccion.set(s); }

  cobrar() {
    const cita = this.citaSig();
    if (!cita || !this.puedeCobrar()) return;

    const sel = this.seleccion();
    this.enviando.set(true);
    this.api.completarCita(cita.id_cita, this.idNegocio, this.requierePago() && sel
      ? (sel.modo === 'multi' ? { pagos: sel.pagos } : { idMetodoPago: sel.idMetodoPago })
      : undefined,
    ).subscribe({
      next: r => {
        this.enviando.set(false);
        if (r?.success) {
          this.toast.success(`${this.auth.termino('cita')} completada y cobrada`);
          this.cobrada.emit(r.data as Cita);
          this.cerrar();
        } else {
          this.toast.error(r?.message || 'No se pudo completar la cita.');
        }
      },
      error: e => {
        this.enviando.set(false);
        // El backend explica por qué rechaza (CAJA_CERRADA, PAGO_NO_CUADRA, transición
        // inválida…). Si se molesta en decirlo, se muestra tal cual.
        this.toast.error(e?.error?.message || 'Error al completar la cita.');
      },
    });
  }

  cerrar() {
    this.citaSig.set(null);
    this.seleccion.set(null);
    this.close.emit();
  }
}
