import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'reserva-auth-callback',
  standalone: true,
  template: `
    <div class="callback">
      @if (error()) {
        <div class="callback__card">
          <span class="callback__icon callback__icon--error">!</span>
          <h2>No se pudo acceder al módulo de reservas</h2>
          <p>{{ error() }}</p>
          <button type="button" class="btn btn-primary" (click)="volverAlAdmin()">Volver al inicio</button>
        </div>
      } @else {
        <div class="callback__card">
          <div class="callback__spinner"></div>
          <p>Verificando acceso…</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .callback { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .callback__card { display: flex; flex-direction: column; gap: 1rem; align-items: center; text-align: center;
      padding: 2.5rem 2rem; background: var(--color-surface); border-radius: 1rem; box-shadow: var(--shadow-elevated);
      max-width: 360px; width: 100%; }
    h2 { margin: 0; font-size: 1.1rem; }
    p { margin: 0; color: var(--color-text-muted); font-size: .9rem; }
    .callback__icon--error { width: 44px; height: 44px; border-radius: 50%; background: var(--color-error); color: #fff;
      font-size: 1.25rem; display: flex; align-items: center; justify-content: center; font-weight: 700; }
    .callback__spinner { width: 40px; height: 40px; border: 4px solid var(--color-border);
      border-top-color: var(--color-primary); border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) { this.error.set('No se recibió un código de acceso válido.'); return; }
    const ok = await this.auth.canjearCodigo(code);
    if (ok) {
      this.theme.aplicarPaleta(this.auth.negocio()?.paleta ?? null);
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } else {
      this.error.set('Código inválido o expirado. Vuelve al panel y reintenta.');
    }
  }

  volverAlAdmin(): void { this.auth.logout(); }
}
