import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

import { AuthService } from '../services/auth.service';
import { ThemeService } from '../theme/theme.service';
import { environment } from '../../../environments/environment';
import { slugDelNavegador } from '../subdominio';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const theme = inject(ThemeService);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) return true;

  // Red de seguridad del portal público: en el subdominio propio de un negocio, quien llega es
  // un cliente que viene a ver servicios y pedir cita — no tiene cuenta ni tiene por qué. Si por
  // lo que sea la URL no se reescribió al portal en el arranque (`core/subdominio.ts`: API
  // caída, subdominio retirado), esto corta aquí en vez de mandarlo al login de la consola, que
  // es lo que veía el cliente y no significaba nada para él.
  if (slugDelNavegador()) return false;

  if (auth.isAuthenticated()) {
    // La sesión viene de `localStorage`: al recargar se pide de nuevo para que un cambio de
    // permisos del rol (o del plan) se note sin cerrar sesión. Sin red se sigue con la guardada,
    // salvo que sea tan vieja que no traiga permisos.
    const r = await auth.refrescarSesion(true);
    if (r === 'rechazada' || (r === 'error' && auth.session()?.permisos_cargados !== true)) {
      auth.logout();
      return false;
    }
    theme.aplicar(auth.negocio()?.colores, auth.negocio()?.paleta);
    return true;
  }

  const stored = auth.getAccessToken();
  if (stored) {
    const ok = await auth.validateAndSetToken(stored);
    if (ok) { theme.aplicar(auth.negocio()?.colores, auth.negocio()?.paleta); return true; }
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

  // Recoge en segundo plano los cambios de permisos del rol. No se espera, para no cobrar una
  // petición en cada navegación: el menú y los botones se actualizan solos (son signals) y, si
  // lo que se está viendo dejó de estar permitido, se sale de ahí.
  void auth.refrescarSesion().then(r => {
    if (r === 'rechazada') { auth.logout(); return; }
    if (r !== 'ok') return;
    const actual = `/${router.url.split(/[?#]/)[0].split('/').filter(Boolean)[0] ?? ''}`;
    if (RUTAS_SISTEMA.has(actual) || auth.canAccessRoute(actual)) return;
    void router.navigateByUrl(auth.getFirstAccessibleRoute() ?? '/sin-acceso');
  });

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
