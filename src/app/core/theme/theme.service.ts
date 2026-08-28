import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

import { PaletaColor } from '../models';

/**
 * Tema claro único (identidad EscalApp) + paleta dinámica del negocio.
 *
 * El modo oscuro fue retirado del producto: este servicio solo fija
 * `data-theme='light'` en <html>. `aplicarPaleta()` sigue sobreescribiendo el
 * primario con los colores configurados por el dueño del negocio (cargados con
 * la sesión SSO).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  /**
   * Aplica los colores de la paleta del negocio como CSS vars sobre :root.
   * Acepta cualquier mapa key→hex; mapeamos solo las llaves que entendemos.
   */
  aplicarPaleta(paleta: PaletaColor | null | undefined): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const root = this.document.documentElement;
    if (!paleta?.colores) return;
    const c = paleta.colores;
    const map: Record<string, string | undefined> = {
      '--color-primary':       c['primary'] ?? c['primario'],
      '--color-primary-hover': c['primary_hover'] ?? c['primario_hover'],
      '--color-on-primary':    c['on_primary'] ?? c['contraste'],
      '--color-focus':         c['primary'] ?? c['primario'],
    };
    for (const [k, v] of Object.entries(map)) {
      if (v) root.style.setProperty(k, v);
    }
  }
}
