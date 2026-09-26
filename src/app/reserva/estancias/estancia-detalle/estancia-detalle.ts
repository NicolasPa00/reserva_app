import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, computed, inject, signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../../core/services/auth.service';
import { EstanciaApiService } from '../../../core/services/estancia-api.service';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Estancia, EstadoEstancia, MetodoPago } from '../../../core/models';
import { ModalComponent } from '../../../shared/modal/modal';
import { MonedaPipe } from '../../../shared/moneda.pipe';
import { MultipagoSelectorComponent, PagoSeleccion } from '../../../shared/multipago-selector/multipago-selector';
import { formatearCodigoCita } from '../../../core/utils/codigo-cita';

export const ESTADO_ESTANCIA: Record<EstadoEstancia, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  en_curso: 'En casa',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
  no_show: 'No llegó',
};

export function badgeEstancia(e: EstadoEstancia): string {
  switch (e) {
    case 'confirmada': return 'b-ok';
    case 'pendiente': return 'b-warn';
    case 'en_curso': return 'b-info';
    case 'no_show': return 'b-err';
    default: return 'b-off';
  }
}

type Panel = null | 'pago' | 'cargo' | 'checkout' | 'cancelar' | 'aprobar' | 'devolver';

/**
 * Una estancia de principio a fin: llegada, consumos, pagos a cuenta, salida con el saldo en
 * cero, y el anticipo del portal por validar. Lo usan Ocupación y el listado de estancias.
 *
 * El dinero siempre entra por la caja (el backend lo exige abierta): lo pagado es lo que está
 * en la caja con esta estancia, y el saldo es total + cargos − pagado.
 */
