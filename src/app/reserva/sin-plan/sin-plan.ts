import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'reserva-sin-plan',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="state">
      <span class="state__icon"><lucide-icon name="credit-card" [size]="32" /></span>
      <h2>Plan inactivo</h2>
      <p>Este negocio no tiene un plan vigente. Activa o renueva el plan en el panel de administración para continuar usando reservas.</p>
      <a class="btn btn-primary" [href]="adminUrl">Ir al panel</a>
      <button class="btn btn-ghost" type="button" (click)="auth.logout()">Salir</button>
    </div>
  `,
  styles: [`
    .state { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
             gap: .75rem; padding: 2rem; text-align: center; color: var(--color-text-secondary); }
    .state__icon { width: 64px; height: 64px; border-radius: 50%;
      background: var(--color-info-bg); color: var(--color-info);
      display: flex; align-items: center; justify-content: center; }
    h2 { color: var(--color-text-primary); margin: 0; }
    p { max-width: 420px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SinPlanComponent {
  readonly auth = inject(AuthService);
  readonly adminUrl = environment.adminUrl;
}
