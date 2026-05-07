import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ThemeService } from '../../core/theme/theme.service';
import { InfoNegocioPublico } from '../../core/models';

/**
 * Layout liviano para el flujo público (sin sidebar). Carga `info` del negocio
 * usando el `:id_negocio` de la URL para mostrar el brand y aplicar la paleta.
 */
@Component({
  selector: 'reserva-publico-shell',
  standalone: true,
  imports: [RouterOutlet, LucideAngularModule],
  template: `
    <div class="publico">
      <header class="publico__header">
        <div class="publico__brand">
          <lucide-icon name="calendar-clock" [size]="20" />
          <strong>{{ info()?.nombre || 'Reserva tu cita' }}</strong>
        </div>
        <span class="publico__tag">EscalApp</span>
      </header>
      <main class="publico__content">
        <router-outlet />
      </main>
      <footer class="publico__footer">
        <span>Sistema de reservas · EscalApp</span>
      </footer>
    </div>
  `,
  styles: [`
    .publico { min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); }
    .publico__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: .85rem 1.25rem; background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
    }
    .publico__brand { display: flex; align-items: center; gap: .55rem; color: var(--color-primary); }
    .publico__brand strong { color: var(--color-text-primary); font-size: 1rem; }
    .publico__tag { color: var(--color-text-muted); font-size: .75rem; letter-spacing: .05em; }
    .publico__content { flex: 1; padding: 1.5rem 1rem; max-width: 720px; margin: 0 auto; width: 100%; }
    .publico__footer { padding: 1rem; text-align: center; color: var(--color-text-muted); font-size: .75rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoShellComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservaApiService);
  private readonly theme = inject(ThemeService);

  readonly info = signal<InfoNegocioPublico | null>(null);

  ngOnInit(): void {
    // El componente que se monte adentro recibirá `id_negocio` por param.
    // También lo obtenemos aquí para cargar la info del brand.
    this.route.firstChild?.paramMap.subscribe(params => {
      const id = Number(params.get('id_negocio'));
      if (!id) return;
      this.api.publicoInfoNegocio(id).subscribe({
        next: r => {
          if (r?.success && r.data) {
            this.info.set(r.data);
            this.theme.aplicarPaleta(r.data.paleta);
          }
        },
        error: () => { /* fallback silencioso al brand genérico */ },
      });
    });
  }
}
