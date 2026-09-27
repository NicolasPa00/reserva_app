import {
  ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, effect, inject, signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { VitrinaStore } from '../vitrina.store';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { PaisesService } from '../../../core/services/paises.service';
import { UrlArchivoPipe } from '../../../shared/url-archivo.pipe';
import { CitaPublica, DiaServicio, SlotsServicio, TAMANOS, VarianteServicio } from '../../../core/models';
import { aHora12 } from '../../../core/utils/hora';
import { paisPorMetadatos } from '../../../core/utils/pais-detectado';
import { ProfesionalModalComponent } from '../profesional-modal/profesional-modal';
import { IconoWhatsappComponent } from '../../../shared/iconos-marca/iconos-marca';
import { TelefonoPaisComponent } from '../../../shared/telefono-pais/telefono-pais';
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
    ProfesionalModalComponent, IconoWhatsappComponent, TelefonoPaisComponent,
  ],
  templateUrl: './servicio.html',
  styleUrl: './servicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoServicioComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ReservaApiService);
  private readonly paisesSrv = inject(PaisesService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly store = inject(VitrinaStore);

  readonly negocio = this.store.negocio;
  readonly reglas = this.store.reglas;
  readonly raiz = computed(() => `/p/${this.negocio()?.id_negocio ?? ''}`);

  readonly idServicio = signal<number>(0);
  readonly servicio = computed(() => this.store.servicioPorId(this.idServicio()) ?? null);
  readonly descripcionAbierta = signal(false);

  /**
   * La portada primero, luego la galería. Sin galería es solo la portada — la misma foto de
   * siempre, sin flechas ni puntos que no llevan a ningún sitio.
   */
  readonly fotos = computed(() => {
    const s = this.servicio();
    if (!s) return [];
    const lista: { url: string; descripcion: string | null }[] = [];
    if (s.imagen_url) lista.push({ url: s.imagen_url, descripcion: null });
    for (const g of s.galeria ?? []) if (g.url !== s.imagen_url) lista.push(g);
    return lista;
  });
  readonly indiceFoto = signal(0);
  readonly fotoActual = computed(() => this.fotos()[this.indiceFoto()] ?? null);

  fotoAnterior(): void {
    const total = this.fotos().length;
    if (total) this.indiceFoto.update(i => (i - 1 + total) % total);
  }
  fotoSiguiente(): void {
    const total = this.fotos().length;
    if (total) this.indiceFoto.update(i => (i + 1) % total);
  }
  readonly terminos = this.store.terminos;
  readonly tamanos = TAMANOS;

  // ── Variantes y cotización (perfiles con esas funciones) ──
  //
  // Un servicio con variantes (largo del cabello, tamaño del perro, zona) cambia precio y
  // duración según la que se elija, y la duración cambia los huecos: por eso elegir otra
  // variante recarga el calendario. Sin variantes todo queda como siempre.
  readonly idVarianteElegida = signal<number | null>(null);
  readonly variantes = computed<VarianteServicio[]>(() => this.servicio()?.variantes ?? []);
  readonly variante = computed(() => {
    const vs = this.variantes();
    return vs.find(v => v.id_variante === this.idVarianteElegida()) ?? vs[0] ?? null;
  });
  readonly idVariante = computed(() => this.variante()?.id_variante ?? null);
  readonly precio = computed(() => Number(this.variante()?.precio ?? this.servicio()?.precio ?? 0));
  readonly duracion = computed(() => this.variante()?.duracion_min ?? this.servicio()?.duracion_min ?? 0);
  /** Se cotiza antes de agendar (tatuajes, estética a medida): el portal lleva a WhatsApp. */
  readonly aCotizar = computed(() => !!this.servicio()?.a_cotizar);
  /** Rango de referencia de un servicio a cotizar, si el negocio lo puso. `null` = sin pista. */
  readonly precioMinCotizar = computed(() => {
    const v = this.servicio()?.precio_min;
    return v != null ? Number(v) : null;
  });
  readonly precioMaxCotizar = computed(() => {
    const v = this.servicio()?.precio_max;
    return v != null ? Number(v) : null;
  });
  readonly tieneRangoPrecio = computed(() => this.precioMinCotizar() != null || this.precioMaxCotizar() != null);
  readonly whatsappNegocio = computed(() => this.negocio()?.redes?.whatsapp ?? null);
  readonly requiereMascota = computed(() => !!this.reglas()?.requiere_mascota);
  /** La variante ya dice el tamaño («perro grande»): no se vuelve a preguntar. */
  readonly tamanoPorVariante = computed(() => this.variante()?.clave ?? null);

  /** Qué calendario está cargado: `servicio:variante`. Evita recargar en bucle un calendario vacío. */
  private cargadoPara: string | null = null;

  elegirVariante(id: number | undefined): void {
    if (!id || id === this.idVariante()) return;
    this.idVarianteElegida.set(id);
    this.reiniciarAgenda();
  }

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
  readonly mascota = signal({ nombre: '', raza: '', tamano: '' });
  readonly telefono = signal('');
  /**
   * País del teléfono del cliente, no el del negocio: quien agenda puede estar de paso.
   * Por defecto se adivina por zona horaria/idioma del navegador; el negocio es solo el
   * respaldo cuando el navegador no dice nada reconocible.
   */
  readonly paisCliente = signal('CO');
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
      if (!s || s.a_cotizar) return;
      const clave = `${s.id_servicio}:${this.idVariante() ?? ''}`;
      if (clave !== this.cargadoPara) { this.cargadoPara = clave; this.cargarDias(); }
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

    // El país del cliente por defecto: primero el del negocio (razonable — la mayoría de
    // quienes agendan viven donde el negocio atiende), y si el navegador reconoce uno
    // soportado se prefiere ese, porque es el dato más cercano al propio cliente.
    if (isPlatformBrowser(this.platformId)) {
      this.paisesSrv.cargar().subscribe(paises => {
        if (!paises.length) return;
        const soportados = paises.map(p => p.codigo);
        const delNegocio = this.negocio()?.pais;
        this.paisCliente.set(
          paisPorMetadatos(soportados) ?? (delNegocio && soportados.includes(delNegocio) ? delNegocio : soportados[0]),
        );
      });
    }
  }

  private reiniciar(): void {
    this.idVarianteElegida.set(null);
    this.reiniciarAgenda();
    this.descripcionAbierta.set(false);
    this.indiceFoto.set(0);
  }

  private reiniciarAgenda(): void {
    this.cargadoPara = null;
    this.dias.set([]);
    this.agenda.set(null);
    this.fecha.set(null);
    this.hora.set(null);
    this.idProfesional.set(null);
    this.semana.set(0);
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
    this.api.publicoDiasDeServicio(idNegocio, idServicio, desde, hasta, this.idVariante()).subscribe({
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
    this.api.publicoSlotsDeServicio(idNegocio, this.idServicio(), fechaISO, this.idVariante()).subscribe({
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

  /**
   * El WhatsApp del profesional, sacado de la vitrina por su id.
   *
   * La disponibilidad devuelve los profesionales **recortados** —id, nombre, foto y huecos— y no
   * su contacto, que no pinta nada en un cálculo de agenda. Ampliar esa respuesta para traerlo
   * habría metido un dato de contacto en un endpoint que se pide en cada cambio de día; el store
   * ya tiene la vitrina cargada y ahí está.
   */
  whatsappDe(idProfesional: number): string | null {
    return this.store.profesionalPorId(idProfesional)?.whatsapp ?? null;
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

  /** Pago total o abono según Configuración; el importe sale del precio de la variante. */
  readonly requierePago = computed(() => this.store.pideComprobante(this.precio()));
  readonly anticipo = computed(() => this.store.anticipoDe(this.precio()));
  readonly esAbono = computed(() => this.store.pago().modo === 'abono');

  setMascota(campo: 'nombre' | 'raza' | 'tamano', v: string): void {
    this.mascota.update(m => ({ ...m, [campo]: v }));
  }
  readonly listoParaAgendar = computed(() => !!this.fecha() && !!this.hora() && !!this.idProfesional());

  readonly puedeConfirmar = computed(() =>
    this.listoParaAgendar() &&
    this.nombre().trim().length >= 3 &&
    this.telefono().trim().length >= 7 &&
    (!this.requierePago() || !!this.comprobante()) &&
    (!this.requiereMascota() || this.mascota().nombre.trim().length > 0) &&
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
      cliente_pais: this.paisCliente(),
      cliente_email: this.email().trim() || undefined,
      notas: this.notas().trim() || undefined,
      comprobante: this.comprobante(),
      variantes: this.idVariante() ? { [this.idServicio()]: this.idVariante()! } : null,
      mascota: this.requiereMascota()
        ? {
          nombre: this.mascota().nombre.trim(),
          raza: this.mascota().raza.trim() || undefined,
          // Sin tamaño elegido vale el de la variante: «Baño · perro grande» ya lo dice.
          tamano: this.mascota().tamano || this.tamanoPorVariante() || undefined,
        }
        : null,
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
