import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { esHojaMovil } from '../../core/utils/pantalla';

/**
 * Modal base del módulo.
 *
 * ## Por qué el cuerpo no scrollea en horizontal
 *
 * El ancho fijo de 480px con `overflow-y: auto` producía una barra de scroll **horizontal** en
 * cuanto el contenido tenía un grid de dos columnas: un `<input type="datetime-local">` trae un
 * ancho mínimo intrínseco (el texto de la fecha más el icono del calendario) que ningún `1fr`
 * puede comprimir, así que dos de ellos lado a lado desbordaban la caja y el pie de página se
 * quedaba a mitad de camino. Se ve en el formulario de bloqueos.
 *
 * Se arregla en las dos puntas, porque el problema tiene dos mitades:
 *   - aquí, ensanchando el modal por defecto y prohibiendo el desbordamiento horizontal;
 *   - en los grids que lo usan, con `min-width: 0` en las celdas (un item de grid no se encoge
 *     por debajo de su contenido mínimo salvo que se le diga explícitamente).
 *
 * `size` acepta `sm | md | lg | xl` para no tener que elegir entre «estrecho» y «gigante».
 */
@Component({
  selector: 'reserva-modal',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (open) {
      <div class="backdrop" (click)="onBackdropClick($event)">
        <div class="modal" [class]="'modal--' + size" role="dialog" aria-modal="true">
          <header class="modal__head">
            <div class="modal__titles">
              <h3>{{ title }}</h3>
              @if (subtitle) { <p>{{ subtitle }}</p> }
            </div>
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
      position: fixed; inset: 0; background: rgba(15, 10, 42, .5); backdrop-filter: blur(2px);
      z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 1rem;
      animation: fade .15s ease;
    }
    .modal {
      background: var(--color-surface); color: var(--color-text-primary);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      width: 100%; max-height: calc(100vh - 2rem);
      display: flex; flex-direction: column;
      overflow: hidden;              /* el radio recorta el contenido, no lo deja asomar */
      animation: pop .15s ease;
    }
    .modal--sm { max-width: 420px; }
    .modal--md { max-width: 560px; }
    .modal--lg { max-width: 760px; }
    .modal--xl { max-width: 1000px; }

    .modal__head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
      padding: 1rem 1.25rem; border-bottom: 1px solid var(--color-border);
    }
    .modal__titles h3 { margin: 0; font-size: 1.05rem; font-weight: 700; }
    .modal__titles p  { margin: .15rem 0 0; font-size: .82rem; color: var(--color-text-muted); }
    .modal__close {
      background: transparent; border: 0; cursor: pointer; color: var(--color-text-muted);
      padding: 6px; line-height: 0; border-radius: var(--radius-sm); flex-shrink: 0;
      transition: background var(--transition-fast), color var(--transition-fast);
    }
    .modal__close:hover { color: var(--color-text-primary); background: var(--color-bg-muted); }

    .modal__body {
      padding: 1.25rem;
      overflow-y: auto;
      overflow-x: hidden;            /* nada de barra horizontal: el contenido se adapta */
      min-width: 0;
    }
    .modal__foot {
      display: flex; gap: .5rem; justify-content: flex-end; flex-wrap: wrap;
      padding: .9rem 1.25rem; border-top: 1px solid var(--color-border);
      background: var(--color-bg-muted);
    }

    @media (max-width: 640px) {
      .backdrop { padding: 0; align-items: flex-end; }
      .modal, .modal--sm, .modal--md, .modal--lg, .modal--xl {
        max-width: 100%; max-height: 92vh;
        border-bottom-left-radius: 0; border-bottom-right-radius: 0;
      }
    }

    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pop  { from { transform: translateY(8px) scale(.98); opacity: 0; }
                      to   { transform: none; opacity: 1; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() showFooter = true;
  @Input() closeOnBackdrop = true;
  @Output() close = new EventEmitter<void>();

  onBackdropClick(ev: MouseEvent) {
    // El fondo solo descarta en móvil, donde el modal es una hoja y tocar fuera es el gesto
    // esperado. En escritorio se cierra con la «X» o con el botón del pie: ver pantalla.ts.
    if (!this.closeOnBackdrop || !esHojaMovil()) return;
    if (ev.target === ev.currentTarget) this.close.emit();
  }

  @HostListener('window:keydown.escape')
  onEsc() { if (this.open) this.close.emit(); }
}
