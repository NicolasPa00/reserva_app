import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Placeholder reusable para features que se construirán en olas siguientes.
 * Lo dejamos por separado para facilitar reemplazo gradual sin tocar app.routes.
 */
@Component({
  selector: 'reserva-placeholder',
  standalone: true,
  template: `
    <section class="page">
      <header class="page__head">
        <div>
          <h1>{{ titulo }}</h1>
          <p>{{ descripcion }}</p>
        </div>
      </header>
      <div class="card">
        <p style="color: var(--color-text-muted)">
          Esta vista se implementa en una ola posterior. La estructura, permisos y
          navegación ya están listos — solo falta el contenido.
        </p>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderComponent {
  @Input() titulo = 'Próximamente';
  @Input() descripcion = '';
}
