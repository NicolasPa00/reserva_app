import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { SidebarComponent } from './sidebar/sidebar';
import { ToastHostComponent } from './toast-host/toast-host';
import { AuthService } from '../core/services/auth.service';

/** Por debajo de esto la barra lateral arranca plegada; por encima, desplegada. */
const ANCHO_ESCRITORIO = 1024;

@Component({
  selector: 'reserva-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, ToastHostComponent, LucideAngularModule],
  template: `
    <div class="layout">
      <reserva-sidebar [colapsado]="colapsado()" />
      <div class="layout__main">
        <header class="topbar">
          <button type="button" class="topbar__menu" (click)="alternarMenu()"
                  [attr.aria-expanded]="!colapsado()"
                  [title]="colapsado() ? 'Desplegar el menú' : 'Plegar el menú'"
                  aria-label="Menú">
            <lucide-icon name="menu" [size]="20" />
          </button>

          <!--
            Identidad del negocio. Solo se ve en móvil: ahí no hay barra lateral que la muestre
            y la cabecera quedaba con un avatar suelto y nada más. En escritorio la barra ya lo
            dice y repetirlo sería ruido.
          -->
          <div class="topbar__negocio">
            <strong>{{ auth.negocio()?.nombre || 'Reservas' }}</strong>
            <span>{{ auth.rolPrincipal() }}</span>
          </div>

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
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      height: 64px; padding: 0 1.5rem;
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }
    .topbar__right { display: flex; align-items: center; gap: .5rem; margin-left: auto; }

    /* Solo en móvil; en escritorio lo dice la barra lateral. */
    .topbar__negocio { display: none; }
    .topbar__negocio strong {
      display: block; font-size: .92rem; line-height: 1.2;
      color: var(--color-text-primary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .topbar__negocio span {
      display: block; font-size: .7rem; line-height: 1.2;
      color: var(--color-text-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Hamburguesa: pliega y despliega la barra lateral en escritorio y tablet. */
    .topbar__menu {
      display: flex; align-items: center; justify-content: center;
      width: 38px; height: 38px; flex-shrink: 0;
      border: 1px solid var(--color-border); border-radius: var(--radius-md);
      background: transparent; color: var(--color-text-secondary); cursor: pointer;
      transition: border-color var(--transition-fast), color var(--transition-fast),
                  background var(--transition-fast);
    }
    .topbar__menu:hover {
      border-color: var(--color-primary); color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 7%, transparent);
    }
    .topbar__menu lucide-icon { display: flex; line-height: 0; }

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

    /*
      Móvil: no hay barra lateral que plegar, así que la hamburguesa sobra —el menú vive abajo—.
      El contenido reserva la altura de esa barra para que su último bloque no quede debajo.
    */
    @media (max-width: 767px) {
      .topbar { padding: 0 1rem; gap: .75rem; }
      .topbar__menu { display: none; }
      .topbar__negocio { display: block; min-width: 0; flex: 1; }
      .layout__content { padding-bottom: calc(62px + env(safe-area-inset-bottom, 0px)); }
    }
    @media (max-width: 600px) {
      .user-chip__name { display: none; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent {
  protected readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Estado de la barra lateral.
   *
   * Arranca plegada por debajo de 1024 px: en una tablet de 820 px, 240 px de menú se llevan un
   * tercio del ancho para repetir diez etiquetas que el icono ya identifica. En el servidor no
   * hay ventana que medir, así que se asume escritorio —es el caso que rehidrata sin salto en
   * la mayoría de las visitas a una consola de gestión.
   */
  protected readonly colapsado = signal(
    isPlatformBrowser(this.platformId) ? window.innerWidth < ANCHO_ESCRITORIO : false,
  );

  alternarMenu(): void { this.colapsado.update(v => !v); }

  /** Iniciales del usuario para el avatar del chip del header. */
  protected readonly initials = computed(() => {
    const nombre = this.auth.usuario()?.nombre_completo?.trim();
    if (!nombre) return 'U';
    const parts = nombre.split(/\s+/);
    return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase();
  });
}