@Component({
  selector: 'reserva-estancia-detalle',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, ModalComponent, MonedaPipe, MultipagoSelectorComponent],
  templateUrl: './estancia-detalle.html',
  styleUrl: './estancia-detalle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstanciaDetalleComponent implements OnChanges {
  @Input({ required: true }) idNegocio!: number;
  @Input() idEstancia: number | null = null;
  @Output() cerrar = new EventEmitter<void>();
  @Output() cambiada = new EventEmitter<Estancia>();

  private readonly api = inject(EstanciaApiService);
  private readonly reserva = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly estancia = signal<Estancia | null>(null);
  readonly cargando = signal(false);
  readonly ocupado = signal(false);
  readonly panel = signal<Panel>(null);
  readonly metodos = signal<MetodoPago[]>([]);
  readonly permiteMultipago = signal(false);

  readonly pagoMetodo = signal<number | null>(null);
  readonly pagoValor = signal<number | null>(null);
  readonly cargo = signal({ concepto: '', valor: null as number | null });
  readonly motivo = signal('');
  readonly seleccion = signal<PagoSeleccion | null>(null);

  readonly codigoBonito = formatearCodigoCita;
  readonly estados = ESTADO_ESTANCIA;

  readonly puedeCrear = computed(() => this.auth.puedeAccion('estancias_crear'));
  readonly puedeCheckin = computed(() => this.auth.puedeAccion('estancias_checkin'));
  readonly puedeCheckout = computed(() => this.auth.puedeAccion('estancias_checkout'));
  readonly puedeCancelar = computed(() => this.auth.puedeAccion('estancias_cancelar'));
  readonly puedeValidar = computed(() => this.auth.puedeAccion('estancias_validar_pago'));

  readonly viva = computed(() => ['pendiente', 'confirmada', 'en_curso'].includes(this.estancia()?.estado ?? ''));
  readonly hoy = computed(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  readonly llegaHoyOAntes = computed(() => (this.estancia()?.fecha_entrada ?? '9999') <= this.hoy());

  ngOnChanges() {
    this.panel.set(null);
    if (this.idEstancia) this.cargar();
    else this.estancia.set(null);
    if (!this.metodos().length && this.idNegocio) {
      this.reserva.listarMetodosPago(this.idNegocio).subscribe({
        next: r => this.metodos.set((r?.data ?? []).filter(m => m.estado === 'A')),
      });
      this.reserva.getConfig(this.idNegocio).subscribe({
        next: r => this.permiteMultipago.set(!!r?.data?.permite_multipago),
      });
    }
  }

  cargar() {
    if (!this.idEstancia) return;
    this.cargando.set(true);
    this.api.get(this.idEstancia, this.idNegocio).subscribe({
      next: r => { this.estancia.set(r?.data ?? null); this.cargando.set(false); },
      error: e => { this.cargando.set(false); this.toast.error(e?.error?.message || 'No se pudo cargar la estancia.'); },
    });
  }

  abrirPanel(p: Panel) {
    this.panel.set(p);
    this.motivo.set('');
    this.seleccion.set(null);
    const saldo = this.estancia()?.saldo ?? 0;
    this.pagoValor.set(p === 'pago' ? saldo : null);
    this.pagoMetodo.set(this.metodos()[0]?.id_metodo_pago ?? null);
    this.cargo.set({ concepto: '', valor: null });
  }

  private hacer(obs: ReturnType<EstanciaApiService['confirmar']>, ok: string) {
    this.ocupado.set(true);
    obs.subscribe({
      next: r => {
        this.ocupado.set(false);
        if (!r?.success || !r.data) { this.toast.error(r?.message || 'No se pudo.'); return; }
        this.estancia.set(r.data);
        this.panel.set(null);
        this.toast.success(ok);
        this.cambiada.emit(r.data);
      },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo completar.'); },
    });
  }

  confirmar() { this.hacer(this.api.confirmar(this.idEstancia!, this.idNegocio), 'Estancia confirmada'); }
  checkin() { this.hacer(this.api.checkin(this.idEstancia!, this.idNegocio), 'Llegada registrada'); }
  noShow() { this.hacer(this.api.noShow(this.idEstancia!, this.idNegocio), 'Marcada como no llegó'); }
  cancelar() { this.hacer(this.api.cancelar(this.idEstancia!, this.idNegocio, this.motivo().trim() || undefined), 'Estancia cancelada'); }

  registrarPago() {
    const m = this.pagoMetodo();
    const v = Number(this.pagoValor());
    if (!m || !(v > 0)) { this.toast.error('Elige la forma de pago y el valor.'); return; }
    this.hacer(this.api.registrarPago(this.idEstancia!, this.idNegocio, m, v), 'Pago registrado en la caja');
  }

  agregarCargo() {
    const c = this.cargo();
    if (!c.concepto.trim() || !(Number(c.valor) > 0)) { this.toast.error('El cargo necesita concepto y valor.'); return; }
    this.hacer(this.api.agregarCargo(this.idEstancia!, this.idNegocio, c.concepto.trim(), Number(c.valor)), 'Cargo agregado');
  }

  quitarCargo(idCargo: number) {
    this.hacer(this.api.eliminarCargo(this.idEstancia!, idCargo, this.idNegocio), 'Cargo quitado');
  }

  checkout() {
    const e = this.estancia();
    if (!e) return;
    const saldo = e.saldo ?? 0;
    const sel = this.seleccion();
    if (saldo > 0 && !sel?.valido) { this.toast.error('Indica con qué se pagó el saldo.'); return; }
    const pago = saldo > 0 && sel ? (sel.modo === 'multi' ? { pagos: sel.pagos } : { idMetodoPago: sel.idMetodoPago }) : {};
    this.hacer(this.api.checkout(this.idEstancia!, this.idNegocio, pago), 'Salida registrada');
  }

  aprobar() {
    const m = this.pagoMetodo();
    if (!m) { this.toast.error('Indica por dónde llegó el anticipo.'); return; }
    this.hacer(this.api.aprobarPago(this.idEstancia!, this.idNegocio, m), 'Anticipo aprobado y registrado en la caja');
  }

  rechazar() {
    if (!this.motivo().trim()) { this.toast.error('Indica el motivo del rechazo.'); return; }
    this.hacer(this.api.rechazarPago(this.idEstancia!, this.idNegocio, this.motivo().trim()), 'Comprobante rechazado');
  }

  devolver() {
    const v = Number(this.pagoValor());
    if (!(v > 0)) { this.toast.error('Indica cuánto se devuelve.'); return; }
    this.hacer(this.api.devolver(this.idEstancia!, this.idNegocio, v, this.pagoMetodo()), 'Devolución registrada en la caja');
  }

  urlComprobante(): string {
    return this.idEstancia ? this.api.urlComprobante(this.idEstancia, this.idNegocio) : '';
  }

  badge(e: EstadoEstancia) { return badgeEstancia(e); }
  num(v: unknown): number { return Number(v ?? 0); }
}
