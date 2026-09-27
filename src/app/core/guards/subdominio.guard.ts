import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { ReservaApiService } from '../services/reserva-api.service';

/**
 * Subdominios que NO son la URL propia de ningún negocio: la app tal cual (`escalapp.cloud`, con
 * o sin `www`) y, en local, `localhost` sin dominio ninguno.
 */
function esSubdominioDeNegocio(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  if (hostname === 'escalapp.cloud' || hostname === 'www.escalapp.cloud') return false;
  return /\.escalapp\.cloud$/i.test(hostname);
}

/**
 * Traduce `dalex-barberia.escalapp.cloud` al portal de siempre, `/p/:id_negocio`.
 *
 * ## Por qué un guard y no rutas nuevas
 *
 * La app sirve dos cosas por el mismo dominio base: la consola del negocio (con sesión, en `''`)
 * y el portal público (`p/:id_negocio`). Un negocio con subdominio propio quiere ver el portal en
 * la raíz de SU dominio — pero la raíz de la app ya es la consola. En vez de duplicar el árbol de
 * rutas del portal, este guard intercepta antes de que la consola cargue, resuelve el
 * `id_negocio` a partir del subdominio y redirige a la ruta que ya existe.
 *
 * Se cuelga en dos sitios (`app.routes.ts`):
 *   - en `''` (consola): cubre la visita a la raíz del subdominio, `dalex-barberia.escalapp.cloud/`.
 *   - en el comodín `**`: cubre una subruta directa, `dalex-barberia.escalapp.cloud/servicio/5`
 *     —un enlace profundo compartido antes—, que si no se intercepta AQUÍ (antes de que el
 *     comodín reescriba la URL a `''`) perdería el `/servicio/5` para siempre.
 *
 * Fuera de un subdominio de negocio, o si la resolución falla (el subdominio no existe: Caddy no
 * debería haber dejado pasar la petición, pero por si acaso), no hace nada — la app sigue como
 * siempre. Nunca bloquea la navegación con `false`: o dice «sigue» o dice «ve aquí».
 *
 * `Router` y `ReservaApiService` se capturan ANTES del primer `await`: `inject()` solo vale en
 * el tramo síncrono inicial de la función, y este guard es `async`.
 */
export const subdominioGuard: CanActivateFn = async (route, state) => {
  const platformId = inject(PLATFORM_ID);
  const router = inject(Router);
  const api = inject(ReservaApiService);
  const enConsola = route.routeConfig?.path === '';

  const seguirComoSiempre = () => (enConsola ? true : router.parseUrl('/'));

  if (!isPlatformBrowser(platformId)) return true;

  const hostname = window.location.hostname;
  if (!esSubdominioDeNegocio(hostname)) return seguirComoSiempre();

  const slug = hostname.split('.')[0];
  try {
    const r = await firstValueFrom(api.publicoPorDominio(slug));
    const idNegocio = r?.success ? r.data?.id_negocio : null;
    if (!idNegocio) return seguirComoSiempre();

    const resto = state.url === '/' ? '' : state.url;
    return router.parseUrl(`/p/${idNegocio}${resto}`);
  } catch {
    return seguirComoSiempre();
  }
};
