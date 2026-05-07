import { Routes } from '@angular/router';
import { authGuard, permissionGuard, planGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ────────── Flujo público (sin sesión) ──────────
  {
    path: 'p/:id_negocio',
    loadComponent: () =>
      import('./layout/publico-shell/publico-shell').then(m => m.PublicoShellComponent),
    children: [
      {
        path: '',
        title: 'Reserva tu cita',
        loadComponent: () =>
          import('./reserva/publico/inicio/inicio').then(m => m.PublicoInicioComponent),
      },
      // El wizard servicio→profesional→hora→form se enchufa aquí en Ola 5.
    ],
  },

  // ────────── SSO ──────────
  {
    path: 'auth/callback',
    title: 'Acceso',
    loadComponent: () =>
      import('./auth/auth-callback/auth-callback').then(m => m.AuthCallbackComponent),
  },

  // ────────── Vista del negocio (con sesión) ──────────
  {
    path: '',
    loadComponent: () => import('./layout/layout').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    canActivateChild: [permissionGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () =>
          import('./reserva/dashboard/dashboard').then(m => m.DashboardComponent),
      },
      {
        path: 'agenda',
        title: 'Agenda',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/agenda/agenda').then(m => m.AgendaComponent),
      },
      {
        path: 'citas',
        title: 'Citas',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/citas/citas').then(m => m.CitasComponent),
      },
      {
        path: 'servicios',
        title: 'Servicios',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/servicios/servicios').then(m => m.ServiciosComponent),
      },
      {
        path: 'profesionales',
        title: 'Profesionales',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/profesionales/profesionales').then(m => m.ProfesionalesComponent),
      },
      {
        path: 'horarios',
        title: 'Horarios',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/horarios/horarios').then(m => m.HorariosComponent),
      },
      {
        path: 'configuracion',
        title: 'Configuración',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/configuracion/configuracion').then(m => m.ConfiguracionComponent),
      },
      {
        path: 'sin-acceso',
        title: 'Sin acceso',
        loadComponent: () =>
          import('./reserva/sin-acceso/sin-acceso').then(m => m.SinAccesoComponent),
      },
      {
        path: 'sin-plan',
        title: 'Plan requerido',
        loadComponent: () =>
          import('./reserva/sin-plan/sin-plan').then(m => m.SinPlanComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
