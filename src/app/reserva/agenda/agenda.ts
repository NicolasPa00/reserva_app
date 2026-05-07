import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { Cita, Profesional } from '../../core/models';
import { CitaFormComponent } from '../citas/cita-form/cita-form';

interface CitaPosicionada {
  cita: Cita;
  topPx: number;
  heightPx: number;
}

const PIXELS_POR_HORA = 48;
const HORA_INICIO_DEFAULT = 8;
const HORA_FIN_DEFAULT = 20;

@Component({
  selector: 'reserva-agenda',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DatePipe, CitaFormComponent],
  templateUrl: './agenda.html',
  styleUrl: './agenda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly bus   = inject(EventBusService);

  readonly profesionales = signal<Profesional[]>([]);
  readonly citas = signal<Cita[]>([]);
  readonly cargando = signal(false);

  readonly fechaActiva = signal<Date>(new Date());

  readonly horaInicio = HORA_INICIO_DEFAULT;
  readonly horaFin    = HORA_FIN_DEFAULT;
  readonly pxPorHora  = PIXELS_POR_HORA;

  readonly modalNuevaCita = signal(false);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);

  readonly horasGrid = computed(() => {
    const arr: string[] = [];
    for (let h = this.horaInicio; h < this.horaFin; h++) {
      arr.push(`${String(h).padStart(2, '0')}:00`);
    }
    return arr;
  });

  /** Citas posicionadas por columna (id_profesional). */
  readonly citasPorPro = computed<Map<number, CitaPosicionada[]>>(() => {
    const map = new Map<number, CitaPosicionada[]>();
    for (const c of this.citas()) {
      if (c.estado === 'cancelada') continue;
      const ini = new Date(c.fecha_hora_inicio);
      const fin = new Date(c.fecha_hora_fin);
      const minutosDesdeInicio = (ini.getHours() - this.horaInicio) * 60 + ini.getMinutes();
      const duracionMin = (fin.getTime() - ini.getTime()) / 60_000;
      const pos: CitaPosicionada = {
        cita: c,
        topPx: Math.max(0, (minutosDesdeInicio / 60) * this.pxPorHora),
        heightPx: Math.max(20, (duracionMin / 60) * this.pxPorHora - 2),
      };
      const arr = map.get(c.id_profesional) ?? [];
      arr.push(pos);
      map.set(c.id_profesional, arr);
    }
    return map;
  });

  readonly fechaLabel = computed(() => {
    const d = this.fechaActiva();
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  });

  ngOnInit() {
    this.cargar();
    this.bus.on<Cita>('cita_creada').subscribe(() => this.cargar());
    this.bus.on<Cita>('cita_cancelada').subscribe(() => this.cargar());
    this.bus.on<Cita>('cita_pago_aprobado').subscribe(() => this.cargar());
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
        if (pros?.success && pros.data) this.profesionales.set(pros.data);
        if (citas?.success && citas.data) this.citas.set(citas.data);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudo cargar la agenda.'); this.cargando.set(false); },
    });
  }

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

  fechaInputValue(): string {
    const d = this.fechaActiva();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  estadoBadge(c: Cita): string {
    switch (c.estado) {
      case 'confirmada':  return 'b-ok';
      case 'pendiente':   return 'b-warn';
      case 'completada':  return 'b-info';
      case 'no_show':     return 'b-err';
      default:            return 'b-off';
    }
  }
}
