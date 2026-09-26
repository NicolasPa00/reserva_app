import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnInit, Output,
  SimpleChanges, computed, effect, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventBusService } from '../../../core/services/event-bus.service';
import {
  Cita, ClienteNegocio, DiaDisponible, ESPECIES, Mascota, Profesional, Servicio, Slot, TAMANOS,
} from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { PerfilApiService } from '../../../core/services/perfil-api.service';
import { TerminoPipe } from '../../../shared/termino.pipe';
import { aHora12, fechaBogota, horaBogota, rangoHora12 } from '../../../core/utils/hora';
import { ModalComponent } from '../../../shared/modal/modal';
import { MonedaPipe } from '../../../shared/moneda.pipe';

/** Días que muestra la tira del selector de fecha de una vez. */
const DIAS_VENTANA = 14;

interface DiaChip extends DiaDisponible {
  diaSemana: string;   // "Lun"
  diaMes: string;      // "28"
  mes: string;         // "ago"
  esHoy: boolean;
}

/**
 * Modal de creación de cita manual desde la vista del negocio.
 *
 * ## Qué cambió y por qué
 *
 * **El selector de fecha ofrecía los 365 días del año.** Un `<input type="date">` no sabe que
 * el negocio cierra los domingos, así que el usuario elegía un domingo, pulsaba «Buscar slots»
 * y recibía una lista vacía sin explicación. Ahora la tira de días viene de
 * `/disponibilidad/dias`, que la calcula con la misma primitiva que decide qué se puede
 * reservar (`reglasAgenda.intervalosLaborales`): un día cerrado no es seleccionable, y de cada
 * día abierto se muestra su franja real de atención.
 *
 * **Había que pulsar un botón para ver las horas.** El botón no decidía nada: en cuanto había
 * profesional, servicios y fecha, la respuesta estaba determinada. Un paso manual para algo
 * determinado es fricción, así que los slots se cargan solos cuando esos tres datos están
 * completos. La petición se dispara por `effect` con una clave, no por cada pulsación: cambiar
 * de servicio y volver al anterior no lanza dos consultas.
 *
 * **Se pedía disponibilidad de un solo servicio.** El código anterior mandaba `ids[0]` como
 * «ancla» y confiaba en el lock de la creación para el resto — el propio comentario lo
 * admitía. Pero `crearCita` reserva la **suma** de las duraciones, así que en un combo de corte
 * (30 min) + barba (20 min) se ofrecían slots de 30 y la creación rechazaba los últimos con un
 * 409. Ahora se envían todos los ids y el backend suma.
 *
 * ## También edita
 *
 * Con `citaEditar` el mismo modal sirve para corregir una cita ya agendada: cambiar el
 * servicio, añadir otro, moverla de profesional o de hora. Se reutiliza en vez de escribir un
 * segundo formulario porque los pasos son idénticos y las reglas también — la disponibilidad,
 * la suma de duraciones y qué ofrece cada profesional no cambian por estar editando.
 *
 * Dos diferencias, ambas necesarias:
 *
 *  - Los **datos del cliente no se editan aquí**. Esta pantalla decide qué se presta y cuándo,
 *    que es lo que compite por la agenda; el nombre y el teléfono se muestran, sin tocar.
 *  - La búsqueda de horas **excluye la propia cita** (`excluir_cita`). Sin eso, su hora actual
 *    aparecería ocupada por ella misma y no se podría dejar donde está.
 */
