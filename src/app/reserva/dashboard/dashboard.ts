import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { EventBusService } from '../../core/services/event-bus.service';
import { Cita, CitaResumen, EstadoCita, ResumenDashboard } from '../../core/models';
import { CitaFormComponent } from '../citas/cita-form/cita-form';
import { ESTADO_LABELS, badgeEstado } from '../../shared/cita-detalle/cita-detalle';
import { colorDeEntidad } from '../../core/utils/color-entidad';
import { MonedaPipe } from '../../shared/moneda.pipe';
import { MonedaService } from '../../core/services/moneda.service';

interface Kpi {
  label: string;
  valor: string;
  detalle: string;
  icon: string;
  tono: 'neutro' | 'exito' | 'alerta' | 'primario';
  ruta?: string;
}

/**
 * Pantalla de entrada del negocio.
 *
 * Antes eran siete contadores sueltos en una rejilla, y esa forma tiene un problema que no es
 * estético: un número sin comparación no se puede leer. «3 citas» no dice si el día va bien o
 * mal, y con el negocio recién abierto —siete ceros en fila— la pantalla parecía rota.
 *
 * Ahora responde a las tres preguntas que alguien se hace al abrir la persiana: **qué tengo
 * hoy** (la agenda del día, con nombre y hora), **cómo va el día** (ocupación real sobre el
 * horario laboral, no sobre 24 h) y **qué me falta por hacer** (pagos por validar, citas sin
 * confirmar), cada una enlazando a la pantalla donde se resuelve. Los contadores siguen ahí,
 * pero como contexto de esas tres respuestas.
 */
