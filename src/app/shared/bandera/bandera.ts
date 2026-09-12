import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * La bandera de un país, dibujada a mano en SVG.
 *
 * ## Por qué no un emoji
 *
 * `🇨🇴` es lo obvio y no sirve: **Windows no trae fuente de banderas**, así que en Chrome sobre
 * Windows —donde se usa esta consola— el emoji se pinta como las dos letras «CO». Un selector
 * de indicativo que dice «CO Colombia» en vez de enseñar la bandera no es lo que se pidió, y el
 * fallo solo aparece en la máquina del cliente, no en la del que lo programa.
 *
 * ## Por qué no una imagen
 *
 * Un CDN de banderas mete una dependencia de red en un formulario que se abre cinco veces al
 * día, y un PNG por país son cinco archivos que mantener para 20 píxeles. Son cinco países:
 * caben en cinco franjas de color.
 *
 * ## Qué se dibuja y qué no
 *
 * Las franjas, no los escudos. A 20×14 px un escudo es una mancha; lo que distingue a un país
 * de otro a ese tamaño es el patrón de color. Colombia y Ecuador comparten las tres franjas, y
 * por eso Ecuador lleva una marca central —la única concesión al detalle, porque sin ella las
 * dos opciones del desplegable serían idénticas.
 *
 * Un código desconocido pinta un rectángulo neutro en vez de nada: el hueco desalinearía la
 * fila y haría pensar que la opción está rota.
 */
@Component({
  selector: 'reserva-bandera',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="bandera" viewBox="0 0 20 14" width="20" height="14" role="img"
         [attr.aria-label]="nombre() || codigo()">
      @switch (codigo()) {
        @case ('CO') {
          <rect width="20" height="7" fill="#FCD116" />
          <rect y="7" width="20" height="3.5" fill="#003893" />
          <rect y="10.5" width="20" height="3.5" fill="#CE1126" />
        }
        @case ('EC') {
          <rect width="20" height="7" fill="#FFDD00" />
          <rect y="7" width="20" height="3.5" fill="#034EA2" />
          <rect y="10.5" width="20" height="3.5" fill="#ED1C24" />
          <!-- El escudo, reducido a lo que se distingue a este tamaño: una marca central. -->
          <ellipse cx="10" cy="7" rx="2.1" ry="2.6" fill="#0B4EA2" opacity=".85" />
          <ellipse cx="10" cy="7" rx="1.1" ry="1.6" fill="#FFDD00" />
        }
        @case ('PE') {
          <rect width="6.67" height="14" fill="#D91023" />
          <rect x="6.67" width="6.66" height="14" fill="#FFFFFF" />
          <rect x="13.33" width="6.67" height="14" fill="#D91023" />
        }
        @case ('CL') {
          <rect width="20" height="7" fill="#FFFFFF" />
          <rect y="7" width="20" height="7" fill="#D52B1E" />
          <rect width="7" height="7" fill="#0039A6" />
          <path d="M3.5 1.9l.62 1.9h2l-1.62 1.18.62 1.9L3.5 5.7 1.88 6.88l.62-1.9L.88 3.8h2z"
                fill="#FFFFFF" />
        }
        @case ('MX') {
          <rect width="6.67" height="14" fill="#006847" />
          <rect x="6.67" width="6.66" height="14" fill="#FFFFFF" />
          <rect x="13.33" width="6.67" height="14" fill="#CE1126" />
          <circle cx="10" cy="7" r="2" fill="#8C6239" opacity=".8" />
        }
        @default {
          <rect width="20" height="14" fill="#E5E7EB" />
        }
      }
      <rect x=".25" y=".25" width="19.5" height="13.5" rx="1.5"
            fill="none" stroke="rgb(0 0 0 / .18)" stroke-width=".5" />
    </svg>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; }
    .bandera { border-radius: 2px; display: block; flex: none; }
  `],
})
export class BanderaComponent {
  /** ISO 3166-1 alfa-2, tal y como lo da el catálogo del backend. */
  readonly codigo = input<string>('');
  /** Para el `aria-label`; sin él un lector de pantalla solo diría «CO». */
  readonly nombre = input<string>('');
}
