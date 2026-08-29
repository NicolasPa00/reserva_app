import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output,
  computed, effect, inject, signal,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventBusService } from '../../../core/services/event-bus.service';
import { DiaDisponible, Profesional, Servicio, Slot } from '../../../core/models';
import { aHora12, rangoHora12 } from '../../../core/utils/hora';
import { ModalComponent } from '../../../shared/modal/modal';

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
 */
@Component({
  selector: 'reserva-cita-form',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, CurrencyPipe, ModalComponent],
  templateUrl: './cita-form.html',
  styleUrl: './cita-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CitaFormComponent implements OnInit {
  @Input({ required: true }) idNegocio!: number;
  @Input() set open(v: boolean) { this.abierto.set(v); }
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  private readonly api = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly bus = inject(EventBusService);

  readonly abierto = signal(false);

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
  readonly enviando = signal(false);

  /** Última combinación por la que se pidieron slots; evita repetir la misma consulta. */
  private ultimaClaveSlots = '';
  private ultimaClaveDias = '';

  readonly serviciosOfrecidos = computed<Servicio[]>(() => {
    const id = this.idProfesional();
    if (!id) return this.servicios();
    const pro = this.profesionales().find(p => p.id_profesional === id);
    if (!pro?.servicios?.length) return this.servicios(); // sin restricción → todos
    const set = new Set(pro.servicios.map(s => s.id_servicio));
    return this.servicios().filter(s => set.has(s.id_servicio));
  });

  readonly duracionTotal = computed<number>(() => {
    const set = this.idServicios();
    return this.servicios().reduce(
      (acc, s) => set.has(s.id_servicio) ? acc + s.duracion_min : acc, 0,
    );
  });

  readonly montoTotal = computed<number>(() => {
    const set = this.idServicios();
    return this.servicios().reduce(
      (acc, s) => set.has(s.id_servicio) ? acc + Number(s.precio) : acc, 0,
    );
  });

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

  readonly listoParaCrear = computed(() =>
    this.listoParaSlots() && !!this.slotElegido() && !!this.cliente().nombre.trim(),
  );

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
      const clave = `${this.idProfesional()}|${ids}|${this.fecha()}`;
      if (!this.listoParaSlots()) { this.ultimaClaveSlots = ''; this.slots.set([]); return; }
      if (clave === this.ultimaClaveSlots) return;
      this.ultimaClaveSlots = clave;
      this.cargarSlots();
    });
  }

  ngOnInit() {
    this.fecha.set(this.hoyISO());
    this.ventanaInicio.set(this.hoyISO());
    this.cargarCatalogo();
  }

  private cargarCatalogo() {
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
      error: () => { this.toast.error('No se pudo cargar el catálogo.'); this.cargandoCatalogo.set(false); },
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
    this.slotElegido.set(null);
    this.api.disponibilidad({
      idNegocio:     this.idNegocio,
      idProfesional: this.idProfesional()!,
      idServicios:   Array.from(this.idServicios()),
      fecha:         this.fecha(),
    }).subscribe({
      next: r => {
        this.slots.set(r?.data?.slots ?? []);
        this.buscandoSlots.set(false);
      },
      error: () => {
        this.slots.set([]);
        this.toast.error('No se pudieron cargar los horarios disponibles.');
        this.buscandoSlots.set(false);
      },
    });
  }

  setProfesional(idRaw: string) {
    const id = idRaw === '' ? null : Number(idRaw);
    this.idProfesional.set(id);
    this.idServicios.set(new Set());
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
    this.slotElegido.set(s.hora);
  }

  setCliente<K extends 'nombre' | 'telefono' | 'email' | 'notas'>(campo: K, valor: string) {
    this.cliente.update(c => ({ ...c, [campo]: valor }));
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

  crear() {
    if (!this.listoParaCrear()) return;
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
    }).subscribe({
      next: r => {
        this.enviando.set(false);
        if (r?.success) {
          this.toast.success('Cita creada');
          this.bus.publish('cita_creada', r.data);
          this.created.emit();
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

  cerrar() {
    this.idProfesional.set(null);
    this.idServicios.set(new Set());
    this.fecha.set(this.hoyISO());
    this.ventanaInicio.set(this.hoyISO());
    this.slots.set([]);
    this.slotElegido.set(null);
    this.cliente.set({ nombre: '', telefono: '', email: '', notas: '' });
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
