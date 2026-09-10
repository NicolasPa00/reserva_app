import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { VitrinaStore } from '../vitrina.store';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { UrlArchivoPipe } from '../../../shared/url-archivo.pipe';
import { CitaPublica, DiaServicio, SlotsServicio } from '../../../core/models';
import { aHora12 } from '../../../core/utils/hora';
import { ProfesionalModalComponent } from '../profesional-modal/profesional-modal';
import { colorDeEntidad } from '../../../core/utils/color-entidad';
import { esHojaMovil } from '../../../core/utils/pantalla';
import { formatearCodigoCita } from '../../../core/utils/codigo-cita';
import { MonedaPipe } from '../../../shared/moneda.pipe';

/** Cuántas horas se muestran antes de plegar el resto. */
const SLOTS_VISIBLES = 12;

/**
 * Página de un servicio: información y reserva **en una sola vista**.
 *
 * ## Por qué no hay pasos
 *
 * El asistente anterior pedía servicio → profesional → día → hora → datos en cuatro pantallas.
 * Cansa antes de empezar y esconde justo lo que decide la compra: el precio, la duración y si
 * hay hueco esta semana. Aquí todo eso está a la vista desde el primer segundo, y lo único que
 * se pide al final —cuando el cliente ya ha elegido— son sus datos de contacto.
 *
 * ## Las horas se piden al servidor, siempre
 *
 * El calendario y los huecos salen de `/publico/:id/servicio/:id/{dias,slots}`, que agregan por
 * detrás la misma `reglasAgenda` que decide si una cita se acepta. Nada se deduce del horario
 * semanal en el cliente: ese no conoce bloqueos ni citas ya tomadas, y ofrecer una hora que
 * luego se rechaza es el peor error posible en una pantalla de reservas.
 *
 * ## Elegir hora es elegir profesional
 *
 * Los huecos van agrupados por persona, así que pulsar «10:40» bajo Marco fija las dos cosas a
 * la vez. Es un clic en lugar de dos y elimina la combinación imposible de una hora que ese
 * profesional no tiene libre.
 */
