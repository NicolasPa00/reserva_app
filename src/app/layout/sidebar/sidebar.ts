import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';

interface NavItem {
  icon: string; label: string; route: string;
}

/** Cuántos accesos caben en la barra inferior sin apretujarse; el resto va al panel «Más». */
const ATAJOS_MOVIL = 4;

/**
 * Navegación de la consola. Cambia de forma según el espacio disponible.
 *
 * - **Escritorio**: barra lateral completa, plegable con la hamburguesa del encabezado.
 * - **Tablet**: la misma barra, pero **arranca plegada**. A 820 px de ancho, 240 px de menú se
 *   comen un tercio de la pantalla para repetir diez etiquetas que el icono ya identifica.
 * - **Móvil**: no hay barra lateral. La navegación baja al borde inferior, donde llega el
 *   pulgar, y así el contenido dispone del ancho completo.
 *
 * Los tres modos leen la **misma** lista filtrada por permisos: un enlace que un rol no puede
 * ver no aparece en ninguno, sin tener que recordar mantener dos plantillas a la vez.
 */
@Component({
  selector: 'reserva-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(ReservaApiService);

  /** Lo gobierna el layout, que es quien tiene la hamburguesa en el encabezado. */
  readonly colapsado = input(false);

  /** Logo del negocio, ya con el origen del backend delante. */
  readonly logoUrl = computed(() => {
    const ruta = this.auth.negocio()?.logo_url;
    if (!ruta) return '';
    return /^https?:\/\//i.test(ruta) ? ruta : this.api.origenArchivos + ruta;
  });

  readonly items: NavItem[] = [
    { icon: 'layout-dashboard',  label: 'Dashboard',     route: '/dashboard' },
    { icon: 'calendar-days',     label: 'Agenda',        route: '/agenda' },
    { icon: 'calendar-check',    label: 'Citas',         route: '/citas' },
    { icon: 'contact',           label: 'Clientes',      route: '/clientes' },
    { icon: 'scissors',          label: 'Servicios',     route: '/servicios' },
    { icon: 'users',             label: 'Profesionales', route: '/profesionales' },
    { icon: 'clock',             label: 'Horarios',      route: '/horarios' },
    { icon: 'wallet',            label: 'Caja',          route: '/caja' },
    { icon: 'user-cog',          label: 'Usuarios',      route: '/usuarios' },
    { icon: 'chart-column',      label: 'Informes',      route: '/informes' },
    { icon: 'settings',          label: 'Configuración', route: '/configuracion' },
  ];

  readonly itemsPermitidos = computed(() =>
    this.items.filter(i => this.auth.canAccessRoute(i.route))
  );

  /**
   * Reparto para el móvil: los primeros van a la barra, el resto al panel «Más».
   *
   * Se corta sobre la lista **ya filtrada** por permisos, no sobre la lista completa: a un
   * profesional que solo ve tres pantallas no se le esconde ninguna detrás de «Más».
   */
  readonly principales = computed(() => this.itemsPermitidos().slice(0, ATAJOS_MOVIL));
  readonly secundarios = computed(() => this.itemsPermitidos().slice(ATAJOS_MOVIL));

  readonly masAbierto = signal(false);

  alternarMas(): void { this.masAbierto.update(v => !v); }
  cerrarMas(): void { this.masAbierto.set(false); }

  logout(): void {
    this.cerrarMas();
    this.auth.logout();
  }
}
