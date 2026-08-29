import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

import { AuthService } from '../services/auth.service';
import { ThemeService } from '../theme/theme.service';
import { environment } from '../../../environments/environment';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const theme = inject(ThemeService);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  if (auth.isAuthenticated()) {
    if (auth.session()?.permisos_cargados !== true) {
      const ok = await refreshFromStored(auth);
      if (!ok) { auth.logout(); return false; }
    }
    theme.aplicarPaleta(auth.negocio()?.paleta ?? null);
    return true;
  }

  const stored = auth.getAccessToken();
  if (stored) {
    const ok = await auth.validateAndSetToken(stored);
    if (ok) { theme.aplicarPaleta(auth.negocio()?.paleta ?? null); return true; }
    auth.logout();
    return false;
  }

  // Sin sesión → al admin
  window.location.href = `${environment.adminUrl}/auth/login`;
  return false;
};

/**
 * Rutas del sistema: existen en la app pero **nunca** en `permisos_vista`.
 *
 * `migrate_reserva.js` solo crea niveles para los siete módulos (`/dashboard`, `/agenda`,
 * `/citas`, `/servicios`, `/profesionales`, `/horarios`, `/configuracion`). Pasar estas dos por
 * el filtro de permisos las declaraba prohibidas siempre, y eso encadenaba dos redirecciones:
 * `planGuard` mandaba a `/sin-plan` y este guard la rebotaba de vuelta a `/dashboard`. El
 * resultado visible era una app donde el menú no hacía nada y nadie decía por qué.
 */
const RUTAS_SISTEMA = new Set(['/sin-plan', '/sin-acceso']);

export const permissionGuard: CanActivateChildFn = (childRoute, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  const path = childRoute.routeConfig?.path;
  const requested = path && path !== '**'
    ? `/${path.replace(/^\//, '')}`
    : `/${state.url.split('/').filter(Boolean)[0] || 'dashboard'}`;

  if (RUTAS_SISTEMA.has(requested)) return true;

  if (auth.canAccessRoute(requested)) return true;
  const fallback = auth.getFirstAccessibleRoute();
  if (fallback && fallback !== requested) return router.parseUrl(fallback);
  return router.parseUrl('/sin-acceso');
};

/**
 * Bloquea el acceso a rutas de funcionalidad si el negocio no tiene plan activo.
 * Redirige a /sin-plan. No bloquea /dashboard ni /sin-plan.
 */
export const planGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  const path = state.url.split('?')[0].replace(/^\//, '');
  if (path === 'sin-plan' || path === 'dashboard' || path === '' || path === 'sin-acceso') {
    return true;
  }

  if (auth.planActivo()) return true;
  return router.parseUrl('/sin-plan');
};

async function refreshFromStored(auth: AuthService): Promise<boolean> {
  const t = auth.getAccessToken();
  if (!t) return false;
  return auth.validateAndSetToken(t);
}
