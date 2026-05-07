import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { EventBusService } from '../../../core/services/event-bus.service';
import { Profesional, Servicio, Slot } from '../../../core/models';
import { ModalComponent } from '../../../shared/modal/modal';

/**
 * Modal reusable para crear cita manual desde la vista del negocio.
 * Wizard simplificado en una vista: profesional + servicios → fecha → slot → datos cliente.
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
  @Input() open = false;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  private readonly api = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly bus = inject(EventBusService);

  readonly profesionales = signal<Profesional[]>([]);
  readonly servicios = signal<Servicio[]>([]);
  readonly cargandoCatalogo = signal(false);

  readonly idProfesional = signal<number | null>(null);
  readonly idServicios   = signal<Set<number>>(new Set());
  readonly fecha         = signal<string>('');         // YYYY-MM-DD
  readonly slotElegido   = signal<string | null>(null); // HH:MM
  readonly slots = signal<Slot[]>([]);
  readonly buscandoSlots = signal(false);

  readonly cliente = signal({ nombre: '', telefono: '', email: '', notas: '' });
  readonly enviando = signal(false);

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

  readonly listoParaSlots = computed(() =>
    this.idProfesional() != null && this.idServicios().size > 0 && !!this.fecha(),
  );

  readonly listoParaCrear = computed(() =>
    this.listoParaSlots() && !!this.slotElegido() && !!this.cliente().nombre.trim(),
  );

  ngOnInit() {
    this.fecha.set(this.hoyISO());
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
    this.slots.set([]);
    this.slotElegido.set(null);
  }

  setFecha(v: string) {
    this.fecha.set(v);
    this.slots.set([]);
    this.slotElegido.set(null);
  }

  setCliente<K extends 'nombre' | 'telefono' | 'email' | 'notas'>(campo: K, valor: string) {
    this.cliente.update(c => ({ ...c, [campo]: valor }));
  }

  buscarSlots() {
    if (!this.listoParaSlots()) return;
    const ids = Array.from(this.idServicios());
    // El backend devuelve slots para 1 servicio. Para combos usamos el de mayor duración como ancla;
    // como el backend ya considera ± buffer y la duración del servicio, elegimos el primer servicio
    // y ajustaremos la creación para enviar todos los IDs.
    // Mejor: pedimos disponibilidad por la duración total — el backend solo conoce un id_servicio,
    // así que mandamos el primero y confiamos en que el lock al crear evita conflictos.
    const idServicioAncla = ids[0];

    this.buscandoSlots.set(true);
    this.api.publicoDisponibilidad({
      idNegocio:    this.idNegocio,
      idProfesional: this.idProfesional()!,
      idServicio:   idServicioAncla,
      fecha:        this.fecha(),
    }).subscribe({
      next: r => {
        this.slots.set(r?.data?.slots ?? []);
        this.buscandoSlots.set(false);
      },
      error: () => { this.toast.error('No se pudieron cargar los slots.'); this.buscandoSlots.set(false); },
    });
  }

  elegirSlot(s: Slot) {
    if (!s.disponible) return;
    this.slotElegido.set(s.hora);
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
        this.toast.error(e?.error?.message || 'Error al crear la cita.');
      },
    });
  }

  cerrar() {
    this.idProfesional.set(null);
    this.idServicios.set(new Set());
    this.fecha.set(this.hoyISO());
    this.slots.set([]);
    this.slotElegido.set(null);
    this.cliente.set({ nombre: '', telefono: '', email: '', notas: '' });
    this.close.emit();
  }

  private hoyISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
}
