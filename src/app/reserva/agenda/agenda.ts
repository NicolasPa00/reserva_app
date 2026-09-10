import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit,
  computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { environment } from '../../../environments/environment';
import { Cita, DiaDisponible, EstadoCita, MetodoPago, Profesional } from '../../core/models';
import { CitaFormComponent } from '../citas/cita-form/cita-form';
import { ModalComponent } from '../../shared/modal/modal';
import { CobroDialogComponent } from '../../shared/cobro-dialog/cobro-dialog';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import {
  CitaDetalleComponent, ESTADO_LABELS, badgeEstado,
} from '../../shared/cita-detalle/cita-detalle';
import { colorDeEntidad } from '../../core/utils/color-entidad';
import { MonedaPipe } from '../../shared/moneda.pipe';

/**
 * Alto de una hora en píxeles.
 *
 * Eran 48 px, y ése era el origen del problema visual: una cita de 30 minutos ocupaba 22 px, en
 * los que había que meter nombre, horas, servicios y una insignia de estado. No cabía, así que
 * se pisaban unos a otros y el nombre del cliente quedaba tapado por la etiqueta. Con 88 px la
 * media hora son 44 px —dos líneas de texto cómodas— y el cuarto de hora sigue siendo un
 * escalón visible de 22 px, que es la resolución con la que se agenda de verdad.
 */
const PIXELS_POR_HORA = 88;
const MINUTOS_SUBDIVISION = 15;
const HORA_INICIO_FALLBACK = 8;
const HORA_FIN_FALLBACK = 20;

interface CitaPosicionada {
  cita: Cita;
  topPx: number;
  heightPx: number;
  /** Columna dentro del grupo de citas solapadas, y cuántas columnas tiene el grupo. */
  col: number;
  cols: number;
  /** Menos de 45 px: solo cabe una línea, así que se pinta en versión reducida. */
  compacta: boolean;
  duracionMin: number;
}

interface FranjaAbierta { topPx: number; heightPx: number; }

