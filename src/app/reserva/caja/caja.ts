import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { CajaHistorial, EstadoCaja, MetodoPago, MovimientoCaja } from '../../core/models';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { colorDeEntidad } from '../../core/utils/color-entidad';
import { aHora12, horaBogota } from '../../core/utils/hora';
import { MonedaPipe } from '../../shared/moneda.pipe';
import { MonedaService } from '../../core/services/moneda.service';
import { formatearMontoEditable, parsearMonto } from '../../core/utils/monto';

type Tab = 'turno' | 'historial';

/**
 * Caja del salón.
 *
 * Un turno tiene un principio (lo que había en el cajón al abrir), un montón de movimientos y
 * un final (lo que debería haber frente a lo que hay). La pantalla está ordenada por esa
 * secuencia, no por tipo de dato.
 *
 * ## Los dos desgloses
 *
 * - **Por forma de pago**: siempre. Es lo que se compara contra el cajón y el datáfono.
 * - **Por profesional**: solo si el negocio activó `permite_cobro_profesional`. Es lo que hay
 *   que entregarle a cada uno. Se listan **únicamente los que atendieron en este turno**;
 *   mostrar todo el equipo con ceros convierte la liquidación en una búsqueda.
 *
 * El backend ya devuelve las dos vistas resueltas y el flag: la pantalla no recalcula dinero,
 * solo lo presenta. Un total que se calcula en dos sitios acaba dando dos cifras.
 */
