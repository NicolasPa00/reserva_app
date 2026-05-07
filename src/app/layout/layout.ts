import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar/sidebar';
import { ToastHostComponent } from './toast-host/toast-host';

@Component({
  selector: 'reserva-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, ToastHostComponent],
  template: `
    <div class="layout">
      <reserva-sidebar />
      <main class="layout__content">
        <router-outlet />
      </main>
    </div>
    <reserva-toast-host />
  `,
  styles: [`
    .layout { display: flex; min-height: 100vh; background: var(--color-bg); }
    .layout__content { flex: 1; min-width: 0; overflow-y: auto; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent {}
