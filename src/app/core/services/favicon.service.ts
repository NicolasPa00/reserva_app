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
@Injectable({ providedIn: 'root' })
export class FaviconService {
  private readonly document = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** El de `index.html`, para devolverlo al salir del portal. */
  private original: { href: string; type: string | null } | null = null;

  aplicar(url: string | null | undefined): void {
    if (!this.navegador) return;

    const enlace = this.enlace();
    if (!enlace) return;

    if (!this.original) {
      this.original = { href: enlace.getAttribute('href') ?? '', type: enlace.getAttribute('type') };
    }

    if (!url) { this.restaurar(); return; }
    if (enlace.getAttribute('href') === url) return;   // ya es el suyo: no tocar el DOM

    const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase();
    const tipo = TIPOS[ext];
    if (tipo) enlace.setAttribute('type', tipo);
    else enlace.removeAttribute('type');
    enlace.setAttribute('href', url);
  }

  restaurar(): void {
    if (!this.navegador || !this.original) return;

    const enlace = this.enlace();
    if (!enlace) return;

    enlace.setAttribute('href', this.original.href);
    if (this.original.type) enlace.setAttribute('type', this.original.type);
    else enlace.removeAttribute('type');
  }

  /** El `<link rel="icon">` de `index.html`; si faltara, se crea uno. */
  private enlace(): HTMLLinkElement | null {
    const head = this.document.head;
    if (!head) return null;

    let el = head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!el) {
      el = this.document.createElement('link');
      el.setAttribute('rel', 'icon');
      head.appendChild(el);
    }
    return el;
  }
}
