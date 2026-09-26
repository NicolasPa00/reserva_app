import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../../core/services/auth.service';
import { EstanciaApiService } from '../../../core/services/estancia-api.service';
import { Estancia, ResumenEstanciasDia } from '../../../core/models';

/**
 * El día de un alojamiento en el dashboard: quién llega, quién se va, cuántas unidades están
 * ocupadas y cuántos pagos esperan validación. Es lo que la recepción mira al abrir; las citas
 * del día no le dicen nada a un hostal.
 */
@Component({
  selector: 'reserva-resumen-estancias',
  standalone: true,
  imports: [LucideAngularModule, DecimalPipe],
  template: `
    @if (resumen(); as r) {
      <section class="card est">
        <header class="est__head">
          <div>
            <h2>Estancias de hoy</h2>
            <p>{{ r.ocupadas }} de {{ r.unidades }} unidades ocupadas · {{ r.ocupacion_pct | number:'1.0-0' }}%</p>
          </div>
          <button type="button" class="btn btn-ghost" (click)="ir('/ocupacion')">
            Ver ocupación <lucide-icon name="arrow-right" [size]="14" />
          </button>
        </header>

        <div class="est__barra"><span [style.width.%]="r.ocupacion_pct"></span></div>

        <div class="est__cifras">
          <div><strong>{{ r.llegadas.length }}</strong><span>llegadas</span></div>
          <div><strong>{{ r.salidas.length }}</strong><span>salidas</span></div>
          <div><strong>{{ r.en_casa }}</strong><span>{{ auth.tieneFuncion('mascotas') ? 'hospedados' : 'en casa' }}</span></div>
          @if (r.pendientes_pago > 0) {
            <button type="button" class="est__alerta" (click)="ir('/estancias')">
              <strong>{{ r.pendientes_pago }}</strong><span>pagos por validar</span>
            </button>
          }
        </div>

        <div class="est__listas">
          <div>
            <h3><lucide-icon name="log-in" [size]="14" /> Llegan hoy</h3>
            @for (e of r.llegadas; track e.id_estancia) {
              <button type="button" class="est__fila" (click)="ir('/estancias')">
                <span>{{ e.cliente_nombre }}</span><em>{{ etiqueta(e) }}</em>
              </button>
            } @empty { <p class="vacio">Nadie llega hoy.</p> }
          </div>
          <div>
            <h3><lucide-icon name="log-out" [size]="14" /> Salen hoy</h3>
            @for (e of r.salidas; track e.id_estancia) {
              <button type="button" class="est__fila" (click)="ir('/estancias')">
                <span>{{ e.cliente_nombre }}</span><em>{{ etiqueta(e) }}</em>
              </button>
            } @empty { <p class="vacio">Nadie sale hoy.</p> }
          </div>
        </div>
      </section>
    }
  `,
  styles: [`
    .est { display: grid; gap: .9rem; }
    .est__head {
      display: flex; justify-content: space-between; align-items: flex-start; gap: .75rem;
      h2 { margin: 0; font-size: 1.05rem; } p { margin: .15rem 0 0; color: var(--color-text-secondary); font-size: .85rem; }
    }
    .est__barra {
      height: 8px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--color-primary) 10%, transparent);
      span { display: block; height: 100%; background: var(--color-primary); border-radius: inherit; transition: width .3s; }
    }
    .est__cifras {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: .5rem;
      > div, > button {
        display: grid; gap: .1rem; padding: .6rem .75rem; border-radius: 12px; text-align: left;
        background: color-mix(in srgb, var(--color-primary) 5%, transparent); border: 0; font: inherit; color: inherit;
        strong { font-size: 1.3rem; } span { font-size: .78rem; color: var(--color-text-secondary); }
      }
    }
    .est__alerta { cursor: pointer; background: color-mix(in srgb, var(--color-warning, #d97706) 14%, transparent) !important; }
    .est__listas {
      display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;
      @media (max-width: 640px) { grid-template-columns: 1fr; }
      h3 { display: flex; align-items: center; gap: .35rem; margin: 0 0 .4rem; font-size: .85rem; color: var(--color-text-secondary); }
    }
    .est__fila {
      width: 100%; display: flex; justify-content: space-between; gap: .5rem; padding: .45rem .55rem; border: 0; border-radius: 8px;
      background: none; font: inherit; color: inherit; cursor: pointer; text-align: left;
      &:hover { background: var(--color-bg-muted); }
      em { font-style: normal; font-size: .8rem; color: var(--color-text-muted); }
    }
    .vacio { margin: 0; font-size: .82rem; color: var(--color-text-muted); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumenEstanciasComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(EstanciaApiService);
  private readonly router = inject(Router);

  readonly resumen = signal<ResumenEstanciasDia | null>(null);

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    const neg = this.auth.negocio()?.id_negocio;
    if (!neg) return;
    this.api.resumenDia(neg).subscribe({ next: r => this.resumen.set(r?.data ?? null), error: () => this.resumen.set(null) });
  }

  etiqueta(e: Estancia): string {
    return [e.unidad?.nombre, `${e.huespedes} pers.`].filter(Boolean).join(' · ');
  }

  ir(ruta: string): void { this.router.navigate([ruta]); }
}
