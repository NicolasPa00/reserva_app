import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { VitrinaStore } from '../vitrina.store';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { CitaPublica } from '../../../core/models';
import { aHora12 } from '../../../core/utils/hora';

/**
 * Consulta y cancelación de una cita con su código público.
 *
 * ## Por qué el código y no una cuenta
 *
 * Obligar a registrarse para reservar en una barbería es la forma más rápida de perder al
 * cliente. El código (un UUID) es la credencial: quien lo tiene es quien reservó. Por eso no se
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
  imports: [LucideAngularModule, CurrencyPipe, DatePipe, RouterLink],
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
  readonly cita = signal<CitaPublica | null>(null);
  readonly buscando = signal(false);
  readonly error = signal<string | null>(null);

  readonly cancelando = signal(false);
  readonly confirmandoCancelacion = signal(false);
  readonly mensaje = signal<string | null>(null);

  readonly ventanaHoras = computed(() => this.store.reglas()?.ventana_cancelacion_horas ?? null);

  /** Una cita ya cancelada, completada o marcada como inasistencia no se puede tocar. */
  readonly cancelable = computed(() => {
    const c = this.cita();
    return !!c && (c.estado === 'pendiente' || c.estado === 'confirmada');
  });

  readonly etiquetaEstado = computed(() => {
    switch (this.cita()?.estado) {
      case 'pendiente':   return 'Pendiente de confirmar';
      case 'confirmada':  return 'Confirmada';
      case 'completada':  return 'Completada';
      case 'cancelada':   return 'Cancelada';
      case 'no_show':     return 'No asististe';
      default:            return '';
    }
  });

  ngOnInit(): void {
    this.store.cargar(Number(this.route.parent?.snapshot.paramMap.get('id_negocio')));

    // Se llega aquí desde la confirmación con `?codigo=`: buscar sola ahorra un pegado manual
    // de un UUID en el momento en que el cliente está más impaciente.
    const codigo = this.route.snapshot.queryParamMap.get('codigo');
    if (codigo) { this.codigo.set(codigo); this.buscar(); }
  }

  hora12(fechaHora: string | null | undefined): string {
    if (!fechaHora) return '';
    return aHora12(fechaHora.slice(11, 16));
  }

  buscar(): void {
    const codigo = this.codigo().trim();
    if (!codigo) return;

    this.buscando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.cita.set(null);

    this.api.publicoConsultarCita(codigo).subscribe({
      next: r => {
        this.buscando.set(false);
        if (r?.success && r.data) this.cita.set(r.data);
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
          this.mensaje.set('Tu cita quedó cancelada.');
          this.cita.update(c => (c ? { ...c, estado: 'cancelada' } : c));
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
