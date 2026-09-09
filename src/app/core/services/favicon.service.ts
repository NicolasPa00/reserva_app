import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/** Extensión → mime. Lo que no esté aquí se deja sin `type` y lo olfatea el navegador. */
const TIPOS: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/**
 * Cambia el icono de la pestaña en caliente.
 *
 * En el portal público el icono es el logo que el inquilino subió a su perfil, no el nuestro:
 * la pestaña la abre un cliente del negocio, no un usuario de EscalApp.
 *
 * **No se convierte a `.ico` ni se redibuja en un canvas a propósito.** Todos los navegadores
 * que soportamos aceptan PNG/JPEG/WebP como favicon, y la URL que se pone aquí es exactamente
 * la misma que ya carga el `<img>` del logo en la cabecera: el navegador la sirve de su caché,
 * así que el icono no cuesta ni una petición extra ni un solo byte de JS de procesado de
 * imagen. Reescalar 200 KB de logo a 32 px en el hilo principal sí se notaría; esto no.
 */
/**
 * ## Por qué se retiran TODOS los `<link rel="icon">` y no se edita uno
 *
 * `index.html` declara varios: el `.ico` multi-tamaño y los PNG de 16 y 32 con su atributo
 * `sizes`. Cambiarle el `href` solo al primero no sirve de nada: los otros siguen apuntando
 * al icono de EscalApp, y el navegador **prefiere** el que declara el tamaño exacto que
 * necesita. El resultado era el logo de EscalApp en la pestaña del portal de un cliente,
 * que es justo lo contrario de lo que este servicio existe para hacer.
 *
 * Así que mientras el portal está abierto se apartan todos y queda uno solo, el del negocio.
 * Al salir se devuelven tal cual estaban.
 */
@Injectable({ providedIn: 'root' })
export class FaviconService {
  private readonly document = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** Los de `index.html`, apartados mientras dura el portal. */
  private originales: HTMLLinkElement[] | null = null;
  /** El que se inyecta con el logo del inquilino. */
  private propio: HTMLLinkElement | null = null;

  aplicar(url: string | null | undefined): void {
    if (!this.navegador) return;

    const head = this.document.head;
    if (!head) return;

    if (!url) { this.restaurar(); return; }
    if (this.propio?.getAttribute('href') === url) return;  // ya es el suyo: no tocar el DOM

    if (!this.originales) {
      this.originales = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
      this.originales.forEach((el) => el.remove());
    }

    if (!this.propio) {
      this.propio = this.document.createElement('link');
      this.propio.setAttribute('rel', 'icon');
      head.appendChild(this.propio);
    }

    const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase();
    const tipo = TIPOS[ext];
    if (tipo) this.propio.setAttribute('type', tipo);
    else this.propio.removeAttribute('type');
    this.propio.setAttribute('href', url);
  }

  restaurar(): void {
    if (!this.navegador || !this.originales) return;

    const head = this.document.head;
    if (!head) return;

    this.propio?.remove();
    this.propio = null;
    this.originales.forEach((el) => head.appendChild(el));
    this.originales = null;
  }
}
