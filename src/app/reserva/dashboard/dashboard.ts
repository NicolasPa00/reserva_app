import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ResumenDashboard } from '../../core/models';

interface Card {
  label: string;
  value: number;
  icon: string;
  format?: 'currency' | 'int';
  highlight?: boolean;
}

@Component({
  selector: 'reserva-dashboard',
  standalone: true,
  imports: [LucideAngularModule, CurrencyPipe, DecimalPipe],
  template: `
    <section class="page">
      <header class="page__head">
        <div>
          <h1>Dashboard</h1>
          <p>Resumen del día — {{ auth.negocio()?.nombre }}</p>
        </div>
      </header>

      @if (cargando()) {
        <p class="hint">Cargando…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <div class="cards">
          @for (c of cards(); track c.label) {
            <article class="card kpi" [class.kpi--alert]="c.highlight">
              <span class="kpi__icon"><lucide-icon [name]="c.icon" [size]="20" /></span>
              <div>
                <span class="kpi__label">{{ c.label }}</span>
                <strong class="kpi__value">
                  @if (c.format === 'currency') {
                    {{ c.value | currency:'COP':'symbol':'1.0-0' }}
                  } @else {
                    {{ c.value | number }}
                  }
                </strong>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .kpi { display: flex; align-items: center; gap: .85rem; }
    .kpi__icon {
      width: 40px; height: 40px; border-radius: var(--radius-md);
      background: var(--color-bg-muted); color: var(--color-primary);
      display: flex; align-items: center; justify-content: center;
    }
    .kpi__label { display: block; color: var(--color-text-muted); font-size: .8rem; font-weight: 500; }
    .kpi__value { display: block; color: var(--color-text-primary); font-size: 1.4rem; font-weight: 700; line-height: 1.1; }
    .kpi--alert .kpi__icon { background: var(--color-warning-bg); color: var(--color-warning); }
    .hint, .error { color: var(--color-text-muted); }
    .error { color: var(--color-error); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ReservaApiService);

  readonly resumen = signal<ResumenDashboard | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly cards = computed<Card[]>(() => {
    const r = this.resumen();
    if (!r) return [];
    return [
      { label: 'Citas hoy',           value: r.citas_hoy,         icon: 'calendar-days' },
      { label: 'Confirmadas',         value: r.citas_confirmadas, icon: 'calendar-check' },
      { label: 'Pendientes',          value: r.citas_pendientes,  icon: 'clock' },
      { label: 'Ingresos hoy',        value: r.ingresos_hoy,      icon: 'dollar-sign', format: 'currency' },
      { label: 'Servicios',           value: r.total_servicios,   icon: 'scissors' },
      { label: 'Profesionales',       value: r.total_profesionales, icon: 'users' },
      { label: 'Pagos por validar',   value: r.pagos_pendientes_validacion, icon: 'credit-card',
        highlight: r.pagos_pendientes_validacion > 0 },
    ];
  });

  ngOnInit(): void {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.cargando.set(true);
    this.api.getResumen(idNegocio).subscribe({
      next: r => {
        if (r?.success && r.data) this.resumen.set(r.data);
        else this.error.set(r?.message || 'No se pudo cargar el resumen.');
        this.cargando.set(false);
      },
      error: () => { this.error.set('Error de conexión.'); this.cargando.set(false); },
    });
  }
}
