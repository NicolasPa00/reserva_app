import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Las rutas con params dinámicos no se pueden prerenderizar sin saber los valores.
  { path: 'p/:id_negocio',     renderMode: RenderMode.Server },
  { path: 'p/:id_negocio/**',  renderMode: RenderMode.Server },
  { path: '**',                renderMode: RenderMode.Prerender },
];
