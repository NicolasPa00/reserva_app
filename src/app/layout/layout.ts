import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar';
import { ToastHostComponent } from './toast-host/toast-host';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'reserva-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, ToastHostComponent],
  template: `
    <div class="layout">
      <reserva-sidebar />
      <div class="layout__main">
        <header class="topbar">
          <div class="topbar__right">
            @if (auth.usuario(); as u) {
              <div class="user-chip" aria-label="Sesión activa">
                <span class="user-chip__avatar" aria-hidden="true">{{ initials() }}</span>
                <span class="user-chip__name">{{ u.nombre_completo }}</span>
              </div>
            }
          </div>
        </header>
        <main class="layout__content">
          <router-outlet />
        </main>
      </div>
    </div>
    <reserva-toast-host />
  `,
  styles: [`
    .layout { display: flex; min-height: 100vh; background: var(--color-bg); }
    .layout__main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .layout__content { flex: 1; min-width: 0; overflow-y: auto; }

    .topbar {
      display: flex; align-items: center; justify-content: flex-end;
      height: 64px; padding: 0 1.5rem;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .topbar__right { display: flex; align-items: center; gap: .5rem; }

    /* Identidad del usuario (paridad con el admin) */
    .user-chip {
      display: inline-flex; align-items: center; gap: .5rem;
      height: 40px; padding: 0 .5rem 0 6px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      background: var(--color-surface);
      max-width: 220px;
    }
    .user-chip__avatar {
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; flex-shrink: 0;
      border-radius: var(--radius-full);
      background: var(--color-primary); color: var(--color-on-primary);
      font-size: .75rem; font-weight: 700; letter-spacing: .02em;
    }
    .user-chip__name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 130px; font-size: .875rem; font-weight: 600;
      color: var(--color-text-primary);
    }
    @media (max-width: 600px) {
      .user-chip__name { display: none; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent {
  protected readonly auth = inject(AuthService);

  /** Iniciales del usuario para el avatar del chip del header. */
  protected readonly initials = computed(() => {
    const nombre = this.auth.usuario()?.nombre_completo?.trim();
    if (!nombre) return 'U';
    const parts = nombre.split(/\s+/);
    return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase();
  });
}
