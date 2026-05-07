import { Injectable, signal, computed, inject, PLATFORM_ID, effect, DestroyRef } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

import { PaletaColor } from '../models';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'reserva_theme';

/**
 * Tema claro/oscuro/sistema + paleta dinámica del negocio.
 *
 * - El modo (light/dark/system) controla `data-theme` en <html> → activa los
 *   tokens definidos en _theme.scss.
 * - `aplicarPaleta()` sobreescribe variables CSS específicas con los colores
 *   configurados por el dueño del negocio (cargados con la sesión SSO).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  readonly theme = signal<ThemeMode>('light');
  private readonly systemPref = signal<'light' | 'dark'>('light');

  readonly resolved = computed<'light' | 'dark'>(() =>
    this.theme() === 'system' ? this.systemPref() : (this.theme() as 'light' | 'dark')
  );

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemPref.set(mq.matches ? 'dark' : 'light');
    const handler = (e: MediaQueryListEvent) => this.systemPref.set(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', handler));

    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      this.theme.set(saved);
    }

    effect(() => {
      this.document.documentElement.setAttribute('data-theme', this.resolved());
    });
  }

  toggle(): void {
    const next: ThemeMode = this.resolved() === 'light' ? 'dark' : 'light';
    this.set(next);
  }

  set(mode: ThemeMode): void {
    this.theme.set(mode);
    if (isPlatformBrowser(this.platformId)) localStorage.setItem(STORAGE_KEY, mode);
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