@Component({
  selector: 'reserva-publico-servicio',
  standalone: true,
  imports: [
    LucideAngularModule, MonedaPipe, DatePipe, RouterLink, UrlArchivoPipe,
    ProfesionalModalComponent,
  ],
  templateUrl: './servicio.html',
  styleUrl: './servicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoServicioComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ReservaApiService);
  readonly store = inject(VitrinaStore);

  readonly negocio = this.store.negocio;
  readonly reglas = this.store.reglas;
  readonly raiz = computed(() => `/p/${this.negocio()?.id_negocio ?? ''}`);

  readonly idServicio = signal<number>(0);
  readonly servicio = computed(() => this.store.servicioPorId(this.idServicio()) ?? null);
  readonly descripcionAbierta = signal(false);

  /** Ficha del profesional abierta desde el botón de información. `null` la cierra. */
  readonly profesionalAbierto = signal<number | null>(null);

  /** Sección del catálogo a la que pertenece, para las migas de pan. */
  readonly seccion = computed(() =>
    this.store.secciones().find(s => s.servicios.some(x => x.id_servicio === this.idServicio())) ?? null);

  // ── Calendario ──
  readonly dias = signal<DiaServicio[]>([]);
  readonly cargandoDias = signal(false);
  /** Índice de la semana visible: 0 = la que empieza hoy. */
  readonly semana = signal(0);
  readonly fecha = signal<string | null>(null);

  // ── Huecos ──
  readonly agenda = signal<SlotsServicio | null>(null);
  readonly cargandoSlots = signal(false);
  readonly expandido = signal<Set<number>>(new Set());

  // ── Selección ──
  readonly hora = signal<string | null>(null);
  readonly idProfesional = signal<number | null>(null);

  // ── Formulario final ──
  /** `K3M79QXP` → `K3M7-9QXP`, solo para mostrarlo. */
  readonly codigoBonito = formatearCodigoCita;

  readonly modalAbierto = signal(false);

  /**
   * Descartar la hoja de datos tocando fuera: solo en móvil.
   *
   * Aquí dentro el cliente ya escribió su nombre, su teléfono y a veces adjuntó el
   * comprobante de pago. Un clic fuera en escritorio lo borraba todo sin aviso, justo en el
   * último paso de la reserva. Mismo criterio que el modal del panel (`pantalla.ts`).
   */
  cerrarHojaPorFuera(ev: MouseEvent): void {
    if (ev.target !== ev.currentTarget || !esHojaMovil()) return;
    this.modalAbierto.set(false);
  }

  readonly nombre = signal('');
  readonly telefono = signal('');
  readonly email = signal('');
  readonly notas = signal('');
  readonly comprobante = signal<File | null>(null);
  readonly enviando = signal(false);
  readonly errorEnvio = signal<string | null>(null);
  readonly citaCreada = signal<CitaPublica | null>(null);

  readonly diasCortos = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

  /** Ventana de 6 semanas: cubre la anticipación razonable sin pedir 90 días de agenda. */
  private static readonly SEMANAS = 6;

  constructor() {
    // La vitrina puede llegar después que el componente (entrada directa por URL). En cuanto
    // está, se carga el calendario del servicio.
    effect(() => {
      const s = this.servicio();
      if (s && !this.dias().length && !this.cargandoDias()) this.cargarDias();
    });
  }

  ngOnInit(): void {
    this.store.cargar(Number(this.route.parent?.snapshot.paramMap.get('id_negocio')));
    this.route.paramMap.subscribe(p => {
      const id = Number(p.get('id_servicio'));
      if (id === this.idServicio()) return;
      this.idServicio.set(id);
      this.reiniciar();
    });
  }

  private reiniciar(): void {
    this.dias.set([]);
    this.agenda.set(null);
    this.fecha.set(null);
    this.hora.set(null);
    this.idProfesional.set(null);
    this.semana.set(0);
    this.descripcionAbierta.set(false);
  }

  // ─────────────────────── Calendario ───────────────────────

  private aISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private cargarDias(): void {
    const idNegocio = this.negocio()?.id_negocio;
    const idServicio = this.idServicio();
    if (!idNegocio || !idServicio) return;

    const hoy = new Date();
    const desde = this.aISO(hoy);
    const hasta = this.aISO(new Date(hoy.getTime() + (PublicoServicioComponent.SEMANAS * 7 - 1) * 86_400_000));

    this.cargandoDias.set(true);
    this.api.publicoDiasDeServicio(idNegocio, idServicio, desde, hasta).subscribe({
      next: r => {
        const dias = r?.success && r.data ? r.data : [];
        this.dias.set(dias);
        this.cargandoDias.set(false);

        // Se abre en el primer día con hueco, y se salta a su semana. Dejar la vista en una
        // semana entera cerrada obliga al cliente a buscar a mano dónde empieza la agenda.
        const primero = dias.find(d => d.abierto);
        if (primero) {
          this.semana.set(this.semanaDe(primero.fecha));
          this.elegirFecha(primero.fecha, true);
        }
      },
      error: () => { this.dias.set([]); this.cargandoDias.set(false); },
    });
  }

  private semanaDe(fechaISO: string): number {
    const indice = this.dias().findIndex(d => d.fecha === fechaISO);
    return indice < 0 ? 0 : Math.floor(indice / 7);
  }

  readonly totalSemanas = computed(() => Math.ceil(this.dias().length / 7));

  /** Los siete días de la semana visible. */
  readonly diasVisibles = computed(() => {
    const inicio = this.semana() * 7;
    return this.dias().slice(inicio, inicio + 7);
  });

  /** «31 ago – 6 sep 2026», el rótulo del navegador de semanas. */
  readonly rotuloSemana = computed(() => {
    const dias = this.diasVisibles();
    if (!dias.length) return '';
    const fmt = (iso: string, conAnio = false) => {
      const d = new Date(`${iso}T00:00:00`);
      const mes = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
      return `${d.getDate()} ${mes}${conAnio ? ` ${d.getFullYear()}` : ''}`;
    };
    return `${fmt(dias[0].fecha)} – ${fmt(dias[dias.length - 1].fecha, true)}`;
  });

  cambiarSemana(delta: -1 | 1): void {
    const nueva = this.semana() + delta;
    if (nueva < 0 || nueva >= this.totalSemanas()) return;
    this.semana.set(nueva);
  }

  diaNumero(fechaISO: string): number { return Number(fechaISO.slice(8, 10)); }

  diaSemana(fechaISO: string): string {
    return this.diasCortos[new Date(`${fechaISO}T00:00:00`).getDay()];
  }

  esHoy(fechaISO: string): boolean { return fechaISO === this.aISO(new Date()); }

  /**
   * @param avanzarSiVacio solo en la selección automática inicial: el calendario sabe qué días
   *   se trabaja, pero no si están llenos de citas (comprobarlo para las seis semanas costaría
   *   una consulta por día y profesional). Si el primer día abierto resulta estar completo, se
   *   salta al siguiente en vez de recibir al cliente con una pantalla vacía. Al pulsar un día
   *   a mano no se avanza: ahí la respuesta correcta es «ese día no queda nada».
   */
  elegirFecha(fechaISO: string, avanzarSiVacio = false, intentos = 0): void {
    const dia = this.dias().find(d => d.fecha === fechaISO);
    if (!dia?.abierto) return;

    this.fecha.set(fechaISO);
    this.hora.set(null);
    this.idProfesional.set(null);
    this.agenda.set(null);
    this.expandido.set(new Set());

    const idNegocio = this.negocio()?.id_negocio;
    if (!idNegocio) return;

    this.cargandoSlots.set(true);
    this.api.publicoSlotsDeServicio(idNegocio, this.idServicio(), fechaISO).subscribe({
      next: r => {
        const datos = r?.success && r.data ? r.data : null;
        const vacio = !datos || datos.profesionales.every(p => p.slots.length === 0);

        // Máximo tres saltos: si tres días seguidos están llenos, es más honesto mostrarlo que
        // seguir buscando y dejar la página cargando.
        if (vacio && avanzarSiVacio && intentos < 3) {
          const siguiente = this.dias().find(d => d.abierto && d.fecha > fechaISO);
          if (siguiente) {
            this.semana.set(this.semanaDe(siguiente.fecha));
            this.elegirFecha(siguiente.fecha, true, intentos + 1);
            return;
          }
        }

        this.agenda.set(datos);
        this.cargandoSlots.set(false);
      },
      error: () => { this.agenda.set(null); this.cargandoSlots.set(false); },
    });
  }

  // ─────────────────────── Huecos ───────────────────────

  /** Solo quienes tienen algún hueco ese día; el resto no aporta nada a la decisión. */
  readonly profesionalesConHueco = computed(() =>
    (this.agenda()?.profesionales ?? []).filter(p => p.slots.length > 0));

  slotsDe(p: { id_profesional: number; slots: string[] }): string[] {
    return this.expandido().has(p.id_profesional) ? p.slots : p.slots.slice(0, SLOTS_VISIBLES);
  }

  ocultos(p: { slots: string[] }): number {
    return Math.max(0, p.slots.length - SLOTS_VISIBLES);
  }

  alternarExpandido(idProfesional: number): void {
    this.expandido.update(set => {
      const nuevo = new Set(set);
      if (nuevo.has(idProfesional)) nuevo.delete(idProfesional); else nuevo.add(idProfesional);
      return nuevo;
    });
  }

  elegirHora(idProfesional: number, hora: string): void {
    this.idProfesional.set(idProfesional);
    this.hora.set(hora);
  }

  estaElegida(idProfesional: number, hora: string): boolean {
    return this.idProfesional() === idProfesional && this.hora() === hora;
  }

  hora12(h: string | null): string { return h ? aHora12(h) : ''; }

  readonly profesionalElegido = computed(() =>
    this.profesionalesConHueco().find(p => p.id_profesional === this.idProfesional()) ?? null);

  // ─────────────────────── Reserva ───────────────────────

  readonly requierePago = computed(() => this.reglas()?.cobro_adelantado === true);
  readonly listoParaAgendar = computed(() => !!this.fecha() && !!this.hora() && !!this.idProfesional());

  readonly puedeConfirmar = computed(() =>
    this.listoParaAgendar() &&
    this.nombre().trim().length >= 3 &&
    this.telefono().trim().length >= 7 &&
    (!this.requierePago() || !!this.comprobante()) &&
    !this.enviando());

  abrirFormulario(): void {
    if (!this.listoParaAgendar()) return;
    this.errorEnvio.set(null);
    this.modalAbierto.set(true);
  }

  archivoElegido(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.comprobante.set(input.files?.[0] ?? null);
  }

  confirmar(): void {
    if (!this.puedeConfirmar()) return;
    const idNegocio = this.negocio()!.id_negocio;

    this.enviando.set(true);
    this.errorEnvio.set(null);

    this.api.publicoCrearCita(idNegocio, {
      id_profesional: this.idProfesional()!,
      id_servicios: [this.idServicio()],
      // Hora de pared de Bogotá, sin zona: el backend guarda `timestamp without time zone` y
      // convertirla a UTC la desplazaría cinco horas.
      fecha_hora_inicio: `${this.fecha()}T${this.hora()}:00`,
      cliente_nombre: this.nombre().trim(),
      cliente_telefono: this.telefono().trim(),
      cliente_email: this.email().trim() || undefined,
      notas: this.notas().trim() || undefined,
      comprobante: this.comprobante(),
    }).subscribe({
      next: r => {
        this.enviando.set(false);
        if (r?.success && r.data) { this.citaCreada.set(r.data); this.modalAbierto.set(false); }
        else this.errorEnvio.set(r?.message || 'No pudimos crear la cita.');
      },
      error: err => {
        this.enviando.set(false);
        const mensaje = err?.error?.message;
        if (err?.status === 409) {
          // Alguien cogió el hueco mientras rellenaba: hay que devolverlo a las horas, no
          // dejarle reintentar contra un hueco que ya no existe.
          this.errorEnvio.set(mensaje || 'Esa hora acaba de ocuparse. Elige otra, por favor.');
          this.modalAbierto.set(false);
          this.hora.set(null);
          this.idProfesional.set(null);
          if (this.fecha()) this.elegirFecha(this.fecha()!);
        } else {
          this.errorEnvio.set(mensaje || 'No pudimos crear la cita. Inténtalo de nuevo.');
        }
      },
    });
  }

  verMiCita(): void {
    const codigo = this.citaCreada()?.codigo_publico;
    if (codigo) this.router.navigate([this.raiz(), 'mi-cita'], { queryParams: { codigo } });
  }

  volverAlInicio(): void {
    this.citaCreada.set(null);
    this.router.navigate([this.raiz()]);
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
