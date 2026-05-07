import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const DEFAULT_DURATION_MS = 3500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  success(message: string, durationMs = DEFAULT_DURATION_MS) { this.show('success', message, durationMs); }
  error  (message: string, durationMs = 5000)                { this.show('error',   message, durationMs); }
  info   (message: string, durationMs = DEFAULT_DURATION_MS) { this.show('info',    message, durationMs); }
  warning(message: string, durationMs = DEFAULT_DURATION_MS) { this.show('warning', message, durationMs); }

  private show(kind: ToastKind, message: string, durationMs: number) {
    const id = this.nextId++;
    this.toasts.update(arr => [...arr, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number) {
    this.toasts.update(arr => arr.filter(t => t.id !== id));
  }
}
