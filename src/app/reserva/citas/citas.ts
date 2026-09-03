import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { environment } from '../../../environments/environment';
import { Cita, EstadoCita, MetodoPago, PagoEstado, Profesional } from '../../core/models';
import { CobroDialogComponent } from '../../shared/cobro-dialog/cobro-dialog';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { CitaFormComponent } from './cita-form/cita-form';
import {
  CitaDetalleComponent, ESTADO_LABELS, PAGO_LABELS, badgeEstado,
} from '../../shared/cita-detalle/cita-detalle';
import { colorDeEntidad } from '../../core/utils/color-entidad';

type Tab = 'todas' | 'pagos';

@Component({
  selector: 'reserva-citas',
  standalone: true,
  imports: [
    CommonModule, LucideAngularModule, CurrencyPipe, DatePipe,
    ModalComponent, ConfirmDialogComponent, CitaFormComponent, CitaDetalleComponent,
    CobroDialogComponent,
  ],
  templateUrl: './citas.html',
  styleUrl: './citas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CitasComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly bus   = inject(EventBusService);

  readonly citas = signal<Cita[]>([]);
  readonly profesionales = signal<Profesional[]>([]);
  readonly cargando = signal(false);
  readonly tab = signal<Tab>('todas');

  // filtros
  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly idProfesionalFiltro = signal<number | null>(null);
  readonly estadoFiltro = signal<string>('');

  // modal nueva cita
  readonly modalNuevaCita = signal(false);

  // modal detalle
  readonly modalDetalle = signal(false);
  readonly citaDetalle = signal<Cita | null>(null);

  // modal validar pago
  readonly modalPago = signal(false);
  readonly citaPago = signal<Cita | null>(null);
  readonly motivoRechazo = signal('');

  // modal cancelar
  readonly confirmAbierto = signal(false);
  readonly citaACancelar = signal<Cita | null>(null);
  readonly motivoCancel = signal('');

  // cobro
  readonly citaACobrar = signal<Cita | null>(null);
  readonly metodosPago = signal<MetodoPago[]>([]);
  readonly permiteMultipago = signal(false);
  readonly exigeCaja = signal(false);
  readonly cajaAbierta = signal(true);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);

  readonly puedeCrear  = computed(() => this.permiso()?.puede_crear ?? true);
  readonly puedeEditar = computed(() => this.permiso()?.puede_editar ?? true);

  // Permisos por acción: el rol puede ver Citas y aun así no poder cancelar. Esconder el botón
  // es cortesía; el backend lo vuelve a comprobar en las rutas que mueven dinero.
  readonly puedeConfirmar   = computed(() => this.auth.puedeAccion('citas_confirmar'));
  readonly puedeCompletar   = computed(() => this.auth.puedeAccion('citas_completar'));
  readonly puedeCancelar    = computed(() => this.auth.puedeAccion('citas_cancelar'));
  readonly puedeNoShow      = computed(() => this.auth.puedeAccion('citas_no_show'));
  readonly puedeValidarPago = computed(() => this.auth.puedeAccion('citas_validar_pago'));
  readonly puedeAgendar     = computed(() => this.puedeCrear() && this.auth.puedeAccion('citas_crear'));

  private permiso() {
    return this.auth.permisosVistaActivos().find(p => p.url === '/citas') ?? null;
  }

  ngOnInit() {
    // Default: rango "esta semana"
    const hoy = new Date();
    const inicio = new Date(hoy); inicio.setHours(0, 0, 0, 0);
    const fin = new Date(inicio); fin.setDate(fin.getDate() + 7);
    this.desde.set(this.toISODate(inicio));
    this.hasta.set(this.toISODate(fin));

    this.cargarProfesionales();
    this.cargarContextoCobro();
    this.recargar();

    this.bus.on<Cita>('cita_creada').subscribe(() => this.recargar());
  }

  /**
   * Formas de pago, flags y estado de la caja: lo que el diálogo de cobro necesita saber.
   * Se pide una vez al entrar, no en cada cobro — son datos de configuración, no de la cita.
   */
  private cargarContextoCobro() {
    const id = this.idNegocio();
    if (!id) return;
    this.api.listarMetodosPago(id).subscribe({
      next: r => { if (r?.success && r.data) this.metodosPago.set(r.data); },
    });
    this.api.getConfig(id).subscribe({
      next: r => {
        if (r?.success && r.data) {
          this.permiteMultipago.set(!!r.data.permite_multipago);
          this.exigeCaja.set(!!r.data.exige_caja_abierta);
        }
      },
    });
    this.api.getCaja(id).subscribe({
      next: r => this.cajaAbierta.set(r?.data?.abierta === true),
      error: () => this.cajaAbierta.set(false),
    });
  }

  private cargarProfesionales() {
    if (!this.idNegocio()) return;
    this.api.listarProfesionales(this.idNegocio()).subscribe(r => {
      if (r?.success && r.data) this.profesionales.set(r.data);
    });
  }

  cambiarTab(t: Tab) {
    this.tab.set(t);
    this.recargar();
  }

  recargar() {
    if (!this.idNegocio()) return;
    this.cargando.set(true);
    if (this.tab() === 'pagos') {
      this.api.listarCitasPendientesPago(this.idNegocio()).subscribe({
        next: r => { this.citas.set(r?.data ?? []); this.cargando.set(false); },
        error: () => { this.toast.error('No se pudieron cargar.'); this.cargando.set(false); },
      });
      return;
    }
    this.api.listarCitas({
      idNegocio: this.idNegocio(),
      desde: this.desde() || undefined,
      hasta: this.hasta() || undefined,
      idProfesional: this.idProfesionalFiltro() ?? undefined,
      estado: this.estadoFiltro() || undefined,
    }).subscribe({
      next: r => { this.citas.set(r?.data ?? []); this.cargando.set(false); },
      error: () => { this.toast.error('No se pudieron cargar.'); this.cargando.set(false); },
    });
  }

  setProfesionalFiltro(idRaw: string) {
    this.idProfesionalFiltro.set(idRaw === '' ? null : Number(idRaw));
  }

  // ── Detalle ──
  abrirDetalle(c: Cita) { this.citaDetalle.set(c); this.modalDetalle.set(true); }
  cerrarDetalle() { this.modalDetalle.set(false); this.citaDetalle.set(null); }

  // ── Acciones ──

  /**
   * Mensaje de un rechazo del backend.
   *
   * El dominio de reserva rechaza transiciones inválidas con un 409 y una explicación
   * concreta («una cita cancelada ya está cerrada»). Antes esto caía en un `error:` que
   * mostraba un texto fijo y tiraba la explicación, así que el usuario veía «Error al
   * confirmar» sin saber por qué. Si el backend se molesta en decir qué pasa, se muestra.
   */
  private motivoRechazo_(err: unknown, porDefecto: string): string {
    const e = err as { error?: { message?: string } };
    return e?.error?.message || porDefecto;
  }

  confirmar(c: Cita) {
    this.api.confirmarCita(c.id_cita, this.idNegocio()).subscribe({
      next: r => { if (r?.success) { this.toast.success('Cita confirmada'); this.recargar(); }
                   else this.toast.error(r?.message || 'Error.'); },
      error: err => { this.toast.error(this.motivoRechazo_(err, 'Error al confirmar.')); this.recargar(); },
    });
  }
  /**
   * Completar pasa por el diálogo de cobro: ya no es un cambio de estado, es registrar dinero.
   * El diálogo pide la forma de pago y el backend lo asienta en la caja abierta.
   */
  completar(c: Cita) {
    this.citaACobrar.set(c);
  }

  onCobrada() {
    this.citaACobrar.set(null);
    this.recargar();
    this.bus.publish('cita_cobrada', null);
  }
  noShow(c: Cita) {
    this.api.noShowCita(c.id_cita, this.idNegocio()).subscribe({
      next: r => { if (r?.success) { this.toast.warning('Marcada como no-show'); this.recargar(); }
                   else this.toast.error(r?.message || 'Error.'); },
      error: err => { this.toast.error(this.motivoRechazo_(err, 'Error al marcar.')); this.recargar(); },
    });
  }
  pedirCancelar(c: Cita) {
    this.citaACancelar.set(c);
    this.motivoCancel.set('');
    this.confirmAbierto.set(true);
  }
  cancelarConfirmado() {
    const c = this.citaACancelar(); if (!c) return;
    this.api.cancelarCita(c.id_cita, this.idNegocio(), this.motivoCancel()).subscribe({
      next: r => {
        if (r?.success) { this.toast.success('Cita cancelada'); this.recargar(); this.bus.publish('cita_cancelada', r.data); }
        else this.toast.error(r?.message || 'Error.');
        this.confirmAbierto.set(false); this.citaACancelar.set(null);
      },
      error: err => {
        this.toast.error(this.motivoRechazo_(err, 'Error al cancelar.'));
        this.confirmAbierto.set(false); this.citaACancelar.set(null); this.recargar();
      },
    });
  }

  // ── Validar pago ──
  abrirValidarPago(c: Cita) {
    this.citaPago.set(c);
    this.motivoRechazo.set('');
    this.modalPago.set(true);
  }
  cerrarValidarPago() { this.modalPago.set(false); this.citaPago.set(null); }

  comprobanteUrl(c: Cita): string {
    return `${environment.apiUrl}/citas/${c.id_cita}/comprobante?id_negocio=${this.idNegocio()}`;
  }

  aprobarPago() {
    const c = this.citaPago(); if (!c) return;
    this.api.aprobarPago(c.id_cita, this.idNegocio()).subscribe({
      next: r => {
        if (r?.success) { this.toast.success('Pago aprobado'); this.recargar(); this.bus.publish('cita_pago_aprobado', r.data); }
        else this.toast.error(r?.message || 'Error.');
        this.cerrarValidarPago();
      },
      error: () => { this.toast.error('Error al aprobar.'); this.cerrarValidarPago(); },
    });
  }
  rechazarPago() {
    const c = this.citaPago(); if (!c) return;
    if (!this.motivoRechazo().trim()) { this.toast.error('Debes indicar un motivo.'); return; }
    this.api.rechazarPago(c.id_cita, this.idNegocio(), this.motivoRechazo()).subscribe({
      next: r => {
        if (r?.success) { this.toast.warning('Pago rechazado'); this.recargar(); this.bus.publish('cita_pago_rechazado', r.data); }
        else this.toast.error(r?.message || 'Error.');
        this.cerrarValidarPago();
      },
      error: () => { this.toast.error('Error al rechazar.'); this.cerrarValidarPago(); },
    });
  }

  // Etiquetas y colores de estado viven en `shared/cita-detalle`, que es quien los pinta.
  // Tenerlos aquí también significaba que renombrar un estado había que hacerlo en dos sitios.
  estadoLabel(e: EstadoCita): string { return ESTADO_LABELS[e] ?? e; }
  pagoLabel(e: PagoEstado): string   { return PAGO_LABELS[e] ?? e; }
  badgeEstado(e: EstadoCita): string { return badgeEstado(e); }

  private toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
