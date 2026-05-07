import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'reserva-sin-acceso',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="state">
      <span class="state__icon"><lucide-icon name="triangle-alert" [size]="32" /></span>
      <h2>Sin acceso al módulo de reservas</h2>
      <p>Tu usuario no tiene permisos asignados. Habla con el administrador del negocio.</p>
      <button class="btn btn-outline" type="button" (click)="auth.logout()">Salir</button>
    </div>
  `,
  styles: [`
    .state { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
             gap: .75rem; padding: 2rem; text-align: center; color: var(--color-text-secondary); }
    .state__icon { width: 64px; height: 64px; border-radius: 50%;
      background: var(--color-warning-bg); color: var(--color-warning);
      display: flex; align-items: center; justify-content: center; }
    h2 { color: var(--color-text-primary); margin: 0; }
    p { max-width: 360px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SinAccesoComponent {
  readonly auth = inject(AuthService);
}
