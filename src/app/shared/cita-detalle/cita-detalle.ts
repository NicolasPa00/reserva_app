import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { Cita, EstadoCita, PagoEstado } from '../../core/models';
import { formatearCodigoCita } from '../../core/utils/codigo-cita';

export const ESTADO_LABELS: Record<EstadoCita, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_show: 'No asistió',
};

export const PAGO_LABELS: Record<PagoEstado, string> = {
  no_aplica: 'No aplica',
  pendiente_validacion: 'Por validar',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

export function badgeEstado(e: EstadoCita): string {
  switch (e) {
    case 'confirmada': return 'b-ok';
    case 'pendiente':  return 'b-warn';
    case 'completada': return 'b-info';
    case 'no_show':    return 'b-err';
    default:           return 'b-off';
  }
}

/**
 * Ficha de una cita: cliente, contacto, horario, servicios y pago.
 *
 * Es **presentacional a propósito** — recibe la cita y no sabe confirmarla ni cancelarla. Las
 * acciones las pone cada pantalla en el pie de su propio modal, porque no son las mismas: la
 * Agenda quiere ver rápido a quién tiene a las 10:00, y Citas gestiona el ciclo completo.
 * Compartir el cuerpo y no las acciones es lo que evita que este componente acabe con un
 * `@Input() modo` decidiendo qué botones pintar.
 *
 * Los mapas de etiquetas se exportan desde aquí para que las pantallas los importen en vez de
 * declarar su propia copia, que es como estaban.
 */
@Component({
  selector: 'reserva-cita-detalle',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, CurrencyPipe, DatePipe],
  template: `
    @if (cita) {
      <div class="cd">
        <header class="cd__head">
          <div class="cd__avatar" [style.background]="colorPro()">{{ iniciales() }}</div>
          <div class="cd__ident">
            <strong>{{ cita.cliente_nombre }}</strong>
            <span class="cd__code">Cita #{{ cita.id_cita }}</span>
          </div>
          <span class="badge" [class]="badge()">{{ estadoLabel() }}</span>
        </header>

        <div class="cd__when">
          <lucide-icon name="calendar-clock" [size]="16" />
          <div>
            <strong>{{ cita.fecha_hora_inicio | date:'EEEE d \\'de\\' MMMM':'':'es-CO' }}</strong>
            <span>
              {{ cita.fecha_hora_inicio | date:'HH:mm':'':'es-CO' }} –
              {{ cita.fecha_hora_fin | date:'HH:mm':'':'es-CO' }}
              · {{ duracionMin() }} min
            </span>
          </div>
        </div>

        <dl class="cd__grid">
          <div>
            <dt><lucide-icon name="user-round" [size]="13" /> Profesional</dt>
            <dd>{{ cita.profesional?.nombre || '—' }}</dd>
          </div>
          <div>
            <dt><lucide-icon name="phone" [size]="13" /> Teléfono</dt>
            <dd>
              @if (cita.cliente_telefono) {
                <a [href]="'tel:' + cita.cliente_telefono">{{ cita.cliente_telefono }}</a>
              } @else { <span class="cd__empty">Sin teléfono</span> }
            </dd>
          </div>
          <div>
            <dt><lucide-icon name="mail" [size]="13" /> Email</dt>
            <dd>
              @if (cita.cliente_email) {
                <a [href]="'mailto:' + cita.cliente_email">{{ cita.cliente_email }}</a>
              } @else { <span class="cd__empty">Sin email</span> }
            </dd>
          </div>
          <div>
            <dt><lucide-icon name="hash" [size]="13" /> Código público</dt>
            <!-- Entero, no recortado: es el código que el cliente dice por teléfono y que
                 el mostrador tiene que poder comparar letra a letra. -->
            <dd class="cd__mono">{{ codigoBonito(cita.codigo_publico) || '—' }}</dd>
          </div>
        </dl>

        <section class="cd__block">
          <h4>Servicios</h4>
          @if ((cita.servicios || []).length === 0) {
            <p class="cd__empty">Sin servicios registrados.</p>
          } @else {
            <ul class="cd__srv">
              @for (s of cita.servicios || []; track s.id_servicio) {
                <li>
                  <span>{{ s.servicio?.nombre || 'Servicio #' + s.id_servicio }}</span>
                  <em>{{ s.duracion_snapshot_min }} min</em>
                  <strong>{{ s.precio_snapshot | currency:'COP':'symbol':'1.0-0' }}</strong>
                </li>
              }
            </ul>
          }
          <p class="cd__total">
            <span>Total</span>
            <strong>{{ cita.monto_total | currency:'COP':'symbol':'1.0-0' }}</strong>
          </p>
        </section>

        @if (cita.requiere_pago) {
          <section class="cd__block">
            <h4>Pago adelantado</h4>
            <p class="cd__pago">
              <span class="badge"
                    [class.b-warn]="cita.pago_estado === 'pendiente_validacion'"
                    [class.b-ok]="cita.pago_estado === 'aprobado'"
                    [class.b-err]="cita.pago_estado === 'rechazado'"
                    [class.b-off]="cita.pago_estado === 'no_aplica'">
                {{ pagoLabel() }}
              </span>
            </p>
            @if (cita.pago_rechazo_motivo) {
              <p class="cd__empty">Motivo: {{ cita.pago_rechazo_motivo }}</p>
            }
          </section>
        }

        @if (cita.metodoPago || (cita.pagos && cita.pagos.length > 0)) {
          <section class="cd__block">
            <h4>Cobro</h4>
            @if (cita.pagos && cita.pagos.length > 0) {
              <ul class="cd__srv">
                @for (p of cita.pagos; track p.id_pago) {
                  <li>
                    <span>{{ p.metodoPago?.nombre || 'Forma #' + p.id_metodo_pago }}</span>
                    <em></em>
                    <strong>{{ p.valor | currency:'COP':'symbol':'1.0-0' }}</strong>
                  </li>
                }
              </ul>
            } @else {
              <p class="cd__pago">
                <span class="badge b-ok">{{ cita.metodoPago?.nombre }}</span>
              </p>
            }
          </section>
        }

        @if (cita.notas) {
          <section class="cd__block">
            <h4>Notas</h4>
            <p class="cd__notas">{{ cita.notas }}</p>
          </section>
        }

        @if (cita.cancelado_motivo) {
          <section class="cd__block cd__block--warn">
            <h4>Cancelación</h4>
            <p>{{ cita.cancelado_motivo }} <em>({{ cita.cancelado_por }})</em></p>
          </section>
        }
      </div>
    }
  `,
  styles: [`
    .cd { display: flex; flex-direction: column; gap: 1.1rem; }

    .cd__head { display: flex; align-items: center; gap: .75rem; }
    .cd__avatar {
      width: 44px; height: 44px; border-radius: var(--radius-full); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-weight: 700; font-size: .95rem; letter-spacing: .02em;
    }
    .cd__ident { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .cd__ident strong { font-size: 1.05rem; color: var(--color-text-primary); }
    .cd__code { font-size: .75rem; color: var(--color-text-muted); }

    .cd__when {
      display: flex; align-items: center; gap: .7rem;
      padding: .8rem .9rem; border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-primary) 6%, transparent);
      color: var(--color-primary);
      div { display: flex; flex-direction: column; }
      strong { color: var(--color-text-primary); font-size: .9rem; text-transform: capitalize; }
      span { color: var(--color-text-secondary); font-size: .82rem; }
    }

    .cd__grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: .85rem; margin: 0;
      > div { min-width: 0; }
      dt {
        display: flex; align-items: center; gap: .3rem;
        font-size: .72rem; text-transform: uppercase; letter-spacing: .04em;
        color: var(--color-text-muted); font-weight: 600; margin-bottom: .2rem;
      }
      dd { margin: 0; font-size: .9rem; color: var(--color-text-primary); overflow-wrap: anywhere; }
      dd a { color: var(--color-primary); text-decoration: none; }
      dd a:hover { text-decoration: underline; }
    }
    .cd__mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: .85rem; }
    .cd__empty { color: var(--color-text-muted); font-size: .85rem; }

    .cd__block {
      border-top: 1px solid var(--color-border); padding-top: .9rem;
      h4 { margin: 0 0 .5rem; font-size: .78rem; text-transform: uppercase;
           letter-spacing: .04em; color: var(--color-text-muted); }
      &--warn { color: var(--color-error); }
    }

    .cd__srv {
      list-style: none; padding: 0; margin: 0;
      display: flex; flex-direction: column; gap: .4rem;
      li {
        display: grid; grid-template-columns: 1fr auto auto; gap: .6rem; align-items: baseline;
        font-size: .88rem;
        span { color: var(--color-text-primary); min-width: 0; overflow-wrap: anywhere; }
        em { font-style: normal; color: var(--color-text-muted); font-size: .78rem; }
        strong { color: var(--color-text-primary); font-variant-numeric: tabular-nums; }
      }
    }
    .cd__total {
      display: flex; justify-content: space-between; align-items: baseline;
      margin: .7rem 0 0; padding-top: .6rem; border-top: 1px dashed var(--color-border);
      span { color: var(--color-text-secondary); font-size: .85rem; }
      strong { font-size: 1.15rem; font-weight: 800; color: var(--color-text-primary); }
    }
    .cd__pago { margin: 0; }
    .cd__notas {
      margin: 0; font-size: .88rem; color: var(--color-text-secondary);
      background: var(--color-bg-muted); padding: .65rem .8rem; border-radius: var(--radius-md);
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CitaDetalleComponent {
  /** `K3M79QXP` → `K3M7-9QXP`. Un código antiguo (UUID) se muestra tal cual. */
  readonly codigoBonito = formatearCodigoCita;

  private readonly citaSig = signal<Cita | null>(null);

  @Input() set cita(v: Cita | null) { this.citaSig.set(v); }
  get cita(): Cita | null { return this.citaSig(); }

  readonly estadoLabel = computed(() => {
    const c = this.citaSig();
    return c ? (ESTADO_LABELS[c.estado] ?? c.estado) : '';
  });

  readonly pagoLabel = computed(() => {
    const c = this.citaSig();
    return c ? (PAGO_LABELS[c.pago_estado] ?? c.pago_estado) : '';
  });

  readonly badge = computed(() => {
    const c = this.citaSig();
    return c ? badgeEstado(c.estado) : 'b-off';
  });

  readonly duracionMin = computed(() => {
    const c = this.citaSig();
    if (!c) return 0;
    return Math.round(
      (new Date(c.fecha_hora_fin).getTime() - new Date(c.fecha_hora_inicio).getTime()) / 60_000,
    );
  });

  readonly colorPro = computed(() =>
    this.citaSig()?.profesional?.color_hex || 'var(--color-primary)',
  );

  readonly iniciales = computed(() => {
    const nombre = this.citaSig()?.cliente_nombre?.trim() || '';
    if (!nombre) return '?';
    const partes = nombre.split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
  });
}
