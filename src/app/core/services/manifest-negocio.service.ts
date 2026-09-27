import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/** Lo que hace falta para que «Añadir a la pantalla de inicio» lleve la marca del negocio. */
export interface IdentidadPwa {
  /** URL absoluta del manifest dinámico (`GET /publico/:id/manifest.webmanifest`). */
  manifestUrl: string;
  /** URL absoluta del logo, para `apple-touch-icon` (iOS no lee el manifest para esto). */
  iconoUrl: string | null;
  /** Color primario del negocio, o `null` para dejar el de EscalApp. */
  colorTema: string | null;
  nombre: string;
}

/**
 * Cambia en caliente lo que decide cómo se ve el acceso directo del portal en el móvil: el
 * manifest (`Add to Home Screen`/`Instalar` en Android y Chrome), el icono de iOS
 * (`apple-touch-icon`, que Safari lee del DOM en el momento de añadir, no del manifest) y el
 * color de la barra del navegador.
 *
 * Mismo patrón que `FaviconService` —apartar los tags originales, poner los propios, devolver
 * los de siempre al salir— y por la misma razón: el icono de EscalApp es el de la consola, y el
 * del portal de un cliente tiene que ser el del negocio que visita, no el nuestro.
 *
 * ## Por qué no basta con editar el `href`
 *
 * `index.html` ya trae un `<link rel="manifest">` y un `<link rel="apple-touch-icon">` fijos.
 * Editarlos in situ funcionaría igual de bien que reemplazarlos, pero apartar-y-devolver dispensa
 * de acordarse de qué valor tenían — la misma razón que ya se documentó en `FaviconService`, y
 * aquí hay tres tags que restaurar en vez de uno.
 */
@Injectable({ providedIn: 'root' })
export class ManifestNegocioService {
  private readonly document = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  private manifestOriginal: HTMLLinkElement | null = null;
  private appleIconOriginal: HTMLLinkElement | null = null;
  private themeColorOriginal: HTMLMetaElement | null = null;
  private appleTitleOriginal: HTMLMetaElement | null = null;

  private propio = false;

  aplicar(id: IdentidadPwa): void {
    if (!this.navegador) return;
    const head = this.document.head;
    if (!head) return;

    if (!this.propio) {
      this.apartar(head);
      this.propio = true;
    }

    this.set('link[rel="manifest"]', head, (el) => el.setAttribute('href', id.manifestUrl));

    if (id.iconoUrl) {
      this.set('link[rel="apple-touch-icon"]', head, (el) => el.setAttribute('href', id.iconoUrl!));
    }

    this.set('meta[name="theme-color"]', head,
      (el) => el.setAttribute('content', id.colorTema || '#4338CA'));

    this.set('meta[name="apple-mobile-web-app-title"]', head,
      (el) => el.setAttribute('content', id.nombre));
  }

  restaurar(): void {
    if (!this.navegador || !this.propio) return;
    const head = this.document.head;
    if (!head) return;

    head.querySelector('link[rel="manifest"]')?.remove();
    head.querySelector('link[rel="apple-touch-icon"]')?.remove();
    head.querySelector('meta[name="theme-color"]')?.remove();
    head.querySelector('meta[name="apple-mobile-web-app-title"]')?.remove();

    if (this.manifestOriginal) head.appendChild(this.manifestOriginal);
    if (this.appleIconOriginal) head.appendChild(this.appleIconOriginal);
    if (this.themeColorOriginal) head.appendChild(this.themeColorOriginal);
    if (this.appleTitleOriginal) head.appendChild(this.appleTitleOriginal);

    this.manifestOriginal = null;
    this.appleIconOriginal = null;
    this.themeColorOriginal = null;
    this.appleTitleOriginal = null;
    this.propio = false;
  }

  /** Aparta el tag de `index.html` (para devolverlo tal cual al salir) y crea el que se editará. */
  private apartar(head: HTMLHeadElement): void {
    this.manifestOriginal = head.querySelector('link[rel="manifest"]');
    this.appleIconOriginal = head.querySelector('link[rel="apple-touch-icon"]');
    this.themeColorOriginal = head.querySelector('meta[name="theme-color"]');
    this.appleTitleOriginal = head.querySelector('meta[name="apple-mobile-web-app-title"]');

    this.manifestOriginal?.remove();
    this.appleIconOriginal?.remove();
    this.themeColorOriginal?.remove();
    this.appleTitleOriginal?.remove();

    head.appendChild(this.document.createElement('link')).setAttribute('rel', 'manifest');
    head.appendChild(this.document.createElement('link')).setAttribute('rel', 'apple-touch-icon');
    const theme = this.document.createElement('meta'); theme.setAttribute('name', 'theme-color');
    head.appendChild(theme);
    const title = this.document.createElement('meta'); title.setAttribute('name', 'apple-mobile-web-app-title');
    head.appendChild(title);
  }

  private set(
    selector: string, head: HTMLHeadElement, aplicar: (el: HTMLLinkElement & HTMLMetaElement) => void,
  ): void {
    const el = head.querySelector<HTMLLinkElement & HTMLMetaElement>(selector);
    if (el) aplicar(el);
  }
}
