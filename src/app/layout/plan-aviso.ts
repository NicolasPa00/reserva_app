import {
  ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../core/services/auth.service';
import { environment } from '../../environments/environment';

/** Dónde se recuerda que el usuario ya cerró el aviso. */
const DISMISS_KEY = 'reserva_plan_aviso_oculto';

/**
 * PlanAvisoComponent — aviso de plan vencido dentro del periodo de gracia.
 *
 * El backend da 5 días de margen después del vencimiento (ver `planHelper`):
 * durante ellos el negocio sigue trabajando con normalidad y esta franja le
 * recuerda cuántos días le quedan para ponerse al día.
 *
 * La "X" lo oculta **para esta sesión**: lo cerrado se guarda contra el token
 * actual, así que al volver a iniciar sesión el aviso reaparece. Si se guardara
 * a secas, el usuario lo cerraría una vez y no volvería a verlo nunca.
 */
@Component({
  selector: 'reserva-plan-aviso',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    @if (visible()) {
      <div class="plan-aviso" role="status">
        <lucide-icon name="triangle-alert" [size]="18" aria-hidden="true" />

        <p class="plan-aviso__text">
          <strong>Tu plan está vencido.</strong>
          Tienes {{ dias() }} {{ dias() === 1 ? 'día' : 'días' }} para actualizar tu pago;
          después se bloqueará el acceso al sistema.
        </p>

        <a class="plan-aviso__cta" [href]="urlPlan" target="_blank" rel="noopener">
          Actualizar pago
        </a>

        <button type="button" class="plan-aviso__close" aria-label="Ocultar aviso"
                (click)="ocultar()">
          <lucide-icon name="x" [size]="16" aria-hidden="true" />
        </button>
      </div>
    }
  `,
  styles: [`
    .plan-aviso {
      display: flex; align-items: center; gap: .5rem;
      padding: .65rem 1.5rem;
      background: var(--color-warning-bg, #fff3e0);
      color: var(--color-warning, #b45309);
      border-bottom: 1px solid color-mix(in srgb, var(--color-warning, #b45309) 35%, transparent);
      font-size: .86rem;
    }
    .plan-aviso__text { flex: 1; margin: 0; line-height: 1.35; }
    .plan-aviso__cta {
      flex-shrink: 0; padding: .35rem .75rem;
      border-radius: 999px;
      background: var(--color-warning, #b45309); color: #fff;
      font-weight: 600; text-decoration: none; white-space: nowrap;
    }
    .plan-aviso__cta:hover { filter: brightness(1.08); }
    .plan-aviso__close {
      flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
      padding: .25rem; border: 0; border-radius: 6px;
      background: transparent; color: inherit; cursor: pointer;
    }
    .plan-aviso__close:hover {
      background: color-mix(in srgb, var(--color-warning, #b45309) 18%, transparent);
    }
    @media (max-width: 767px) {
      .plan-aviso { flex-wrap: wrap; padding: .65rem 1rem; font-size: .8rem; }
      .plan-aviso__text { flex-basis: 100%; order: 2; }
    }
  `],
})
export class PlanAvisoComponent {
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  /** Consola del SaaS: es donde el negocio consulta su plan y su vencimiento. */
  readonly urlPlan = `${environment.adminUrl ?? ''}/admin/configuracion`;

  private readonly cerrado = signal(this.leerCerrado());

  readonly dias = computed(() => this.auth.diasGraciaPlan());

  readonly visible = computed(() => this.auth.planEnGracia() && !this.cerrado());

  ocultar(): void {
    this.cerrado.set(true);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(DISMISS_KEY, this.auth.getAccessToken() ?? '');
    } catch {
      // No-op: sin almacenamiento el aviso simplemente reaparece al recargar.
    }
  }

  /** ¿Ya lo cerró en ESTA sesión? Se compara contra el token con el que entró. */
  private leerCerrado(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      const guardado = localStorage.getItem(DISMISS_KEY);
      const token = this.auth.getAccessToken();
      return !!guardado && !!token && guardado === token;
    } catch {
      return false;
    }
  }
}
