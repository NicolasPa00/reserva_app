import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'reserva-toast-host',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="toasts" aria-live="polite" aria-atomic="true">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast--' + t.kind">
          <lucide-icon [name]="iconFor(t.kind)" [size]="18" />
          <span>{{ t.message }}</span>
          <button type="button" class="toast__close" (click)="toast.dismiss(t.id)" aria-label="Cerrar">
            <lucide-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toasts { position: fixed; top: 1rem; right: 1rem; display: flex; flex-direction: column; gap: .5rem; z-index: 9999; max-width: 360px; }
    .toast {
      display: flex; align-items: center; gap: .55rem;
      padding: .65rem .85rem; border-radius: var(--radius-md);
      background: var(--color-surface); border: 1px solid var(--color-border);
      box-shadow: var(--shadow-elevated); font-size: .85rem; color: var(--color-text-primary);
      animation: slide-in .2s ease;
    }
    .toast--success { border-left: 4px solid var(--color-success); }
    .toast--error   { border-left: 4px solid var(--color-error); }
    .toast--info    { border-left: 4px solid var(--color-info); }
    .toast--warning { border-left: 4px solid var(--color-warning); }
    .toast--success lucide-icon:first-child { color: var(--color-success); }
    .toast--error lucide-icon:first-child   { color: var(--color-error); }
    .toast--info lucide-icon:first-child    { color: var(--color-info); }
    .toast--warning lucide-icon:first-child { color: var(--color-warning); }
    .toast span { flex: 1; min-width: 0; }
    .toast__close { background: transparent; border: 0; color: var(--color-text-muted); cursor: pointer; padding: 2px; line-height: 0; }
    .toast__close:hover { color: var(--color-text-primary); }
    @keyframes slide-in { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  readonly toast = inject(ToastService);

  iconFor(kind: string): string {
    switch (kind) {
      case 'success': return 'check';
      case 'error':   return 'triangle-alert';
      case 'warning': return 'triangle-alert';
      default:        return 'bell';
    }
  }
}
