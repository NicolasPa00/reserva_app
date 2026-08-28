import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { CurrencyPipe } from '@angular/common';

import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { Servicio } from '../../../core/models';

/**
 * Placeholder de Ola 2: lista los servicios disponibles del negocio.
 * El wizard completo (servicio → profesional → hora → form + comprobante)
 * se construye en Ola 5.
 */
@Component({
  selector: 'reserva-publico-inicio',
  standalone: true,
  imports: [LucideAngularModule, CurrencyPipe],
  template: `
    <section>
      <h1>Reserva tu cita</h1>
      <p class="hint">Elige el servicio que deseas reservar.</p>

      @if (cargando()) { <p class="hint">Cargando servicios…</p> }
      @else if (error()) { <p class="error">{{ error() }}</p> }
      @else if (servicios().length === 0) {
        <p class="hint">Este negocio aún no tiene servicios publicados.</p>
      } @else {
        <div class="grid">
          @for (s of servicios(); track s.id_servicio) {
            <article class="card servicio">
              <header [style.background]="s.color_hex || 'var(--color-primary)'">
                <lucide-icon name="scissors" [size]="20" />
              </header>
              <div class="servicio__body">
                <strong>{{ s.nombre }}</strong>
                <span class="duracion">{{ s.duracion_min }} min</span>
                <span class="precio">{{ s.precio | currency:'COP':'symbol':'1.0-0' }}</span>
                @if (s.descripcion) { <p>{{ s.descripcion }}</p> }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    h1 { margin: 0 0 .35rem; font-size: 1.4rem; }
    .hint, .error { color: var(--color-text-muted); }
    .error { color: var(--color-error); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin-top: 1.25rem; }
    .servicio { padding: 0; overflow: hidden; }
    .servicio header { padding: 1rem; color: #fff; display: flex; align-items: center; }
    .servicio__body { padding: 1rem; display: flex; flex-direction: column; gap: .25rem; }
    .servicio__body strong { font-size: 1rem; color: var(--color-text-primary); }
    .duracion { font-size: .8rem; color: var(--color-text-muted); }
    .precio { font-weight: 700; color: var(--color-primary); margin-top: .25rem; }
    .servicio__body p { font-size: .85rem; color: var(--color-text-secondary); margin-top: .5rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoInicioComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservaApiService);

  readonly servicios = signal<Servicio[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id_negocio'));
    if (!id) { this.error.set('Negocio no especificado en la URL'); return; }
    this.cargando.set(true);
    this.api.publicoListarServicios(id).subscribe({
      next: r => {
        if (r?.success && r.data) this.servicios.set(r.data);
        else this.error.set(r?.message || 'No se pudo cargar la lista de servicios.');
        this.cargando.set(false);
      },
      error: () => { this.error.set('Error de conexión.'); this.cargando.set(false); },
    });
  }
}