@Component({
  selector: 'reserva-agenda',
  standalone: true,
  imports: [MonedaPipe, 
    CommonModule, LucideAngularModule, DatePipe,
    CitaFormComponent, ModalComponent, CitaDetalleComponent, CobroDialogComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './agenda.html',
  styleUrl: './agenda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaComponent implements OnInit, OnDestroy {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly bus   = inject(EventBusService);

  readonly profesionales = signal<Profesional[]>([]);
  readonly citas = signal<Cita[]>([]);
  readonly cargando = signal(false);

  /** Jornada laboral del día por profesional; lo que tiñe de gris lo que está fuera de horario. */
  readonly diasPorPro = signal<Map<number, DiaDisponible>>(new Map());

  readonly fechaActiva = signal<Date>(new Date());
  readonly ahora = signal<Date>(new Date());
  private relojId?: ReturnType<typeof setInterval>;

  readonly pxPorHora = PIXELS_POR_HORA;

  readonly modalNuevaCita = signal(false);
  readonly citaDetalle = signal<Cita | null>(null);
  /** Cita que está editando el formulario; `null` = está creando una nueva. */
  readonly citaEditando = signal<Cita | null>(null);

  // Cobro
  readonly citaACobrar = signal<Cita | null>(null);
  readonly metodosPago = signal<MetodoPago[]>([]);
  readonly permiteMultipago = signal(false);
  readonly cajaAbierta = signal(true);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);

  // Borrado definitivo
  readonly confirmEliminar = signal(false);
  readonly citaAEliminar = signal<Cita | null>(null);
  readonly eliminando = signal(false);

  // Permisos por acción dentro de la agenda.
  readonly puedeAgendar = computed(() => this.auth.puedeAccion('agenda_crear_cita'));
  readonly puedeCobrarCita = computed(() => this.auth.puedeAccion('agenda_cobrar'));

  // Mismas acciones y mismos permisos que en Citas (`citas_*`): es el mismo ciclo de vida de la
  // cita, así que da igual desde qué pantalla se toque.
  readonly puedeConfirmar   = computed(() => this.auth.puedeAccion('citas_confirmar'));
  readonly puedeCancelar    = computed(() => this.auth.puedeAccion('citas_cancelar'));
  readonly puedeNoShow      = computed(() => this.auth.puedeAccion('citas_no_show'));
  readonly puedeValidarPago = computed(() => this.auth.puedeAccion('citas_validar_pago'));

  // Validar pago
  readonly modalPago = signal(false);
  readonly citaPago = signal<Cita | null>(null);
  readonly motivoRechazo = signal('');

  // Cancelar
  readonly confirmCancelar = signal(false);
  readonly citaACancelar = signal<Cita | null>(null);
  readonly motivoCancel = signal('');

  /**
   * Borrar no es cancelar: quita la cita del histórico para siempre. Por eso va en su propia
   * acción, que de fábrica solo tiene el administrador, y el backend la vuelve a comprobar.
   */
  readonly puedeEliminarCita = computed(() => this.auth.puedeAccion('agenda_eliminar'));
  private readonly tieneAccionEditar = computed(() => this.auth.puedeAccion('citas_editar'));

  /**
   * Rango horario de la rejilla.
   *
   * Sale del horario configurado, no de un 8–20 fijo: un salón que abre a las 7 veía su primera
   * cita recortada y uno que cierra a las 17 arrastraba tres horas vacías. Se amplía si alguna
   * cita del día cae fuera del horario (las hay: una cita creada antes de cambiar el horario
   * sigue existiendo, y esconderla sería mentir sobre la agenda).
   */
  readonly rangoGrid = computed<{ inicio: number; fin: number }>(() => {
    const horas: number[] = [];

    for (const dia of this.diasPorPro().values()) {
      for (const r of dia.rangos) {
        horas.push(this.horaDecimal(r.inicio), this.horaDecimal(r.fin));
      }
    }
    for (const c of this.citas()) {
      if (c.estado === 'cancelada') continue;
      const ini = new Date(c.fecha_hora_inicio);
      const fin = new Date(c.fecha_hora_fin);
      horas.push(ini.getHours() + ini.getMinutes() / 60, fin.getHours() + fin.getMinutes() / 60);
    }

    if (horas.length === 0) return { inicio: HORA_INICIO_FALLBACK, fin: HORA_FIN_FALLBACK };

    const inicio = Math.max(0, Math.floor(Math.min(...horas)));
    const fin = Math.min(24, Math.ceil(Math.max(...horas)));
    return fin - inicio < 4
      ? { inicio, fin: Math.min(24, inicio + 4) }   // una rejilla de dos horas no se lee
      : { inicio, fin };
  });

  readonly horasGrid = computed(() => {
    const { inicio, fin } = this.rangoGrid();
    const arr: string[] = [];
    for (let h = inicio; h < fin; h++) arr.push(`${String(h).padStart(2, '0')}:00`);
    return arr;
  });

  readonly subdivisiones = computed(() => 60 / MINUTOS_SUBDIVISION);
  readonly altoSubdivision = computed(() => PIXELS_POR_HORA / this.subdivisiones());

  /** Franjas de atención de cada profesional, ya en píxeles sobre la rejilla. */
  readonly franjasPorPro = computed<Map<number, FranjaAbierta[]>>(() => {
    const out = new Map<number, FranjaAbierta[]>();
    const { inicio } = this.rangoGrid();
    for (const [idPro, dia] of this.diasPorPro()) {
      out.set(idPro, dia.rangos.map(r => {
        const desde = this.horaDecimal(r.inicio);
        const hasta = this.horaDecimal(r.fin);
        return {
          topPx: (desde - inicio) * PIXELS_POR_HORA,
          heightPx: Math.max(0, (hasta - desde) * PIXELS_POR_HORA),
        };
      }));
    }
    return out;
  });

  /** Citas posicionadas por columna, con reparto horizontal cuando se solapan. */
  readonly citasPorPro = computed<Map<number, CitaPosicionada[]>>(() => {
    const { inicio } = this.rangoGrid();
    const porPro = new Map<number, Cita[]>();

    for (const c of this.citas()) {
      if (c.estado === 'cancelada') continue;
      const arr = porPro.get(c.id_profesional) ?? [];
      arr.push(c);
      porPro.set(c.id_profesional, arr);
    }

    const salida = new Map<number, CitaPosicionada[]>();
    for (const [idPro, lista] of porPro) {
      salida.set(idPro, this.repartirSolapes(lista, inicio));
    }
    return salida;
  });

  readonly totalCitas = computed(() =>
    this.citas().filter(c => c.estado !== 'cancelada').length,
  );

  readonly esHoy = computed(() => {
    const d = this.fechaActiva();
    const h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
  });

  /** Posición de la línea de «ahora»; `null` si el día mostrado no es hoy o cae fuera del grid. */
  readonly lineaAhoraPx = computed<number | null>(() => {
    if (!this.esHoy()) return null;
    const n = this.ahora();
    const h = n.getHours() + n.getMinutes() / 60;
    const { inicio, fin } = this.rangoGrid();
    if (h < inicio || h > fin) return null;
    return (h - inicio) * PIXELS_POR_HORA;
  });

  readonly fechaLabel = computed(() =>
    this.fechaActiva().toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
  );

  ngOnInit() {
    this.cargar();
    this.cargarContextoCobro();
    this.bus.on<Cita>('cita_creada').subscribe(() => this.cargar());
    this.bus.on<Cita>('cita_cancelada').subscribe(() => this.cargar());
    this.bus.on<Cita>('cita_eliminada').subscribe(() => this.cargar());
    this.bus.on<Cita>('cita_pago_aprobado').subscribe(() => this.cargar());
    // La línea de «ahora» se mueve sola; cada minuto es suficiente para un píxel y medio.
    this.relojId = setInterval(() => this.ahora.set(new Date()), 60_000);
  }

  ngOnDestroy() {
    if (this.relojId) clearInterval(this.relojId);
  }

  cargar() {
    if (!this.idNegocio()) return;
    const desde = new Date(this.fechaActiva()); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 1);

    this.cargando.set(true);
    forkJoin({
      pros:  this.api.listarProfesionales(this.idNegocio()),
      citas: this.api.listarCitas({
        idNegocio: this.idNegocio(),
        desde: desde.toISOString(),
        hasta: hasta.toISOString(),
      }),
    }).subscribe({
      next: ({ pros, citas }) => {
        const profesionales = pros?.success && pros.data ? pros.data : [];
        this.profesionales.set(profesionales);
        if (citas?.success && citas.data) this.citas.set(citas.data);
        this.cargando.set(false);
        this.cargarJornadas(profesionales);
      },
      error: () => { this.toast.error('No se pudo cargar la agenda.'); this.cargando.set(false); },
    });
  }

  /**
   * Jornada laboral del día para cada profesional.
   *
   * Va en una segunda tanda a propósito: la rejilla ya se puede pintar sin ella, así que la
   * agenda aparece de inmediato y el sombreado del horario entra un instante después, en vez de
   * retrasar todo hasta tener el dato menos crítico.
   */
  private cargarJornadas(profesionales: Profesional[]) {
    if (profesionales.length === 0) { this.diasPorPro.set(new Map()); return; }
    const fecha = this.fechaISO();

    forkJoin(
      profesionales.map(p =>
        this.api.diasDisponibles({
          idNegocio: this.idNegocio(),
          idProfesional: p.id_profesional,
          desde: fecha, hasta: fecha,
        }),
      ),
    ).subscribe({
      next: respuestas => {
        const map = new Map<number, DiaDisponible>();
        respuestas.forEach((r, i) => {
          const dia = r?.data?.[0];
          if (dia) map.set(profesionales[i].id_profesional, dia);
        });
        this.diasPorPro.set(map);
      },
      // Sin jornadas la agenda sigue siendo usable (solo pierde el sombreado): no se molesta
      // al usuario con un toast por algo que no le impide trabajar.
      error: () => this.diasPorPro.set(new Map()),
    });
  }

  // Cambiar de día recarga la agenda, no el contexto de cobro: las formas de pago y los flags
  // del negocio no dependen de la fecha que se esté mirando.
  cambiarDia(deltaDias: number) {
    const d = new Date(this.fechaActiva());
    d.setDate(d.getDate() + deltaDias);
    this.fechaActiva.set(d);
    this.cargar();
  }

  irAHoy() {
    this.fechaActiva.set(new Date());
    this.cargar();
  }

  setFechaDesdeInput(v: string) {
    if (!v) return;
    const [y, m, d] = v.split('-').map(Number);
    this.fechaActiva.set(new Date(y, m - 1, d));
    this.cargar();
  }

  fechaInputValue(): string { return this.fechaISO(); }

  abrirDetalle(c: Cita) { this.citaDetalle.set(c); }
  cerrarDetalle() { this.citaDetalle.set(null); }

  /** Solo una cita viva se puede cobrar; las terminales ya están cerradas. */
  puedeCobrar(c: Cita | null): boolean {
    if (!this.puedeCobrarCita()) return false;
    return !!c && (c.estado === 'pendiente' || c.estado === 'confirmada');
  }

  /**
   * Una cita cerrada (completada, cancelada, no asistió) no se edita: la completada ya pasó
   * por caja con su monto, y cambiarlo descuadraría el turno. El backend lo rechaza igual;
   * esto solo evita ofrecer un botón que va a fallar.
   */
  puedeEditarCita(c: Cita | null): boolean {
    if (!this.tieneAccionEditar()) return false;
    return !!c && (c.estado === 'pendiente' || c.estado === 'confirmada');
  }

  editarCita(c: Cita) {
    this.citaDetalle.set(null);
    this.citaEditando.set(c);
    this.modalNuevaCita.set(true);
  }

  cerrarFormulario() {
    this.modalNuevaCita.set(false);
    this.citaEditando.set(null);
  }

  cobrar(c: Cita) {
    this.citaDetalle.set(null);
    this.refrescarCaja();
    this.citaACobrar.set(c);
  }

  /**
   * Mensaje de un rechazo del backend. Igual que en Citas: si el dominio rechaza la transición
   * con una explicación concreta, se muestra esa y no un texto fijo que oculta el motivo.
   */
  private motivoRechazo_(err: unknown, porDefecto: string): string {
    const e = err as { error?: { message?: string } };
    return e?.error?.message || porDefecto;
  }

  confirmar(c: Cita) {
    this.citaDetalle.set(null);
    this.api.confirmarCita(c.id_cita, this.idNegocio()).subscribe({
      next: r => { if (r?.success) { this.toast.success('Cita confirmada'); this.cargar(); }
                   else this.toast.error(r?.message || 'Error.'); },
      error: err => { this.toast.error(this.motivoRechazo_(err, 'Error al confirmar.')); this.cargar(); },
    });
  }

  noShow(c: Cita) {
    this.citaDetalle.set(null);
    this.api.noShowCita(c.id_cita, this.idNegocio()).subscribe({
      next: r => { if (r?.success) { this.toast.warning('Marcada como no-show'); this.cargar(); }
                   else this.toast.error(r?.message || 'Error.'); },
      error: err => { this.toast.error(this.motivoRechazo_(err, 'Error al marcar.')); this.cargar(); },
    });
  }

  pedirCancelar(c: Cita) {
    this.citaDetalle.set(null);
    this.citaACancelar.set(c);
    this.motivoCancel.set('');
    this.confirmCancelar.set(true);
  }

  cancelarConfirmado() {
    const c = this.citaACancelar(); if (!c) return;
    this.api.cancelarCita(c.id_cita, this.idNegocio(), this.motivoCancel()).subscribe({
      next: r => {
        if (r?.success) { this.toast.success('Cita cancelada'); this.cargar(); this.bus.publish('cita_cancelada', r.data); }
        else this.toast.error(r?.message || 'Error.');
        this.confirmCancelar.set(false); this.citaACancelar.set(null);
      },
      error: err => {
        this.toast.error(this.motivoRechazo_(err, 'Error al cancelar.'));
        this.confirmCancelar.set(false); this.citaACancelar.set(null); this.cargar();
      },
    });
  }

  // ── Validar pago ──
  abrirValidarPago(c: Cita) {
    this.citaDetalle.set(null);
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
        if (r?.success) { this.toast.success('Pago aprobado'); this.cargar(); this.bus.publish('cita_pago_aprobado', r.data); }
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
        if (r?.success) { this.toast.warning('Pago rechazado'); this.cargar(); this.bus.publish('cita_pago_rechazado', r.data); }
        else this.toast.error(r?.message || 'Error.');
        this.cerrarValidarPago();
      },
      error: () => { this.toast.error('Error al rechazar.'); this.cerrarValidarPago(); },
    });
  }

  // ── Borrado definitivo ──

  pedirEliminar(c: Cita) {
    this.citaDetalle.set(null);
    this.citaAEliminar.set(c);
    this.confirmEliminar.set(true);
  }

  cancelarEliminar() {
    this.confirmEliminar.set(false);
    this.citaAEliminar.set(null);
  }

  eliminarConfirmado() {
    const c = this.citaAEliminar();
    if (!c || this.eliminando()) return;
    this.eliminando.set(true);
    this.api.eliminarCita(c.id_cita, this.idNegocio()).subscribe({
      next: r => {
        this.eliminando.set(false);
        this.cancelarEliminar();
        if (r?.success) {
          this.toast.success('Cita eliminada');
          this.cargar();
          this.bus.publish('cita_eliminada', null);
        } else this.toast.error(r?.message || 'No se pudo eliminar.');
      },
      error: e => {
        this.eliminando.set(false);
        this.cancelarEliminar();
        this.toast.error(e?.error?.message || 'Error al eliminar la cita.');
      },
    });
  }

  /**
   * Relee si hay turno abierto justo antes de cobrar.
   *
   * El estado se carga al entrar a la agenda, y entre eso y el cobro puede haber pasado media
   * mañana: alguien cerró la caja desde otra pantalla y aquí seguiría diciendo que está
   * abierta. El backend lo rechazaría igual, pero es mejor apagar el botón que enseñar un error.
   */
  private refrescarCaja() {
    const id = this.idNegocio();
    if (!id) return;
    this.api.getCaja(id).subscribe({
      next: r => this.cajaAbierta.set(r?.data?.abierta === true),
      error: () => this.cajaAbierta.set(false),
    });
  }

  onCobrada() {
    this.citaACobrar.set(null);
    this.cargar();
    this.cargarContextoCobro();
    this.bus.publish('cita_cobrada', null);
  }

  /** Contexto del cobro: formas de pago, flags y si hay caja abierta. */
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
        }
      },
    });
    this.api.getCaja(id).subscribe({
      next: r => this.cajaAbierta.set(r?.data?.abierta === true),
      error: () => this.cajaAbierta.set(false),
    });
  }

  cerrado(idPro: number): boolean {
    const dia = this.diasPorPro().get(idPro);
    return !!dia && !dia.abierto;
  }

  jornadaLabel(idPro: number): string {
    const dia = this.diasPorPro().get(idPro);
    if (!dia) return '';
    if (!dia.abierto) return 'Cerrado';
    return dia.rangos.map(r => `${r.inicio}–${r.fin}`).join(' · ');
  }

  citasDe(idPro: number): number {
    return this.citasPorPro().get(idPro)?.length ?? 0;
  }

  estadoLabel(e: EstadoCita): string { return ESTADO_LABELS[e] ?? e; }
  estadoBadge(c: Cita): string { return badgeEstado(c.estado); }

  // ── Helpers ──

  /**
   * Reparte en columnas las citas que se pisan.
   *
   * Sin esto, dos citas a la misma hora del mismo profesional se dibujaban una encima de otra y
   * la de abajo desaparecía — el solape no debería ocurrir (el backend lo impide), pero ocurre
   * con datos históricos y con el buffer a cero, y una agenda que esconde una cita es peor que
   * una que la muestra estrecha.
   *
   * Se agrupan las citas en racimos de solapes encadenados y dentro de cada racimo se asigna a
   * cada cita la primera columna que ya haya quedado libre.
   */
  private repartirSolapes(lista: Cita[], horaInicioGrid: number): CitaPosicionada[] {
    const ordenadas = [...lista].sort(
      (a, b) => new Date(a.fecha_hora_inicio).getTime() - new Date(b.fecha_hora_inicio).getTime(),
    );

    const salida: CitaPosicionada[] = [];
    let racimo: CitaPosicionada[] = [];
    let finRacimo = 0;
    let columnas: number[] = [];   // instante en que se libera cada columna

    const cerrarRacimo = () => {
      const cols = columnas.length || 1;
      for (const p of racimo) p.cols = cols;
      salida.push(...racimo);
      racimo = [];
      columnas = [];
      finRacimo = 0;
    };

    for (const c of ordenadas) {
      const ini = new Date(c.fecha_hora_inicio).getTime();
      const fin = new Date(c.fecha_hora_fin).getTime();

      if (racimo.length > 0 && ini >= finRacimo) cerrarRacimo();

      let col = columnas.findIndex(libreEn => libreEn <= ini);
      if (col === -1) { col = columnas.length; columnas.push(fin); }
      else columnas[col] = fin;

      const iniDate = new Date(ini);
      const minutosDesdeInicio = (iniDate.getHours() - horaInicioGrid) * 60 + iniDate.getMinutes();
      const duracionMin = (fin - ini) / 60_000;
      const heightPx = Math.max(20, (duracionMin / 60) * PIXELS_POR_HORA - 2);

      racimo.push({
        cita: c,
        topPx: Math.max(0, (minutosDesdeInicio / 60) * PIXELS_POR_HORA),
        heightPx,
        col,
        cols: 1,
        compacta: heightPx < 45,
        duracionMin: Math.round(duracionMin),
      });
      finRacimo = Math.max(finRacimo, fin);
    }
    if (racimo.length > 0) cerrarRacimo();

    return salida;
  }

  private horaDecimal(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h + (m || 0) / 60;
  }

  private fechaISO(): string {
    const d = this.fechaActiva();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

  // ── Cabecera fija ──

  private readonly cabecera = viewChild<ElementRef<HTMLElement>>('cabecera');
  private readonly cuerpo = viewChild<ElementRef<HTMLElement>>('cuerpo');

  /**
   * Mantiene la cabecera alineada con las columnas al desplazar en horizontal.
   *
   * La cabecera está **fuera** del contenedor que desplaza: si estuviera dentro, ese contenedor
   * —que necesita `overflow-x: auto` para las columnas— sería también el que resuelve su
   * `position: sticky`, y volvería el scroll vertical interior que atrapaba la rueda del ratón.
   * Sacándola, se pega al viewport y solo hay que copiarle el desplazamiento horizontal.
   */
  sincronizarCabecera(): void {
    const cab = this.cabecera()?.nativeElement;
    const cue = this.cuerpo()?.nativeElement;
    if (cab && cue) cab.scrollLeft = cue.scrollLeft;
  }

}
