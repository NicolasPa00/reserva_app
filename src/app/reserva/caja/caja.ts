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
import { MonedaPipe } from '../../shared/moneda.pipe';
import { MonedaService } from '../../core/services/moneda.service';

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

  // Apertura
  readonly modalAbrir = signal(false);
  readonly montoApertura = signal<number | null>(null);
  readonly obsApertura = signal('');

  // Cierre
  readonly modalCerrar = signal(false);
  readonly montoReportado = signal<number | null>(null);
  readonly obsCierre = signal('');

  // Movimiento manual
  readonly modalMovimiento = signal(false);
  readonly movTipo = signal<'INGRESO' | 'EGRESO'>('EGRESO');
  readonly movMonto = signal<number | null>(null);
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

  readonly puedeAbrir = computed(() => {
    const m = this.montoApertura();
    return !this.guardando() && m != null && Number.isFinite(m) && m >= 0;
  });

  readonly puedeGuardarMovimiento = computed(() => {
    const m = this.movMonto();
    return !this.guardando() && m != null && Number.isFinite(m) && m > 0;
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
    this.montoApertura.set(0);
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
    this.montoReportado.set(null);
    this.obsCierre.set('');
    this.modalCerrar.set(true);
  }

  pedirConfirmarCierre() {
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
    this.movMonto.set(null);
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

  // ── Borrar un movimiento del turno ──

  pedirEliminarMovimiento(m: MovimientoCaja) {
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
        if (r?.success) { this.toast.success('Movimiento eliminado'); this.cargar(); }
        else this.toast.error(r?.message || 'No se pudo eliminar.');
      },
      error: e => {
        this.guardando.set(false);
        this.cancelarEliminarMovimiento();
        this.toast.error(e?.error?.message || 'Error al eliminar el movimiento.');
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

  numeroODefault(raw: string, porDefecto: number | null = null): number | null {
    if (raw === '') return porDefecto;
    const n = Number(raw);
    return Number.isFinite(n) ? n : porDefecto;
  }

  totalSinCaja(): number {
    return this.sinCaja().reduce((a, c) => a + Number(c.monto_total ?? 0), 0);
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
