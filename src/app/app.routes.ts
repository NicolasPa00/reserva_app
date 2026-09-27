import { Routes } from '@angular/router';
import { authGuard, permissionGuard, planGuard } from './core/guards/auth.guard';
import { subdominioGuard } from './core/guards/subdominio.guard';

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
      {
        // Reservar es elegir un servicio: la ficha del servicio resuelve día, hora y
        // profesional en una sola vista. Sustituye al asistente de cuatro pasos.
        path: 'servicio/:id_servicio',
        title: 'Reservar cita',
        loadComponent: () =>
          import('./reserva/publico/servicio/servicio').then(m => m.PublicoServicioComponent),
      },
      {
        // Alojamiento / hotel de mascotas: reservar un tipo de unidad por noches.
        path: 'estadia/:id_unidad_tipo',
        title: 'Reservar estadía',
        loadComponent: () =>
          import('./reserva/publico/estadia/estadia').then(m => m.PublicoEstadiaComponent),
      },
      // Enlaces antiguos a `/reservar`: al catálogo, que es donde empieza la reserva ahora.
      { path: 'reservar', redirectTo: '', pathMatch: 'full' },
      {
        path: 'mi-cita',
        title: 'Mi cita',
        loadComponent: () =>
          import('./reserva/publico/mi-cita/mi-cita').then(m => m.PublicoMiCitaComponent),
      },
      { path: '**', redirectTo: '' },
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
  //
  // `subdominioGuard` va PRIMERO: en el subdominio propio de un negocio
  // (dalex-barberia.escalapp.cloud) redirige al portal antes de que `authGuard` llegue a pedir
  // sesión; en el dominio normal no hace nada y deja pasar a `authGuard` tal cual.
  {
    path: '',
    loadComponent: () => import('./layout/layout').then(m => m.LayoutComponent),
    canActivate: [subdominioGuard, authGuard],
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
        path: 'clientes',
        title: 'Clientes',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/clientes/clientes').then(m => m.ClientesComponent),
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
        path: 'usuarios',
        title: 'Usuarios',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/usuarios/usuarios').then(m => m.UsuariosComponent),
      },
      {
        path: 'caja',
        title: 'Caja',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/caja/caja').then(m => m.CajaComponent),
      },
      {
        path: 'informes',
        title: 'Informes',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/informes/informes').then(m => m.InformesComponent),
      },
      // ── Vistas de los perfiles de rubro (docs/perfiles-de-reserva.md) ──
      // Solo las ve el negocio cuyo perfil las usa: el backend las quita de los permisos y
      // `canAccessRoute` las filtra también para sesiones guardadas antes de los perfiles.
      {
        path: 'mascotas',
        title: 'Mascotas',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/mascotas/mascotas').then(m => m.MascotasComponent),
      },
      {
        path: 'recursos',
        title: 'Cabinas y equipos',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/recursos/recursos').then(m => m.RecursosComponent),
      },
      {
        path: 'ocupacion',
        title: 'Ocupación',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/estancias/ocupacion/ocupacion').then(m => m.OcupacionComponent),
      },
      {
        path: 'estancias',
        title: 'Estancias',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/estancias/lista/estancias').then(m => m.EstanciasComponent),
      },
      {
        path: 'unidades',
        title: 'Unidades',
        canActivate: [planGuard],
        loadComponent: () =>
          import('./reserva/estancias/unidades/unidades').then(m => m.UnidadesComponent),
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

  // Ruta desconocida: en el dominio normal, al inicio, como siempre. En el subdominio propio de
  // un negocio puede ser un enlace profundo (`dalex-barberia.escalapp.cloud/servicio/5`) — por
  // eso NO es un `redirectTo` liso: `subdominioGuard` necesita ver la URL completa ANTES de que
  // se reescriba a `''`, que es lo que perdería el `/servicio/5`. El componente no se llega a
  // pintar nunca: el guard siempre devuelve una redirección.
  {
    path: '**',
    canActivate: [subdominioGuard],
    loadComponent: () => import('./layout/layout').then(m => m.LayoutComponent),
  },
];
