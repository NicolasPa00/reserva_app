import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { duracionLegible, ventanaEnMinutos } from '../../../core/utils/duracion';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { VitrinaStore } from '../vitrina.store';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { CitaPublica, EstanciaPublica } from '../../../core/models';
import { aHora12, horaBogota } from '../../../core/utils/hora';
import { normalizarEntradaCodigo } from '../../../core/utils/codigo-cita';
import { MonedaPipe } from '../../../shared/moneda.pipe';

/**
 * Consulta y cancelación de una cita con su código público.
 *
 * ## Por qué el código y no una cuenta
 *
 * Obligar a registrarse para reservar en una barbería es la forma más rápida de perder al
 * cliente. El código (8 caracteres legibles) es la credencial: quien lo tiene es quien reservó.
 * Por eso no se
 * enumera —no hay listado por teléfono ni por correo—, y por eso la cancelación exige tenerlo.
 *
 * ## La ventana de cancelación la decide el backend
 *
 * Aquí solo se muestra el texto informativo. Si el cliente intenta cancelar fuera de plazo, es
 * el servidor quien lo rechaza y ese mensaje es el que se enseña: duplicar la regla en el
 * cliente sería una segunda copia que se desincroniza en cuanto el negocio cambie el ajuste.
 */
@Component({
  selector: 'reserva-publico-mi-cita',
  standalone: true,
  imports: [LucideAngularModule, MonedaPipe, DatePipe, RouterLink],
  templateUrl: './mi-cita.html',
  styleUrl: './mi-cita.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoMiCitaComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservaApiService);
  readonly store = inject(VitrinaStore);

  readonly raiz = computed(() => `/p/${this.store.negocio()?.id_negocio ?? ''}`);

  readonly codigo = signal('');
  /** Lo encontrado por el código: una cita o, en un alojamiento, una estancia. */
  readonly reserva = signal<CitaPublica | EstanciaPublica | null>(null);
  readonly cita = computed<CitaPublica | null>(() => {
    const r = this.reserva();
    return r && !('tipo' in r && r.tipo === 'estancia') ? (r as CitaPublica) : null;
  });
  readonly estancia = computed<EstanciaPublica | null>(() => {
    const r = this.reserva();
    return r && 'tipo' in r && r.tipo === 'estancia' ? r : null;
  });
  /** «cita», «sesión», «reserva»: como llama este negocio a lo que se consulta aquí. */
  readonly termino = computed(() => this.store.terminos().cita.toLocaleLowerCase('es-CO'));
  readonly buscando = signal(false);
  readonly error = signal<string | null>(null);

  readonly cancelando = signal(false);
  readonly confirmandoCancelacion = signal(false);
  readonly mensaje = signal<string | null>(null);

  /** «1 hora», «72 horas»: la ventana de cancelación como la lee el cliente (en minutos desde 2026-09-29). */
  readonly ventanaCancelacion = computed(() => {
    const m = ventanaEnMinutos(this.store.reglas());
    return m ? duracionLegible(m) : null;
  });

  /** Una cita ya cancelada, completada o marcada como inasistencia no se puede tocar. */
  readonly cancelable = computed(() => {
    const c = this.reserva();
    return !!c && (c.estado === 'pendiente' || c.estado === 'confirmada');
  });

  readonly etiquetaEstado = computed(() => {
    switch (this.reserva()?.estado) {
      case 'en_curso':    return 'En curso';
      case 'finalizada':  return 'Finalizada';
      case 'pendiente':   return 'Pendiente de confirmar';
      case 'confirmada':  return 'Confirmada';
      case 'completada':  return 'Completada';
      case 'cancelada':   return 'Cancelada';
      case 'no_show':     return this.estancia() ? 'No llegaste' : 'No asististe';
      default:            return '';
    }
  });

  ngOnInit(): void {
    this.store.cargar(Number(this.route.parent?.snapshot.paramMap.get('id_negocio')));

    // Se llega aquí desde la confirmación con `?codigo=`: buscar sola ahorra un tecleo manual
    // en el momento en que el cliente está más impaciente.
    const codigo = this.route.snapshot.queryParamMap.get('codigo');
    if (codigo) { this.codigo.set(normalizarEntradaCodigo(codigo)); this.buscar(); }
  }

  /** Pone en limpio lo que se escribe: mayúsculas y el guion en su sitio. */
  escribirCodigo(valor: string): void {
    this.codigo.set(normalizarEntradaCodigo(valor));
  }

  hora12(fechaHora: string | null | undefined): string {
    if (!fechaHora) return '';
    // La API entrega el instante en UTC (`…T20:30:00.000Z`): recortar el texto mostraba la hora
    // UTC, cinco horas de más. Se convierte a la hora de pared del negocio, como la fecha de arriba.
    return aHora12(horaBogota(fechaHora));
  }

  buscar(): void {
    const codigo = this.codigo().trim();
    if (!codigo) return;

    this.buscando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.reserva.set(null);

    this.api.publicoConsultarCita(codigo).subscribe({
      next: r => {
        this.buscando.set(false);
        if (r?.success && r.data) this.reserva.set(r.data);
        else this.error.set(r?.message || 'No encontramos ninguna cita con ese código.');
      },
      error: err => {
        this.buscando.set(false);
        this.error.set(err?.status === 404 || err?.status === 422
          ? 'No encontramos ninguna cita con ese código. Revísalo, por favor.'
          : 'No pudimos consultar la cita. Inténtalo de nuevo.');
      },
    });
  }

  cancelar(): void {
    const codigo = this.codigo().trim();
    if (!codigo || !this.cancelable()) return;

    this.cancelando.set(true);
    this.error.set(null);

    this.api.publicoCancelarCita(codigo).subscribe({
      next: r => {
        this.cancelando.set(false);
        this.confirmandoCancelacion.set(false);
        if (r?.success) {
          this.mensaje.set(`Tu ${this.termino()} quedó cancelada.`);
          this.reserva.update(c => (c ? ({ ...c, estado: 'cancelada' } as typeof c) : c));
        } else {
          this.error.set(r?.message || 'No pudimos cancelar la cita.');
        }
      },
      error: err => {
        this.cancelando.set(false);
        this.confirmandoCancelacion.set(false);
        this.error.set(err?.error?.message || 'No pudimos cancelar la cita.');
      },
    });
  }
}
