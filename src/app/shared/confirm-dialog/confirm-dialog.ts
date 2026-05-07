import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalComponent } from '../modal/modal';

@Component({
  selector: 'reserva-confirm',
  standalone: true,
  imports: [ModalComponent],
  template: `
    <reserva-modal [open]="open" [title]="title" (close)="cancel.emit()">
      <p style="margin: 0; color: var(--color-text-secondary);">{{ message }}</p>
      <div modal-footer style="display: flex; gap: .5rem;">
        <button type="button" class="btn btn-outline" (click)="cancel.emit()">{{ cancelText }}</button>
        <button type="button" class="btn"
                [class.btn-primary]="kind === 'primary'"
                [class.btn-danger]="kind === 'danger'"
                (click)="confirm.emit()">
          {{ confirmText }}
        </button>
      </div>
    </reserva-modal>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  @Input() open = false;
  @Input() title = 'Confirmar';
  @Input() message = '¿Estás seguro?';
  @Input() confirmText = 'Confirmar';
  @Input() cancelText = 'Cancelar';
  @Input() kind: 'primary' | 'danger' = 'primary';
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