@Component({
  selector: 'reserva-dashboard',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MonedaPipe, DecimalPipe, DatePipe, CitaFormComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ReservaApiService);
  private readonly monedas = inject(MonedaService);
  private readonly bus = inject(EventBusService);
  private readonly router = inject(Router);

  readonly resumen = signal<ResumenDashboard | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly modalNuevaCita = signal(false);
  /** Cita que está editando el formulario; `null` = está creando una nueva. */
  readonly citaEditando = signal<Cita | null>(null);
  readonly abriendoEdicion = signal<number | null>(null);

  private readonly tieneAccionEditar = computed(() => this.auth.puedeAccion('citas_editar'));

  /**
   * Una cita cerrada no se edita: la completada ya pasó por caja con su monto, y moverlo
   * descuadraría el turno.
   */
  puedeEditarCita(c: CitaResumen): boolean {
    return this.tieneAccionEditar() && (c.estado === 'pendiente' || c.estado === 'confirmada');
  }

  /**
   * Abre el formulario sobre una cita de la agenda del día.
   *
   * La fila del dashboard es un `CitaResumen` —lo justo para pintar la línea de tiempo, con
   * los servicios como texto— así que hay que traerse la cita completa antes de editarla: el
   * formulario necesita los ids de los servicios, no sus nombres.
   */
  editarCita(c: CitaResumen) {
    if (!this.puedeEditarCita(c) || this.abriendoEdicion() !== null) return;
    const idNegocio = this.idNegocio();
    if (!idNegocio) return;

    this.abriendoEdicion.set(c.id_cita);
    this.api.getCita(c.id_cita, idNegocio).subscribe({
      next: r => {
        this.abriendoEdicion.set(null);
        if (r?.success && r.data) {
          this.citaEditando.set(r.data);
          this.modalNuevaCita.set(true);
        }
      },
      error: () => this.abriendoEdicion.set(null),
    });
  }

  cerrarFormulario() {
    this.modalNuevaCita.set(false);
    this.citaEditando.set(null);
  }

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);

  /**
   * Sin plan vigente el dashboard es la única vista que abre: `planGuard` bloquea el resto.
   *
   * Antes eso ocurría en silencio —el menú simplemente no llevaba a ninguna parte— porque la
   * redirección a `/sin-plan` la rebotaba `permissionGuard`. Aquí se dice en la propia pantalla
   * a la que el usuario acaba volviendo, que es donde tiene sentido leerlo.
   */
  readonly sinPlan = computed(() => !this.auth.planActivo());
  readonly adminUrl = environment.adminUrl;

  readonly saludo = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  });

  readonly hoyLabel = computed(() =>
    new Date().toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }),
  );

  /** Los cuatro números que encabezan la pantalla. */
  readonly kpis = computed<Kpi[]>(() => {
    const r = this.resumen();
    if (!r) return [];
    const ocup = r.ocupacion_hoy;
    return [
      {
        label: 'Citas hoy',
        valor: String(r.citas_hoy),
        detalle: r.citas_hoy === 0
          ? 'Agenda libre'
          : `${r.citas_confirmadas} confirmadas · ${r.citas_pendientes} pendientes`,
        icon: 'calendar-days',
        tono: 'primario',
        ruta: '/agenda',
      },
      {
        label: 'Ingresos de hoy',
        valor: this.formatoMoneda(r.ingresos_hoy),
        detalle: `${this.formatoMoneda(r.semana.ingresos)} en 7 días`,
        icon: 'trending-up',
        tono: 'exito',
      },
      {
        label: 'Ocupación',
        valor: ocup.porcentaje == null ? '—' : `${ocup.porcentaje}%`,
        detalle: ocup.porcentaje == null
          ? 'Falta configurar horarios'
          : `${this.formatoHoras(ocup.minutos_ocupados)} de ${this.formatoHoras(ocup.minutos_disponibles)}`,
        icon: 'gauge',
        tono: 'neutro',
        ruta: ocup.porcentaje == null ? '/horarios' : undefined,
      },
      {
        label: 'Pagos por validar',
        valor: String(r.pagos_pendientes_validacion),
        detalle: r.pagos_pendientes_validacion > 0 ? 'Requieren tu revisión' : 'Todo al día',
        icon: 'credit-card',
        tono: r.pagos_pendientes_validacion > 0 ? 'alerta' : 'neutro',
        ruta: r.pagos_pendientes_validacion > 0 ? '/citas' : undefined,
      },
    ];
  });

  /** Barra de ocupación: se corta en 100 aunque el solape puntual la pase. */
  readonly ocupacionPct = computed(() => this.resumen()?.ocupacion_hoy.porcentaje ?? 0);

  readonly agenda = computed<CitaResumen[]>(() => this.resumen()?.agenda_hoy ?? []);

  /** La siguiente cita que aún no ha empezado; ancla la lista para saber por dónde va el día. */
  readonly proximaCita = computed<CitaResumen | null>(() => {
    const ahora = Date.now();
    return this.agenda().find(c => new Date(c.fecha_hora_inicio).getTime() >= ahora) ?? null;
  });

  readonly maxCitasServicio = computed(() =>
    Math.max(1, ...(this.resumen()?.top_servicios ?? []).map(s => s.citas)),
  );

  readonly tareasPendientes = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    const out: { texto: string; ruta: string; icon: string; urgente: boolean }[] = [];
    if (r.pagos_pendientes_validacion > 0) {
      out.push({
        texto: `${r.pagos_pendientes_validacion} pago(s) esperando validación`,
        ruta: '/citas', icon: 'credit-card', urgente: true,
      });
    }
    if (r.citas_pendientes > 0) {
      out.push({
        texto: `${r.citas_pendientes} cita(s) de hoy sin confirmar`,
        ruta: '/agenda', icon: 'clock', urgente: false,
      });
    }
    if (r.ocupacion_hoy.porcentaje == null) {
      out.push({
        texto: 'Aún no has definido el horario de atención',
        ruta: '/horarios', icon: 'calendar-cog', urgente: true,
      });
    }
    if (r.total_profesionales === 0) {
      out.push({ texto: 'Registra a tu primer profesional', ruta: '/profesionales', icon: 'users', urgente: true });
    }
    if (r.total_servicios === 0) {
      out.push({ texto: 'Crea tu primer servicio', ruta: '/servicios', icon: 'scissors', urgente: true });
    }
    return out;
  });

  ngOnInit(): void {
    this.cargar();
    this.bus.on('cita_creada').subscribe(() => this.cargar());
    this.bus.on('cita_actualizada').subscribe(() => this.cargar());
    this.bus.on('cita_cancelada').subscribe(() => this.cargar());
    this.bus.on('cita_pago_aprobado').subscribe(() => this.cargar());
  }

  cargar() {
    const idNegocio = this.idNegocio();
    if (!idNegocio) return;
    this.cargando.set(true);
    this.error.set(null);
    this.api.getResumen(idNegocio).subscribe({
      next: r => {
        if (r?.success && r.data) this.resumen.set(r.data);
        else this.error.set(r?.message || 'No se pudo cargar el resumen.');
        this.cargando.set(false);
      },
      error: () => { this.error.set('Error de conexión.'); this.cargando.set(false); },
    });
  }

  ir(ruta?: string) { if (ruta) this.router.navigate([ruta]); }

  estadoLabel(e: EstadoCita): string { return ESTADO_LABELS[e] ?? e; }
  badgeEstado(e: EstadoCita): string { return badgeEstado(e); }

  esPasada(c: CitaResumen): boolean {
    return new Date(c.fecha_hora_fin).getTime() < Date.now();
  }

  private formatoMoneda(v: number): string {
    return this.monedas.formatear(v || 0);
  }

  private formatoHoras(min: number): string {
    if (!min) return '0 h';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
