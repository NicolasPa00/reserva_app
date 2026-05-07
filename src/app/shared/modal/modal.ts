import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'reserva-modal',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (open) {
      <div class="backdrop" (click)="onBackdropClick($event)">
        <div class="modal" [class.modal--lg]="size === 'lg'" role="dialog" aria-modal="true">
          <header class="modal__head">
            <h3>{{ title }}</h3>
            <button type="button" class="modal__close" (click)="close.emit()" aria-label="Cerrar">
              <lucide-icon name="x" [size]="18" />
            </button>
          </header>
          <section class="modal__body">
            <ng-content />
          </section>
          @if (showFooter) {
            <footer class="modal__foot">
              <ng-content select="[modal-footer]" />
            </footer>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 1rem;
      animation: fade .15s ease;
    }
    .modal {
      background: var(--color-surface); color: var(--color-text-primary);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-elevated);
      width: 100%; max-width: 480px; max-height: calc(100vh - 2rem); display: flex; flex-direction: column;
      animation: pop .15s ease;
    }
    .modal--lg { max-width: 720px; }
    .modal__head {
      display: flex; align-items: center; justify-content: space-between;
      padding: .9rem 1.25rem; border-bottom: 1px solid var(--color-border);
    }
    .modal__head h3 { margin: 0; font-size: 1rem; }
    .modal__close {
      background: transparent; border: 0; cursor: pointer; color: var(--color-text-muted);
      padding: 4px; line-height: 0; border-radius: var(--radius-sm);
    }
    .modal__close:hover { color: var(--color-text-primary); background: var(--color-bg-muted); }
    .modal__body { padding: 1.25rem; overflow-y: auto; }
    .modal__foot {
      display: flex; gap: .5rem; justify-content: flex-end;
      padding: .9rem 1.25rem; border-top: 1px solid var(--color-border);
    }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pop  { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() size: 'md' | 'lg' = 'md';
  @Input() showFooter = true;
  @Input() closeOnBackdrop = true;
  @Output() close = new EventEmitter<void>();

  onBackdropClick(ev: MouseEvent) {
    if (!this.closeOnBackdrop) return;
    if (ev.target === ev.currentTarget) this.close.emit();
  }

  @HostListener('window:keydown.escape')
  onEsc() { if (this.open) this.close.emit(); }
}
