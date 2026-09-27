import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiResponse } from './models';

/** Dominio base de la plataforma. Todo lo que cuelgue de aquí y no sea uno de los reservados. */
const BASE = '.escalapp.cloud';
const RESERVADOS = new Set(['www', 'api']);

/**
 * El slug del negocio si esta pestaña se abrió por su URL propia
 * (`dalex-barberia.escalapp.cloud`), o `null` si es la app de siempre.
 *
 * Es **síncrona y sin red** a propósito: la usan tanto el arranque como `authGuard`, y este
 * último necesita decidir en el mismo instante en que corre, sin esperar a nadie.
 */
export function slugDeSubdominio(hostname: string): string | null {
  const host = String(hostname || '').toLowerCase();
  if (!host.endsWith(BASE)) return null;

  const etiqueta = host.slice(0, -BASE.length);
  if (!etiqueta || etiqueta.includes('.') || RESERVADOS.has(etiqueta)) return null;
  return etiqueta;
}

/** Lo mismo, leyendo del navegador. Fuera del navegador (SSR, prerender) no hay subdominio. */
export function slugDelNavegador(): string | null {
  if (typeof window === 'undefined') return null;
  return slugDeSubdominio(window.location.hostname);
}

/**
 * Deja la URL apuntando al portal del negocio ANTES de que el router haga su primera navegación.
 *
 * ## Por qué en el arranque y no en un guard
 *
 * Fue un guard (`subdominioGuard`) y no funcionaba: Angular ejecuta todos los `canActivate` de
 * una ruta **en paralelo** (`combineLatest` en `prioritizedGuardValue`), no en cadena. Así que
 * mientras este resolvía el slug contra la API, `authGuard` —en la misma lista— ya había visto
 * que no hay sesión y había hecho `window.location.href = .../auth/login`. Esa carrera la ganaba
 * siempre el login, y a un cliente que solo quiere ver los servicios se le pedía entrar.
 *
 * Aquí no hay carrera: `provideAppInitializer` bloquea el arranque, así que cuando el router
 * hace su primera navegación la URL ya dice `/p/:id_negocio` y la ruta que casa es la del portal
 * público, que no tiene guards. `authGuard` ni siquiera llega a correr.
 *
 * Si la resolución falla (subdominio que no existe, API caída) no se toca la URL: la app sigue
 * su camino normal y `authGuard` decide, como en cualquier otra dirección.
 */
export async function resolverPortalDeSubdominio(): Promise<void> {
  if (typeof window === 'undefined') return;

  const slug = slugDelNavegador();
  if (!slug) return;

  const { pathname, search, hash } = window.location;
  // Ya está en el portal (una recarga después de esta misma reescritura, o un enlace directo).
  if (pathname.startsWith('/p/')) return;

  const http = inject(HttpClient);
  const url = `${environment.apiUrl}/publico/dominio/${encodeURIComponent(slug)}`;

  // Con tope: si la API no responde, es preferible que la app arranque y muestre su error a
  // dejar la pestaña en blanco esperando.
  const r = await firstValueFrom(
    http.get<ApiResponse<{ id_negocio: number }>>(url).pipe(
      timeout(8000),
      catchError(() => of(null)),
    ),
  );

  const idNegocio = r?.success ? r.data?.id_negocio : null;
  if (!idNegocio) return;

  const resto = pathname === '/' ? '' : pathname;
  window.history.replaceState(window.history.state, '', `/p/${idNegocio}${resto}${search}${hash}`);
}
