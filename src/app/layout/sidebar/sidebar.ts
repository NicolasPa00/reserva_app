import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';

interface NavItem {
  icon: string; label: string; route: string;
  /** `dia`: lo que se abre cada jornada. `gestion`: lo que se configura de vez en cuando. */
  grupo: 'dia' | 'gestion';
}

interface NavGrupo {
  /** `null` = lista sin encabezado, cuando separar no aporta nada. */
  titulo: string | null;
  items: NavItem[];
}

/** Cuántos accesos caben en la barra inferior sin apretujarse; el resto va al panel «Más». */
const ATAJOS_MOVIL = 4;

/**
 * A partir de cuántos accesos vale la pena separarlos en dos bloques.
 *
 * Con cuatro enlaces, dos encabezados son más texto que menú: el ojo los recorre enteros de una
 * pasada. A partir de cinco empieza a costar, y ahí los títulos sí orientan. Un recepcionista
 * con tres pantallas ve la lista de siempre; el dueño, que las ve todas, ve las dos secciones.
 */
const MINIMO_PARA_AGRUPAR = 5;

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

  /**
   * Los accesos, con el nombre que cada oficio le da a las cosas: «Estilistas» en un salón,
   * «Sesiones» en un estudio de tatuajes, «Huéspedes» en un hotel. En una barbería (perfil BASE)
   * son exactamente los de siempre. Las vistas que el perfil no usa (Unidades en una barbería)
   * ya llegan quitadas de los permisos, así que `canAccessRoute` las esconde sin más.
   */
  readonly items = computed<NavItem[]>(() => {
    const t = this.auth.terminos();
    const perfil = this.auth.perfil();
    const soloEstancias = !this.auth.usaCitas();
    return [
      // Día a día: lo que se abre para atender.
      { icon: 'layout-dashboard', label: 'Dashboard',       route: '/dashboard',   grupo: 'dia' },
      { icon: 'calendar-days',    label: 'Agenda',          route: '/agenda',      grupo: 'dia' },
      { icon: 'calendar-check',   label: t.citas,           route: '/citas',       grupo: 'dia' },
      { icon: 'calendar-range',   label: 'Ocupación',       route: '/ocupacion',   grupo: 'dia' },
      { icon: 'bed-double',       label: soloEstancias ? t.citas : 'Estancias', route: '/estancias', grupo: 'dia' },
      { icon: 'wallet',           label: 'Caja',            route: '/caja',        grupo: 'dia' },

      // Gestión: el catálogo, la gente y los ajustes.
      { icon: 'contact',          label: t.clientes,        route: '/clientes',    grupo: 'gestion' },
      { icon: 'paw-print',        label: 'Mascotas',        route: '/mascotas',    grupo: 'gestion' },
      { icon: perfil.icono_servicios || 'scissors', label: t.servicios, route: '/servicios', grupo: 'gestion' },
      { icon: 'users',            label: t.profesionales,   route: '/profesionales', grupo: 'gestion' },
      { icon: 'clock',            label: 'Horarios',        route: '/horarios',    grupo: 'gestion' },
      { icon: 'door-open',        label: 'Cabinas',         route: '/recursos',    grupo: 'gestion' },
      { icon: 'door-open',        label: perfil.clave === 'ALOJAMIENTO' ? 'Habitaciones' : 'Unidades', route: '/unidades', grupo: 'gestion' },
      { icon: 'user-cog',         label: 'Usuarios',        route: '/usuarios',    grupo: 'gestion' },
      { icon: 'chart-column',     label: 'Informes',        route: '/informes',    grupo: 'gestion' },
      { icon: 'settings',         label: 'Configuración',   route: '/configuracion', grupo: 'gestion' },
    ];
  });

  readonly itemsPermitidos = computed(() =>
    this.items().filter(i => this.auth.canAccessRoute(i.route))
  );

  /**
   * La barra lateral, en uno o dos bloques.
   *
   * Se agrupa solo si hay de sobra para agrupar **y** ambos bloques tienen cuerpo: con «Agenda»
   * sola bajo «Principal» y «Configuración» sola bajo «Gestión», los encabezados serían dos
   * líneas de adorno sobre dos enlaces. En ese caso vuelve la lista de siempre, sin títulos.
   */
  readonly grupos = computed<NavGrupo[]>(() => {
    const items = this.itemsPermitidos();
    const dia = items.filter(i => i.grupo === 'dia');
    const gestion = items.filter(i => i.grupo === 'gestion');

    if (items.length < MINIMO_PARA_AGRUPAR || dia.length < 2 || gestion.length < 2) {
      return [{ titulo: null, items }];
    }
    return [
      { titulo: 'Principal', items: dia },
      { titulo: 'Gestión', items: gestion },
    ];
  });

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
