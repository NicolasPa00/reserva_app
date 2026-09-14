import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const DEFAULT_DURATION_MS = 3500;

/**
 * Avisos efímeros de la esquina superior derecha.
 *
 * ## En el servidor no se avisa a nadie
 *
 * Las rutas de la consola se **prerenderizan** (`app.routes.server.ts`), y ahí no hay sesión:
 * cualquier petición que un componente lance en su `ngOnInit` falla, llama a `error()` y el
 * aviso entra en el HTML generado. El `setTimeout` que lo retiraría no llega a cumplirse antes
 * de serializar, así que el archivo se queda con el aviso dentro **para siempre**: cada visita y
 * cada recarga de esa vista empezaba enseñando un error de una petición que nunca se hizo en el
 * navegador de nadie.
 *
 * Por eso en el servidor se descarta. Un aviso es una respuesta a algo que el usuario acaba de
 * hacer, y durante el prerender no hay usuario ni hay acción.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly platformId = inject(PLATFORM_ID);

  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  success(message: string, durationMs = DEFAULT_DURATION_MS) { this.show('success', message, durationMs); }
  error  (message: string, durationMs = 5000)                { this.show('error',   message, durationMs); }
  info   (message: string, durationMs = DEFAULT_DURATION_MS) { this.show('info',    message, durationMs); }
  warning(message: string, durationMs = DEFAULT_DURATION_MS) { this.show('warning', message, durationMs); }

  private show(kind: ToastKind, message: string, durationMs: number) {
    if (!isPlatformBrowser(this.platformId)) return;

    const id = this.nextId++;
    this.toasts.update(arr => [...arr, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number) {
    this.toasts.update(arr => arr.filter(t => t.id !== id));
  }
}
