import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';

interface NavItem {
  icon: string; label: string; route: string;
}

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

  logout(): void { this.auth.logout(); }
}