@Component({
  selector: 'reserva-caja',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MonedaPipe, DatePipe, ModalComponent, ConfirmDialogComponent],
  templateUrl: './caja.html',
  styleUrl: './caja.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly monedas = inject(MonedaService);
  private readonly bus   = inject(EventBusService);

  readonly estado = signal<EstadoCaja | null>(null);
  readonly metodos = signal<MetodoPago[]>([]);
  readonly historial = signal<CajaHistorial[]>([]);
  readonly sinCaja = signal<{ id_cita: number; cliente_nombre: string; monto_total: number }[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly tab = signal<Tab>('turno');

  // Los campos de dinero guardan el TEXTO que se escribe y el número se deriva con
  // `parsearMonto`: con `type="number"` «1.500.000» o «50,000» llegaban vacíos y «100.000» como
  // 100, y el botón de guardar se quedaba apagado con el campo lleno (ver `core/utils/monto.ts`).

  // Apertura
  readonly modalAbrir = signal(false);
  readonly textoApertura = signal('');
  readonly montoApertura = computed(() => this.monto(this.textoApertura()));
  readonly obsApertura = signal('');

  // Cierre
  readonly modalCerrar = signal(false);
  readonly textoReportado = signal('');
  readonly montoReportado = computed(() => this.monto(this.textoReportado()));
  readonly obsCierre = signal('');

  // Movimiento manual
  readonly modalMovimiento = signal(false);
  readonly movTipo = signal<'INGRESO' | 'EGRESO'>('EGRESO');
  readonly textoMov = signal('');
  readonly movMonto = computed(() => this.monto(this.textoMov()));
  readonly movConcepto = signal('');
  readonly movMetodo = signal<number | null>(null);

  readonly confirmCierre = signal(false);

  // Borrado de un movimiento del turno
  readonly confirmEliminar = signal(false);
  readonly movAEliminar = signal<MovimientoCaja | null>(null);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);

  // Permisos del rol. Abrir, cerrar y mover dinero son tres decisiones distintas: quien atiende
  // el mostrador suele poder abrir y registrar gastos, pero no cerrar el día.
  // Se llaman `permite*` para no confundirlos con `puedeAbrir`, que valida el formulario.
  readonly permiteAbrir      = computed(() => this.auth.puedeAccion('caja_abrir'));
  readonly permiteCerrar     = computed(() => this.auth.puedeAccion('caja_cerrar'));
  readonly permiteMovimiento = computed(() => this.auth.puedeAccion('caja_movimiento'));

  /**
   * Borrar un movimiento cambia el cuadre del turno y no tiene deshacer, así que va aparte de
   * «registrar»: quien apunta un gasto no tiene por qué poder hacerlo desaparecer. De fábrica
   * solo la tiene el administrador, y el backend la vuelve a comprobar.
   */
  readonly permiteEliminar   = computed(() => this.auth.puedeAccion('caja_eliminar'));

  readonly abierta = computed(() => this.estado()?.abierta === true);
  readonly caja = computed(() => this.estado()?.caja ?? null);
  readonly totales = computed(() => this.estado()?.totales ?? null);
  readonly porMetodo = computed(() => this.estado()?.por_metodo ?? []);
  readonly porProfesional = computed(() => this.estado()?.por_profesional ?? []);
  readonly movimientos = computed<MovimientoCaja[]>(() => this.estado()?.movimientos ?? []);
  readonly liquidaPorProfesional = computed(() => this.estado()?.permite_cobro_profesional === true);

  /**
   * Acordeón de la tabla del turno: solo despliega detalle un movimiento de una cita (a quién se
   * atendió, con qué servicio). Un ingreso o egreso manual no tiene más que su concepto, así que
   * no se ofrece — no hay nada que desplegar y el cursor de "clic aquí" mentiría.
   */
  readonly filaExpandida = signal<number | null>(null);

  alternarFila(m: MovimientoCaja): void {
    if (!m.cita) return;
    this.filaExpandida.update(id => (id === m.id_movimiento ? null : m.id_movimiento));
  }

  /**
   * La hora de un movimiento (se abrió la caja, se registró el cobro) es un instante real, no la
   * hora de pared de un negocio: se lee a la hora de quien mira, en 12 horas para no obligar a
   * nadie a hacer la resta de si "14:00" es después de comer o de cenar. Con negocios en varios
   * países no hay una sola zona "del negocio" que fijar aquí, a diferencia de una cita.
   */
  horaMovimiento(fecha: string | null | undefined): string {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (Number.isNaN(d.getTime())) return '';
    return aHora12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  }

  /** La hora en que EMPEZÓ la cita sí es de pared del negocio: igual que en toda la agenda. */
  horaCita(iso: string | null | undefined): string {
    return iso ? aHora12(horaBogota(iso)) : '';
  }

  /** Lo que se cobró por la cita, sumando sus líneas — el mismo total que ya se cobró en caja. */
  totalServicios(m: MovimientoCaja): number {
    return (m.cita?.servicios ?? []).reduce((acc, l) => acc + Number(l.precio_snapshot ?? 0), 0);
  }

  readonly totalAEntregar = computed(() =>
    this.porProfesional().reduce((a, p) => a + p.total, 0),
  );

  readonly maxPorMetodo = computed(() =>
    Math.max(1, ...this.porMetodo().map(m => m.total)),
  );

  /** Diferencia provisional mientras el cajero escribe lo que contó. */
  readonly diferenciaPrevia = computed(() => {
    const rep = this.montoReportado();
    const esperado = this.totales()?.esperado ?? 0;
    if (rep == null || !Number.isFinite(rep)) return null;
    return Math.round((rep - esperado) * 100) / 100;
  });

  /** Vacío = «no conté» (vale); escrito pero ilegible o negativo, no. */
  readonly puedeCerrar = computed(() => {
    if (this.guardando()) return false;
    if (!this.textoReportado().trim()) return true;
    const m = this.montoReportado();
    return m != null && m >= 0;
  });

  readonly puedeAbrir = computed(() => {
    const m = this.montoApertura();
    return !this.guardando() && m != null && Number.isFinite(m) && m >= 0;
  });

  // Sin forma de pago el movimiento no se puede restar ni sumar a ningún método al cuadrar el
  // cajón: por eso es obligatoria tanto en ingreso como en egreso, igual que ya lo es al cobrar
  // una cita.
  readonly puedeGuardarMovimiento = computed(() => {
    const m = this.movMonto();
    return !this.guardando() && m != null && Number.isFinite(m) && m > 0 && this.movMetodo() != null;
  });

  ngOnInit() {
    this.cargar();
    // Cobrar una cita mueve la caja: si se completa desde Citas o Agenda, esto se entera.
    this.bus.on('cita_creada').subscribe(() => this.cargar());
    this.bus.on('cita_cobrada').subscribe(() => this.cargar());
  }

  cargar() {
    const id = this.idNegocio();
    if (!id) return;
    this.cargando.set(true);
    forkJoin({
      caja: this.api.getCaja(id),
      metodos: this.api.listarMetodosPago(id),
      pendientes: this.api.getCitasSinCaja(id),
    }).subscribe({
      next: ({ caja, metodos, pendientes }) => {
        if (caja?.success && caja.data) this.estado.set(caja.data);
        if (metodos?.success && metodos.data) this.metodos.set(metodos.data);
        this.sinCaja.set(pendientes?.data ?? []);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudo cargar la caja.'); this.cargando.set(false); },
    });
  }

  cambiarTab(t: Tab) {
    this.tab.set(t);
    if (t === 'historial' && this.historial().length === 0) this.cargarHistorial();
  }

  cargarHistorial() {
    const id = this.idNegocio();
    if (!id) return;
    this.api.getHistorialCaja(id).subscribe({
      next: r => { if (r?.success && r.data) this.historial.set(r.data); },
      error: () => this.toast.error('No se pudo cargar el historial.'),
    });
  }

  // ── Apertura ──

  abrirModalApertura() {
    this.textoApertura.set('0');
    this.obsApertura.set('');
    this.modalAbrir.set(true);
  }

  abrirCaja() {
    if (!this.puedeAbrir()) return;
    this.guardando.set(true);
    this.api.abrirCaja(this.idNegocio(), this.montoApertura()!, this.obsApertura().trim() || undefined)
      .subscribe({
        next: r => {
          this.guardando.set(false);
          if (r?.success) {
            this.toast.success('Caja abierta');
            this.modalAbrir.set(false);
            this.cargar();
          } else this.toast.error(r?.message || 'No se pudo abrir la caja.');
        },
        error: e => {
          this.guardando.set(false);
          this.toast.error(e?.error?.message || 'Error al abrir la caja.');
        },
      });
  }

  // ── Cierre ──

  abrirModalCierre() {
    this.textoReportado.set('');
    this.obsCierre.set('');
    this.modalCerrar.set(true);
  }

  pedirConfirmarCierre() {
    if (!this.puedeCerrar()) return;
    this.modalCerrar.set(false);
    this.confirmCierre.set(true);
  }

  cerrarCaja() {
    const c = this.caja();
    if (!c) return;
    this.guardando.set(true);
    this.api.cerrarCaja(c.id_caja, this.idNegocio(), this.montoReportado(), this.obsCierre().trim() || undefined)
      .subscribe({
        next: r => {
          this.guardando.set(false);
          this.confirmCierre.set(false);
          if (r?.success) {
            this.toast.success('Caja cerrada');
            this.historial.set([]);   // se recarga al entrar al historial
            this.cargar();
          } else this.toast.error(r?.message || 'No se pudo cerrar la caja.');
        },
        error: e => {
          this.guardando.set(false);
          this.confirmCierre.set(false);
          this.toast.error(e?.error?.message || 'Error al cerrar la caja.');
        },
      });
  }

  // ── Movimiento manual ──

  abrirModalMovimiento(tipo: 'INGRESO' | 'EGRESO') {
    this.movTipo.set(tipo);
    this.textoMov.set('');
    this.movConcepto.set('');
    this.movMetodo.set(null);
    this.modalMovimiento.set(true);
  }

  guardarMovimiento() {
    if (!this.puedeGuardarMovimiento()) return;
    this.guardando.set(true);
    this.api.registrarMovimientoCaja(this.idNegocio(), {
      tipo: this.movTipo(),
      monto: this.movMonto()!,
      concepto: this.movConcepto().trim() || undefined,
      idMetodoPago: this.movMetodo(),
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success(this.movTipo() === 'INGRESO' ? 'Ingreso registrado' : 'Egreso registrado');
          this.modalMovimiento.set(false);
          this.cargar();
        } else this.toast.error(r?.message || 'No se pudo registrar.');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al registrar el movimiento.');
      },
    });
  }

  // ── Anular un movimiento del turno ──
  //
  // No se borra: el backend lo marca `anulado` y se queda en la lista (tachado) para no perder
  // trazabilidad, pero deja de sumar en los totales y en el desglose por forma de pago.

  pedirEliminarMovimiento(m: MovimientoCaja) {
    if (m.anulado) return;
    this.movAEliminar.set(m);
    this.confirmEliminar.set(true);
  }

  cancelarEliminarMovimiento() {
    this.confirmEliminar.set(false);
    this.movAEliminar.set(null);
  }

  eliminarMovimientoConfirmado() {
    const m = this.movAEliminar();
    if (!m || this.guardando()) return;
    this.guardando.set(true);
    this.api.eliminarMovimientoCaja(m.id_movimiento, this.idNegocio()).subscribe({
      next: r => {
        this.guardando.set(false);
        this.cancelarEliminarMovimiento();
        if (r?.success) { this.toast.success('Movimiento anulado'); this.cargar(); }
        else this.toast.error(r?.message || 'No se pudo anular.');
      },
      error: e => {
        this.guardando.set(false);
        this.cancelarEliminarMovimiento();
        this.toast.error(e?.error?.message || 'Error al anular el movimiento.');
      },
    });
  }

  /** Texto del confirm: se nombra el importe, que es lo que cambia en el cuadre. */
  descripcionMovimiento(m: MovimientoCaja | null): string {
    if (!m) return '';
    const signo = m.tipo === 'EGRESO' ? 'egreso' : 'ingreso';
    return `${signo} de ${this.monedas.formatear(Number(m.monto ?? 0))}${m.concepto ? ` · ${m.concepto}` : ''}`;
  }

  setMovMetodo(raw: string) { this.movMetodo.set(raw === '' ? null : Number(raw)); }

  private monto(texto: string): number | null {
    return parsearMonto(texto, this.monedas.moneda());
  }

  /** Al salir del campo se reescribe con separadores: así se ve qué número se entendió. */
  normalizarMonto(campo: { set(v: string): void }, valor: number | null) {
    if (valor != null) campo.set(formatearMontoEditable(valor, this.monedas.moneda()));
  }

  /** Sin céntimos (COP, CLP) basta el teclado numérico; con ellos hace falta la coma. */
  readonly modoTeclado = computed(() => (this.monedas.moneda().decimales > 0 ? 'decimal' : 'numeric'));

  totalSinCaja(): number {
    return this.sinCaja().reduce((a, c) => a + Number(c.monto_total ?? 0), 0);
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
