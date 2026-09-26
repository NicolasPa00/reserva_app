import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

import { ColoresNegocio, PaletaColor } from '../models';

/**
 * Identidad visual del inquilino.
 *
 * ## Dos colores mandan; el resto se deriva
 *
 * El negocio guarda solo `primario` y `acento`. Todo lo demás —el tono del hover, el color del
 * texto encima del botón, los fondos suaves— se calcula aquí. Guardar los derivados los dejaría
 * desincronizados en cuanto alguien cambie el primario, que es el error que hace que una paleta
 * personalizada quede «casi» bien.
 *
 * Las hojas de estilo ya trabajan sobre `var(--color-primary)` con `color-mix`, así que basta
 * con reescribir un puñado de variables para que botones, iconos, barras, insignias y gráficas
 * cambien a la vez.
 *
 * ## Por qué se calcula el contraste en vez de pedirlo
 *
 * Si el dueño elige un amarillo, el texto blanco encima de su botón es ilegible. Nadie debería
 * tener que saber eso: se mide la luminancia relativa del color elegido y se pone texto blanco
 * o casi negro según cuál contraste más. Es la misma fórmula de WCAG que usa cualquier medidor
 * de contraste.
 *
 * ## `-rgb` no se toca
 *
 * El proyecto prohíbe `rgba(var(--color-primary-rgb))` justo porque las paletas dinámicas no
 * inyectan ese token. Aquí tampoco se inyecta: todos los derivados usan `color-mix`.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  /** Luminancia máxima que deja leer texto blanco encima con 4.5:1, el mínimo de WCAG AA. */
  private static readonly LUM_MAX_PARA_BLANCO = 0.183;

  /** Identidad por defecto de EscalApp, para poder volver atrás. */
  private static readonly POR_DEFECTO: ColoresNegocio = {
    primario: '#312E81',
    acento: '#6366F1',
  };

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  /**
   * Aplica los colores del negocio.
   *
   * Acepta los colores propios (`gener_negocio.colores`) o, si no hay, una paleta predefinida.
   * Sin ninguno de los dos vuelve al índigo de EscalApp — no se deja el color del inquilino
   * anterior colgado, que es lo que pasaría si se saliera sin hacer nada.
   */
  aplicar(colores: ColoresNegocio | null | undefined, paleta?: PaletaColor | null): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const elegido = this.resolver(colores, paleta);
    const marca = this.normalizar(elegido.primario) ?? ThemeService.POR_DEFECTO.primario;
    const marcaAcento = this.normalizar(elegido.acento) ?? marca;

    // El color tal cual lo eligió el dueño (para muestras de identidad) y el que de verdad pinta
    // la interfaz, que es el mismo tono llevado hasta donde el blanco encima se lee. Ver
    // `oscurecerHastaLegible`.
    const primario = this.oscurecerHastaLegible(marca);
    const acento = this.oscurecerHastaLegible(marcaAcento);

    const root = this.document.documentElement;
    const set = (nombre: string, valor: string) => root.style.setProperty(nombre, valor);

    set('--color-brand', marca);
    set('--color-brand-accent', marcaAcento);
    set('--color-primary', primario);
    set('--color-primary-hover', this.aclarar(primario, 0.18));
    set('--color-primary-light', this.mezclarConBlanco(primario, 0.38));
    set('--color-on-primary', this.contraste(primario));
    set('--color-focus', primario);
    set('--focus-ring', `0 0 0 3px color-mix(in srgb, ${primario} 40%, transparent)`);
    set('--shadow-featured', `0 4px 20px color-mix(in srgb, ${primario} 15%, transparent)`);

    // El acento tiñe lo secundario: puntos de profesional sin color propio, series de apoyo en
    // las gráficas, insignias informativas.
    set('--color-accent', acento);
    set('--color-accent-blue', acento);
    set('--color-on-accent', this.contraste(acento));

    // Superficies derivadas: un lavado del primario sobre blanco, no un gris fijo. Sin esto,
    // una paleta cálida quedaba con fondos azulados que no pegaban con nada.
    set('--color-surface-hover', `color-mix(in srgb, ${primario} 6%, #ffffff)`);
    set('--color-bg-muted', `color-mix(in srgb, ${primario} 4%, #f8f9fb)`);
  }

  /** Compatibilidad con el nombre anterior, que recibía solo la paleta de la sesión. */
  aplicarPaleta(paleta: PaletaColor | null | undefined): void {
    this.aplicar(null, paleta);
  }

  // ── Interno ──

  private resolver(colores: ColoresNegocio | null | undefined, paleta?: PaletaColor | null): ColoresNegocio {
    if (colores?.primario) return colores;
    const c = paleta?.colores;
    if (c) {
      const primario = c['primario'] ?? c['primary'];
      if (primario) return { primario, acento: c['acento'] ?? c['accent'] ?? primario };
    }
    return ThemeService.POR_DEFECTO;
  }

  /** Admite `#abc`, `abcdef` y `#ABCDEF`; devuelve `#rrggbb` o `null` si no es un color. */
  private normalizar(valor: string | undefined | null): string | null {
    if (!valor) return null;
    let v = String(valor).trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
    return `#${v.toLowerCase()}`;
  }

  private aRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  private aHex(r: number, g: number, b: number): string {
    const c = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  /** Aclara hacia el blanco. Se usa para el hover: un primario oscuro se ve «vivo» al pasar. */
  private aclarar(hex: string, factor: number): string {
    const [r, g, b] = this.aRgb(hex);
    return this.aHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  }

  private mezclarConBlanco(hex: string, proporcion: number): string {
    return this.aclarar(hex, proporcion);
  }

  /**
   * Blanco o casi negro, el que más contraste dé sobre el color.
   *
   * Luminancia relativa de WCAG: linealiza cada canal y los pondera según la sensibilidad del
   * ojo (el verde pesa el 71 %). Tras `oscurecerHastaLegible` el primario siempre cae del lado
   * del blanco; esto sigue aquí para colores que no pasan por ahí.
   */
  private contraste(hex: string): string {
    return this.luminancia(hex) > ThemeService.LUM_MAX_PARA_BLANCO ? '#0f0a2a' : '#ffffff';
  }

  private luminancia(hex: string): number {
    const [r, g, b] = this.aRgb(hex).map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * El mismo tono, oscurecido hasta que el blanco encima se lee (4.5:1 de WCAG).
   *
   * Un inquilino elige su color para su logo, no para una interfaz, y los pasteles de moda
   * —salmón, beige, menta— fallan dos veces: el texto encima no se lee, y ese mismo color como
   * icono o enlace **sobre blanco** tampoco. Antes se resolvía cambiando el texto a casi negro,
   * y el resultado era una barra salmón con letra negra que parecía un error de maquetación.
   *
   * Así que se conserva el tono y se baja el brillo lo justo. El color elegido sigue intacto en
   * `--color-brand`, que es lo que pintan las muestras de identidad: el dueño ve su color donde
   * dice «tu color», y la interfaz usa la versión con la que se puede trabajar.
   */
  private oscurecerHastaLegible(hex: string): string {
    let actual = hex;
    // 40 pasos del 6 % llegan desde el blanco puro hasta casi negro; el `break` corta antes.
    for (let i = 0; i < 40 && this.luminancia(actual) > ThemeService.LUM_MAX_PARA_BLANCO; i += 1) {
      const [r, g, b] = this.aRgb(actual);
      actual = this.aHex(r * 0.94, g * 0.94, b * 0.94);
    }
    return actual;
  }
}