@Component({
  selector: 'reserva-cita-form',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MonedaPipe, ModalComponent, TerminoPipe],
  templateUrl: './cita-form.html',
  styleUrl: './cita-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CitaFormComponent implements OnInit, OnChanges {
  @Input({ required: true }) idNegocio!: number;

  /**
   * Cita a editar. `null` (lo normal) = crear una nueva.
   *
   * El prellenado se hace al ABRIR y no aquí, porque el padre puede asignar esta entrada
   * antes de que el catálogo esté cargado y el orden de las dos asignaciones no está
   * garantizado.
   */
  @Input() set citaEditar(v: Cita | null) { this.citaSig.set(v ?? null); }

  /**
   * El prellenado NO se dispara aquí.
   *
   * Angular asigna las entradas en el orden en que están escritas en la plantilla, y en las
   * tres pantallas `[open]` va antes que `[citaEditar]`. Hacerlo en este setter significaba
   * preparar el formulario cuando la cita todavía era `null`, es decir vaciarlo siempre: la
   * edición se abría en blanco. Lo hace `ngOnChanges`, que corre una vez por ciclo con todas
   * las entradas ya puestas y no depende de cómo estén ordenadas.
   */
  @Input() set open(v: boolean) { this.abierto.set(v); }

  @Output() close = new EventEmitter<void>();
  /** Se emite tanto al crear como al editar: la pantalla que escucha solo quiere recargar. */
  @Output() saved = new EventEmitter<void>();

  private readonly api = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly bus = inject(EventBusService);
  private readonly auth = inject(AuthService);
  private readonly perfilApi = inject(PerfilApiService);

  // ── Perfil del rubro ──
  //
  // Variante por servicio (largo, tamaño, zona), precio acordado en los servicios «a cotizar»
  // y la mascota. Todo aparece solo con su función encendida: en una barbería el formulario es
  // el de siempre y la duración es la suma de las de lista.
  readonly conVariantes = computed(() => this.auth.tieneFuncion('variantes'));
  readonly conCotizar = computed(() => this.auth.tieneFuncion('a_cotizar'));
  readonly conMascotas = computed(() => this.auth.tieneFuncion('mascotas'));
  readonly especies = ESPECIES;
  readonly tamanos = TAMANOS;

  /** Variante elegida por servicio: `{ [id_servicio]: id_variante }`. */
  readonly variantesElegidas = signal<Record<number, number>>({});
  /** Precio y duración acordados de los servicios a cotizar. */
  readonly ajustes = signal<Record<number, { precio: number | null; duracion_min: number | null }>>({});

  readonly mascotasCliente = signal<Mascota[]>([]);
  readonly idMascota = signal<string | null>(null);
  readonly mascotaNueva = signal({ nombre: '', especie: 'PERRO', tamano: '', raza: '' });

  readonly abierto = signal(false);

  /** Evita que `ngOnInit` y `ngOnChanges` pidan el catálogo dos veces al arrancar. */
  private catalogoPedido = false;
  private readonly citaSig = signal<Cita | null>(null);

  /** ¿Este modal está editando una cita existente en vez de crear una? */
  readonly modoEdicion = computed(() => this.citaSig() !== null);
  readonly citaEnEdicion = computed(() => this.citaSig());

  readonly profesionales = signal<Profesional[]>([]);
  readonly servicios = signal<Servicio[]>([]);
  readonly cargandoCatalogo = signal(false);

  readonly idProfesional = signal<number | null>(null);
  readonly idServicios   = signal<Set<number>>(new Set());
  readonly fecha         = signal<string>('');          // YYYY-MM-DD
  readonly slotElegido   = signal<string | null>(null); // HH:MM

  readonly slots = signal<Slot[]>([]);
  readonly buscandoSlots = signal(false);

  readonly dias = signal<DiaDisponible[]>([]);
  readonly cargandoDias = signal(false);
  readonly ventanaInicio = signal<string>('');

  readonly cliente = signal({ nombre: '', telefono: '', email: '', notas: '' });

  /**
   * El cliente que ya está en la cartera con ese teléfono, si lo hay. `null` = no se le
   * conoce (o todavía no se ha preguntado), que es lo normal para alguien nuevo.
   */
  readonly clienteConocido = signal<ClienteNegocio | null>(null);
  private buscaCliente: ReturnType<typeof setTimeout> | null = null;

  /** El nombre escrito difiere del que ya teníamos: se ofrece usar el conocido, no se impone. */
  readonly nombreDifiere = computed(() => {
    const conocido = this.clienteConocido()?.nombre?.trim();
    const escrito = this.cliente().nombre.trim();
    return !!conocido && !!escrito && conocido.toLowerCase() !== escrito.toLowerCase();
  });
  readonly enviando = signal(false);

  /** Última combinación por la que se pidieron slots; evita repetir la misma consulta. */
  private ultimaClaveSlots = '';
  private ultimaClaveDias = '';

  /**
   * La hora que el usuario eligió, al margen de la lista que haya cargada.
   *
   * Cambiar de profesional recarga los huecos, y hasta que llegan la selección no existe. Sin
   * recordarla aquí, cada cambio devolvía el formulario a cero y había que volver a elegir día
   * y hora que seguían estando libres. Se conserva mientras el nuevo profesional la tenga; si
   * no la tiene, se suelta (ahí sí no hay nada que respetar).
   */
  private horaDeseada: string | null = null;

  readonly serviciosOfrecidos = computed<Servicio[]>(() => {
    const id = this.idProfesional();
    if (!id) return this.servicios();
    const pro = this.profesionales().find(p => p.id_profesional === id);
    if (!pro?.servicios?.length) return this.servicios(); // sin restricción → todos
    const set = new Set(pro.servicios.map(s => s.id_servicio));
    return this.servicios().filter(s => set.has(s.id_servicio));
  });

  /** Los servicios marcados, en el orden en que se marcaron (decide dónde cae una espera). */
  readonly serviciosElegidos = computed<Servicio[]>(() => {
    const porId = new Map(this.servicios().map(s => [s.id_servicio, s]));
    return Array.from(this.idServicios()).map(id => porId.get(id)).filter((s): s is Servicio => !!s);
  });

  /** Duración y precio de un servicio con su variante o su cotización: lo que el backend cobrará. */
  efectivo(s: Servicio): { duracion: number; precio: number } {
    let duracion = s.duracion_min;
    let precio = Number(s.precio);
    const idVar = this.variantesElegidas()[s.id_servicio];
    const v = this.conVariantes() && idVar ? s.variantes?.find(x => x.id_variante === idVar) : null;
    if (v) { duracion = v.duracion_min; precio = Number(v.precio); }
    const a = this.conCotizar() && s.a_cotizar ? this.ajustes()[s.id_servicio] : null;
    if (a?.duracion_min) duracion = a.duracion_min;
    if (a?.precio != null) precio = a.precio;
    return { duracion, precio };
  }

  readonly duracionTotal = computed<number>(() =>
    this.serviciosElegidos().reduce((acc, s) => acc + this.efectivo(s).duracion, 0));

  readonly montoTotal = computed<number>(() =>
    this.serviciosElegidos().reduce((acc, s) => acc + this.efectivo(s).precio, 0));

  /** Lo que viaja al backend: solo de servicios marcados y con la función encendida. */
  readonly variantesPayload = computed<Record<number, number> | null>(() => {
    if (!this.conVariantes()) return null;
    const salida: Record<number, number> = {};
    for (const s of this.serviciosElegidos()) {
      const v = this.variantesElegidas()[s.id_servicio];
      if (v && s.variantes?.some(x => x.id_variante === v)) salida[s.id_servicio] = v;
    }
    return Object.keys(salida).length ? salida : null;
  });

  readonly ajustesPayload = computed(() => {
    if (!this.conCotizar()) return null;
    const lista = this.serviciosElegidos()
      .filter(s => s.a_cotizar && this.ajustes()[s.id_servicio])
      .map(s => ({ id_servicio: s.id_servicio, ...this.ajustes()[s.id_servicio] }))
      .filter(a => a.precio != null || a.duracion_min != null);
    return lista.length ? lista : null;
  });

  /** Con la función de mascotas, la cita necesita una: elegida o descrita. */
  readonly mascotaLista = computed(() =>
    !this.conMascotas() || this.modoEdicion() || !!this.idMascota() || !!this.mascotaNueva().nombre.trim());

  readonly diasChips = computed<DiaChip[]>(() => {
    const hoy = this.hoyISO();
    return this.dias().map(d => {
      // Se ancla a mediodía para que el Date caiga en el día correcto sea cual sea la zona.
      const f = new Date(`${d.fecha}T12:00:00`);
      return {
        ...d,
        diaSemana: f.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''),
        diaMes: String(f.getDate()),
        mes: f.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
        esHoy: d.fecha === hoy,
      };
    });
  });

  readonly diaSeleccionado = computed<DiaDisponible | null>(() =>
    this.dias().find(d => d.fecha === this.fecha()) ?? null,
  );

  /** Se puede retroceder mientras la ventana no empiece hoy o antes. */
  readonly puedeRetroceder = computed(() => this.ventanaInicio() > this.hoyISO());

  readonly slotsManana = computed(() => this.slots().filter(s => Number(s.hora.slice(0, 2)) < 12));
  readonly slotsTarde  = computed(() => this.slots().filter(s => Number(s.hora.slice(0, 2)) >= 12));
  readonly haySlotsLibres = computed(() => this.slots().some(s => s.disponible));

  readonly listoParaSlots = computed(() =>
    this.idProfesional() != null && this.idServicios().size > 0 && !!this.fecha(),
  );

  /**
   * Al editar no se pide el nombre del cliente: ya lo tiene la cita y este formulario no lo
   * toca. Exigirlo obligaría a rellenar un campo que ni siquiera se muestra.
   */
  readonly listoParaGuardar = computed(() =>
    this.listoParaSlots()
    && !!this.slotElegido()
    && (this.modoEdicion() || !!this.cliente().nombre.trim())
    && this.mascotaLista(),
  );

  /**
   * Qué falta para poder buscar horas, nombrado.
   *
   * Los pasos no se completan en orden: es normal elegir profesional y día y saltarse los
   * servicios, y entonces el paso «Hora» se quedaba con un aviso genérico —«elige profesional,
   * servicios y día»— que no dice cuál de los tres es el que falta. Sin servicios no hay
   * duración, y sin duración no hay huecos que calcular; por eso se menciona primero.
   */
  readonly queFaltaParaSlots = computed(() => {
    const faltan: string[] = [];
    if (this.idProfesional() == null) faltan.push('un profesional');
    if (this.idServicios().size === 0) faltan.push('al menos un servicio');
    if (!this.fecha()) faltan.push('el día');

    if (faltan.length === 0) return '';
    if (faltan.length === 1) {
      return faltan[0] === 'al menos un servicio'
        ? 'Falta elegir el servicio (paso 2): la duración de la cita sale de ahí, y sin ella no se pueden calcular las horas libres.'
        : `Falta elegir ${faltan[0]} para ver las horas libres.`;
    }
    const ultimo = faltan.pop()!;
    return `Falta elegir ${faltan.join(', ')} y ${ultimo} para ver las horas libres.`;
  });

  constructor() {
    // Los días dependen del profesional y de la ventana; los slots, además, de la fecha y los
    // servicios. Dos efectos con clave propia en vez de encadenar callbacks por cada control.
    effect(() => {
      if (!this.abierto()) return;
      const clave = `${this.idProfesional() ?? 'gen'}|${this.ventanaInicio()}`;
      if (!this.ventanaInicio() || clave === this.ultimaClaveDias) return;
      this.ultimaClaveDias = clave;
      this.cargarDias();
    });

    effect(() => {
      if (!this.abierto()) return;
      const ids = Array.from(this.idServicios()).sort().join(',');
      // La variante y la duración acordada cambian qué horas caben: son parte de la clave.
      const perfil = JSON.stringify([this.variantesPayload(), this.ajustesPayload()]);
      const clave = `${this.idProfesional()}|${ids}|${this.fecha()}|${perfil}`;
      if (!this.listoParaSlots()) { this.ultimaClaveSlots = ''; this.slots.set([]); return; }
      if (clave === this.ultimaClaveSlots) return;
      this.ultimaClaveSlots = clave;
      this.cargarSlots();
    });
  }

  ngOnInit() {
    // El catálogo se pide una vez y se queda; el prellenado no lo necesita para nada porque
    // guarda ids, no objetos. Las fechas por defecto las pone `prepararApertura()` al abrir,
    // y ponerlas también aquí borraría el prellenado: en el primer ciclo `ngOnChanges` corre
    // ANTES que `ngOnInit`.
    this.cargarCatalogo();
  }

  ngOnChanges(cambios: SimpleChanges) {
    // El negocio llega tarde.
    //
    // El padre pasa `[idNegocio]="idNegocio()"`, un `computed` que vale 0 mientras no hay
    // sesión: en el prerender siempre, y en el navegador durante el primer ciclo. Con ese 0 el
    // catálogo se pedía igual, el backend respondía 400 y el usuario veía «No se pudo cargar el
    // catálogo» nada más entrar —un error de una petición que nunca debió salir—. Ahora se
    // espera a saber de qué negocio se habla.
    if (cambios['idNegocio'] && this.idNegocio) this.cargarCatalogo();

    const open = cambios['open'];
    if (!open) return;
    const seAbre = open.currentValue === true && open.previousValue !== true;
    if (seAbre) this.prepararApertura();
  }

  /**
   * Deja el formulario listo para lo que toque: en blanco si es una cita nueva, o con lo que
   * ya tiene la cita si se está editando.
   *
   * Se vacían las claves de caché de días y slots para forzar su recarga: la cita editada
   * puede caer en otro profesional y otra fecha que las de la última apertura, y sin esto los
   * `effect` verían la misma clave y no pedirían nada.
   */
  private prepararApertura() {
    const cita = this.citaSig();
    this.ultimaClaveSlots = '';
    this.ultimaClaveDias = '';

    if (!cita) {
      this.limpiarCampos();
      return;
    }

    const fechaCita = fechaBogota(cita.fecha_hora_inicio);
    this.idProfesional.set(cita.id_profesional ?? null);
    this.idServicios.set(new Set((cita.servicios || []).map(s => s.id_servicio)));
    this.fecha.set(fechaCita);
    // La tira de días arranca en la fecha de la cita, tanto si es futura como pasada. Anclarla
    // a hoy dejaba fuera de la ventana el día de una cita antigua, y `cargarDias` —que salta
    // al primer día abierto cuando el elegido no está en la lista— la movía sola: editar una
    // cita de la semana pasada mostraba la fecha de hoy, no la suya.
    this.ventanaInicio.set(fechaCita);
    this.horaDeseada = horaBogota(cita.fecha_hora_inicio);
    this.slotElegido.set(this.horaDeseada);
    this.cliente.set({
      nombre: cita.cliente_nombre || '',
      telefono: cita.cliente_telefono || '',
      email: cita.cliente_email || '',
      notas: cita.notas || '',
    });

    // Lo que la cita ya tiene de su perfil: la variante de cada servicio, lo acordado en los
    // servicios a cotizar y la mascota. Sin esto, editar la devolvería a los precios de lista.
    const variantes: Record<number, number> = {};
    const ajustes: Record<number, { precio: number | null; duracion_min: number | null }> = {};
    for (const l of cita.servicios || []) {
      if (l.id_variante) variantes[l.id_servicio] = l.id_variante;
      if (l.servicio?.a_cotizar) {
        ajustes[l.id_servicio] = { precio: Number(l.precio_snapshot), duracion_min: l.duracion_snapshot_min };
      }
    }
    this.variantesElegidas.set(variantes);
    this.ajustes.set(ajustes);
    this.idMascota.set(cita.id_mascota ?? null);
    if (this.conMascotas() && cita.id_persona_negocio) this.cargarMascotas(cita.id_persona_negocio);
  }

  private limpiarCampos() {
    this.horaDeseada = null;
    this.idProfesional.set(null);
    this.idServicios.set(new Set());
    this.fecha.set(this.hoyISO());
    this.ventanaInicio.set(this.hoyISO());
    this.slots.set([]);
    this.slotElegido.set(null);
    this.cliente.set({ nombre: '', telefono: '', email: '', notas: '' });
    // Y el reconocimiento: si no se borra, el aviso del cliente anterior sigue en pantalla
    // sobre un formulario vacío.
    this.clienteConocido.set(null);
    if (this.buscaCliente) { clearTimeout(this.buscaCliente); this.buscaCliente = null; }
    this.variantesElegidas.set({});
    this.ajustes.set({});
    this.mascotasCliente.set([]);
    this.idMascota.set(null);
    this.mascotaNueva.set({ nombre: '', especie: 'PERRO', tamano: '', raza: '' });
  }

  /** Sin negocio no hay catálogo que pedir; se reintenta cuando `idNegocio` llega. */
  private cargarCatalogo() {
    if (!this.idNegocio || this.catalogoPedido) return;
    this.catalogoPedido = true;
    this.cargandoCatalogo.set(true);
    forkJoin({
      pros: this.api.listarProfesionales(this.idNegocio),
      svs:  this.api.listarServicios(this.idNegocio),
    }).subscribe({
      next: ({ pros, svs }) => {
        if (pros?.success && pros.data) this.profesionales.set(pros.data);
        if (svs?.success && svs.data)   this.servicios.set(svs.data);
        this.cargandoCatalogo.set(false);
      },
      error: () => {
        // Se permite reintentar: si falló por un corte de red, el siguiente cambio de entrada
        // vuelve a pedirlo en vez de dejar el formulario sin profesionales para siempre.
        this.catalogoPedido = false;
        this.toast.error('No se pudo cargar el catálogo.');
        this.cargandoCatalogo.set(false);
      },
    });
  }

  private cargarDias() {
    const desde = this.ventanaInicio();
    if (!desde || !this.idNegocio) return;
    this.cargandoDias.set(true);
    this.api.diasDisponibles({
      idNegocio: this.idNegocio,
      idProfesional: this.idProfesional(),
      desde,
      hasta: this.sumarDias(desde, DIAS_VENTANA - 1),
    }).subscribe({
      next: r => {
        const dias = r?.data ?? [];
        this.dias.set(dias);
        this.cargandoDias.set(false);
        // Si la fecha elegida quedó cerrada para este profesional, se salta al primer día
        // abierto de la ventana en vez de dejar al usuario en un día sin horas.
        const actual = dias.find(d => d.fecha === this.fecha());
        if (!actual || !actual.abierto) {
          const primero = dias.find(d => d.abierto);
          this.fecha.set(primero?.fecha ?? '');
          this.slotElegido.set(null);
        }
      },
      error: () => {
        this.toast.error('No se pudieron cargar los días de atención.');
        this.cargandoDias.set(false);
      },
    });
  }

  private cargarSlots() {
    this.buscandoSlots.set(true);
    // La hora que el usuario ya había elegido —aquí o en la cita que se edita— se recupera si
    // el nuevo profesional (o el nuevo servicio) la tiene libre.
    const horaPrevia = this.horaDeseada ?? this.slotElegido();
    // La hora que la cita YA ocupa se acepta aunque la lista la marque no disponible: para una
    // cita pasada todos sus slots incumplen la anticipación mínima, y descartarla dejaría el
    // formulario sin la hora guardada, que es justo lo que se viene a consultar.
    const horaPropia = this.modoEdicion() && this.citaSig()
      ? horaBogota(this.citaSig()!.fecha_hora_inicio)
      : null;
    this.slotElegido.set(null);
    this.api.disponibilidad({
      idNegocio:     this.idNegocio,
      idProfesional: this.idProfesional()!,
      idServicios:   Array.from(this.idServicios()),
      fecha:         this.fecha(),
      // La cita que se edita no se estorba a sí misma.
      excluirCita:   this.citaSig()?.id_cita ?? null,
      variantes:     this.variantesPayload(),
      ajustes:       this.ajustesPayload(),
    }).subscribe({
      next: r => {
        const slots = r?.data?.slots ?? [];
        this.slots.set(slots);
        const sirve = (h: string | null) =>
          !!h && slots.some(s => s.hora === h && (s.disponible || h === horaPropia));
        if (sirve(horaPrevia)) {
          this.slotElegido.set(horaPrevia);
        } else if (sirve(horaPropia)) {
          this.slotElegido.set(horaPropia);
        }
        this.buscandoSlots.set(false);
      },
      error: () => {
        this.slots.set([]);
        this.toast.error('No se pudieron cargar los horarios disponibles.');
        this.buscandoSlots.set(false);
      },
    });
  }

  /**
   * Cambiar de profesional **no** borra lo demás.
   *
   * Antes sí: al cambiar de estilista se perdían los servicios y el día y la hora, aunque la
   * otra persona los ofreciera a la misma hora. Ahora solo se sueltan los servicios que el
   * nuevo profesional no presta —esos no puede heredarlos— y se avisa de cuáles fueron. El día
   * se conserva siempre; la hora la reconfirma `cargarSlots` contra la agenda real del nuevo,
   * que es quien sabe si sigue libre.
   */
  setProfesional(idRaw: string) {
    const id = idRaw === '' ? null : Number(idRaw);
    this.idProfesional.set(id);

    const ofrecidos = new Set(this.serviciosOfrecidos().map(s => s.id_servicio));
    const previos = Array.from(this.idServicios());
    const siguen = previos.filter(x => ofrecidos.has(x));

    if (siguen.length !== previos.length) {
      const nombres = this.servicios()
        .filter(s => previos.includes(s.id_servicio) && !ofrecidos.has(s.id_servicio))
        .map(s => s.nombre);
      this.toast.warning(
        `${nombres.join(', ')}: no lo ofrece ${this.auth.termino('profesional', true)} que elegiste.`,
      );
    }
    this.idServicios.set(new Set(siguen));

    // Los huecos se recalculan solos (el efecto ve el cambio de profesional). Se vacía la lista
    // para no enseñar un instante los del anterior, pero la hora deseada sigue viva.
    this.slots.set([]);
    this.slotElegido.set(null);
  }

  toggleServicio(id: number) {
    this.idServicios.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    this.slotElegido.set(null);
    this.aplicarTamanoMascota();
  }

  elegirVariante(idServicio: number, idVarianteRaw: string) {
    this.variantesElegidas.update(v => {
      const next = { ...v };
      if (idVarianteRaw) next[idServicio] = Number(idVarianteRaw); else delete next[idServicio];
      return next;
    });
    this.slotElegido.set(null);
  }

  ajustar(idServicio: number, campo: 'precio' | 'duracion_min', valor: string) {
    this.ajustes.update(a => {
      const actual = a[idServicio] ?? { precio: null, duracion_min: null };
      const n = valor === '' ? null : Number(valor);
      return { ...a, [idServicio]: { ...actual, [campo]: Number.isFinite(n as number) ? n : null } };
    });
    this.slotElegido.set(null);
  }

  // ── Mascotas ──
  private cargarMascotas(idPersona: string) {
    this.perfilApi.mascotasDeCliente(this.idNegocio, idPersona).subscribe({
      next: r => {
        const lista = r?.success && r.data ? r.data : [];
        this.mascotasCliente.set(lista);
        // Con una sola mascota no hay nada que preguntar.
        if (!this.idMascota() && lista.length === 1) this.elegirMascota(lista[0]);
      },
      error: () => this.mascotasCliente.set([]),
    });
  }

  elegirMascota(m: Mascota | null) {
    this.idMascota.set(m?.id_mascota ?? null);
    this.aplicarTamanoMascota();
  }

  setMascotaNueva(campo: 'nombre' | 'especie' | 'tamano' | 'raza', valor: string) {
    this.mascotaNueva.update(m => ({ ...m, [campo]: valor }));
    if (campo === 'tamano') this.aplicarTamanoMascota();
  }

  /**
   * El tamaño de la mascota elige la variante de cada servicio que tenga una con esa clave: el
   * baño de un perro grande cuesta y dura lo del grande, sin que recepción lo adivine.
   */
  private aplicarTamanoMascota() {
    if (!this.conMascotas() || !this.conVariantes()) return;
    const elegida = this.mascotasCliente().find(m => m.id_mascota === this.idMascota());
    const tamano = elegida?.tamano || this.mascotaNueva().tamano;
    if (!tamano) return;
    this.variantesElegidas.update(v => {
      const next = { ...v };
      for (const s of this.serviciosElegidos()) {
        const coincide = s.variantes?.find(x => x.clave === tamano);
        if (coincide?.id_variante) next[s.id_servicio] = coincide.id_variante;
      }
      return next;
    });
  }

  elegirDia(d: DiaDisponible) {
    if (!d.abierto) return;
    this.fecha.set(d.fecha);
    this.slotElegido.set(null);
  }

  moverVentana(delta: number) {
    const hoy = this.hoyISO();
    const destino = this.sumarDias(this.ventanaInicio(), delta * DIAS_VENTANA);
    this.ventanaInicio.set(destino < hoy ? hoy : destino);
  }

  elegirSlot(s: Slot) {
    if (!s.disponible) return;
    this.horaDeseada = s.hora;
    this.slotElegido.set(s.hora);
  }

  setCliente<K extends 'nombre' | 'telefono' | 'email' | 'notas'>(campo: K, valor: string) {
    this.cliente.update(c => ({ ...c, [campo]: valor }));
    if (campo === 'telefono') this.reconocerCliente(valor);
  }

  /**
   * Reconoce al cliente por su teléfono y rellena lo que sepamos de él.
   *
   * El teléfono es la llave de la cartera, así que en cuanto está completo se puede saber si
   * quien llama ya ha venido. Se consulta con el número **tal cual lo escriben** —el servidor
   * lo normaliza a E.164— pero solo cuando ya parece un móvil de diez dígitos: preguntar en
   * cada tecla serían diez peticiones para tirar nueve.
   *
   * **Nunca pisa lo que el usuario ya escribió.** Solo rellena los campos vacíos; si alguien
   * corrigió el nombre a propósito, esa corrección manda y lo que se ve es el aviso de que ya
   * estaba registrado con otro. Machacar un campo escrito a mano es la forma más rápida de que
   * nadie vuelva a fiarse del formulario.
   */
  private reconocerCliente(telefono: string) {
    if (this.buscaCliente) clearTimeout(this.buscaCliente);
    const digitos = (telefono || '').replace(/\D/g, '');
    if (digitos.length < 10) {
      this.clienteConocido.set(null);
      return;
    }

    this.buscaCliente = setTimeout(() => {
      this.api.buscarClientePorTelefono(this.idNegocio, telefono).subscribe({
        next: (r) => {
          const encontrado = r?.data ?? null;
          this.clienteConocido.set(encontrado);
          if (!encontrado) { this.mascotasCliente.set([]); this.idMascota.set(null); return; }
          if (this.conMascotas()) this.cargarMascotas(encontrado.id_persona_negocio);
          this.cliente.update(c => ({
            ...c,
            nombre: c.nombre.trim() ? c.nombre : (encontrado.nombre ?? ''),
            email:  c.email.trim()  ? c.email  : (encontrado.email  ?? ''),
          }));
        },
        // Un rol sin acceso a Clientes recibe 403 aquí: el formulario sigue funcionando
        // exactamente igual, solo que sin reconocer a nadie.
        error: () => this.clienteConocido.set(null),
      });
    }, 400);
  }

  /** Copia el nombre de la ficha sobre lo escrito. Solo se ofrece cuando difieren. */
  usarNombreConocido() {
    const conocido = this.clienteConocido();
    if (!conocido?.nombre) return;
    this.cliente.update(c => ({ ...c, nombre: conocido.nombre! }));
  }

  // Presentación en 12 h. El valor que se guarda y se envía sigue siendo el "HH:MM" de 24 h
  // que devuelve el backend; esto solo traduce lo que se pinta.
  hora12(hhmm: string): string { return aHora12(hhmm); }
  rango12(inicio: string, fin: string): string { return rangoHora12(inicio, fin); }

  /** Franja de atención del día elegido, ya en 12 h: "9:00 AM – 1:00 PM y 2:00 PM – 7:00 PM". */
  readonly jornadaLabel = computed(() => {
    const d = this.diaSeleccionado();
    if (!d?.abierto) return '';
    return d.rangos.map(r => rangoHora12(r.inicio, r.fin)).join(' y ');
  });

  /** Texto del `title` de un día: lo que atiende, o por qué no. */
  tituloDia(d: DiaDisponible): string {
    if (!d.abierto) return 'Cerrado';
    const primero = d.rangos[0];
    const ultimo = d.rangos[d.rangos.length - 1];
    return `Atiende ${rangoHora12(primero.inicio, ultimo.fin)}`;
  }

  /** Un solo botón para las dos operaciones; la que toque la decide `modoEdicion()`. */
  guardar() {
    if (!this.listoParaGuardar()) return;
    if (this.modoEdicion()) this.editar(); else this.crear();
  }

  private editar() {
    const cita = this.citaSig();
    if (!cita) return;
    const fechaHora = `${this.fecha()}T${this.slotElegido()}:00`;
    this.enviando.set(true);

    this.api.actualizarCita(cita.id_cita, {
      id_negocio:        this.idNegocio,
      id_servicios:      Array.from(this.idServicios()),
      id_profesional:    this.idProfesional(),
      fecha_hora_inicio: fechaHora,
      variantes:         this.variantesPayload(),
      ajustes:           this.ajustesPayload(),
      ...(this.conMascotas() && this.idMascota() ? { id_mascota: this.idMascota() } : {}),
    }).subscribe({
      next: r => {
        this.enviando.set(false);
        if (r?.success) {
          this.toast.success(`${this.auth.termino('cita')} actualizada`);
          this.bus.publish('cita_actualizada', r.data);
          this.saved.emit();
          this.cerrar();
        } else {
          this.toast.error(r?.message || 'No se pudo editar la cita.');
        }
      },
      error: e => {
        this.enviando.set(false);
        // Mismo trato que al crear: el backend dice por qué (FUERA_DE_HORARIO, SOBRE_BLOQUEO,
        // SLOT_NO_DISPONIBLE, TRANSICION_INVALIDA) y eso es lo que se muestra.
        this.toast.error(e?.error?.message || 'Error al editar la cita.');
        this.ultimaClaveSlots = '';
        if (this.listoParaSlots()) this.cargarSlots();
      },
    });
  }

  private crear() {
    const fechaHora = `${this.fecha()}T${this.slotElegido()}:00`;
    this.enviando.set(true);
    const c = this.cliente();
    this.api.crearCitaManual({
      id_negocio:        this.idNegocio,
      id_profesional:    this.idProfesional()!,
      id_servicios:      Array.from(this.idServicios()),
      fecha_hora_inicio: fechaHora,
      cliente_nombre:    c.nombre.trim(),
      cliente_telefono:  c.telefono?.trim() || null,
      cliente_email:     c.email?.trim() || null,
      notas:             c.notas?.trim() || null,
      variantes:         this.variantesPayload(),
      ajustes:           this.ajustesPayload(),
      ...(this.conMascotas() ? this.payloadMascota() : {}),
    }).subscribe({
      next: r => {
        this.enviando.set(false);
        if (r?.success) {
          this.toast.success(`${this.auth.termino('cita')} creada`);
          this.bus.publish('cita_creada', r.data);
          this.saved.emit();
          this.cerrar();
        } else {
          this.toast.error(r?.message || 'No se pudo crear la cita.');
        }
      },
      error: e => {
        this.enviando.set(false);
        // El backend explica por qué rechaza (FUERA_DE_HORARIO, SOBRE_BLOQUEO,
        // SLOT_NO_DISPONIBLE). Si se molesta en decirlo, se muestra.
        this.toast.error(e?.error?.message || 'Error al crear la cita.');
        // El slot pudo caducar entre que se listó y se pulsó: se refresca la lista.
        this.ultimaClaveSlots = '';
        if (this.listoParaSlots()) this.cargarSlots();
      },
    });
  }

  private payloadMascota(): { id_mascota?: string; mascota?: { nombre: string; especie?: string; raza?: string; tamano?: string } } {
    if (this.idMascota()) return { id_mascota: this.idMascota()! };
    const m = this.mascotaNueva();
    return {
      mascota: {
        nombre: m.nombre.trim(),
        especie: m.especie || undefined,
        raza: m.raza.trim() || undefined,
        tamano: m.tamano || undefined,
      },
    };
  }

  cerrar() {
    this.limpiarCampos();
    this.citaSig.set(null);
    this.ultimaClaveSlots = '';
    this.ultimaClaveDias = '';
    this.close.emit();
  }

  private hoyISO(): string {
    return this.aISO(new Date());
  }

  private aISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private sumarDias(fechaISO: string, dias: number): string {
    const d = new Date(`${fechaISO}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return this.aISO(d);
  }
}
