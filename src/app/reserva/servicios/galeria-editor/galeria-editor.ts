import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../../core/services/auth.service';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { PortafolioImagen } from '../../../core/models';
import { UrlArchivoPipe } from '../../../shared/url-archivo.pipe';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 10;

/**
 * Fotos de un servicio, aparte de su portada (arriba en el formulario). Solo una sale en la
 * tarjeta del catálogo; estas son las que ve quien abre el detalle, en un carrusel.
 *
 * Mismo patrón que `reserva-portafolio-editor` (la galería de un profesional): sube tal cual, sin
 * recorte, y cada subida o borrado va directo al servidor — no hay «Guardar» que olvidar.
 */
@Component({
  selector: 'reserva-galeria-servicio-editor',
  standalone: true,
  imports: [LucideAngularModule, UrlArchivoPipe],
  template: `
    <p class="hint">Estas fotos salen en el detalle del servicio, en un carrusel.</p>

    <div class="galeria">
      @for (img of imagenes(); track img.id_imagen) {
        <figure class="galeria__item">
          <img [src]="img.url | urlArchivo" [alt]="img.descripcion || 'Foto'" loading="lazy" />
          @if (img.descripcion) { <figcaption>{{ img.descripcion }}</figcaption> }
          <button type="button" class="galeria__quitar" (click)="eliminar(img)" [disabled]="ocupado()"
                  aria-label="Quitar foto" title="Quitar">
            <lucide-icon name="trash-2" [size]="14" />
          </button>
        </figure>
      }
      <label class="galeria__nuevo" [class.galeria__nuevo--ocupado]="ocupado()">
        <lucide-icon name="image-plus" [size]="22" />
        <span>{{ ocupado() ? 'Subiendo…' : 'Añadir foto' }}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden
               [disabled]="ocupado()" (change)="subir($event)" />
      </label>
    </div>

    <input class="input descripcion" type="text" maxlength="200"
           placeholder="Descripción para la próxima foto (opcional)"
           [value]="descripcion()" (input)="descripcion.set($any($event.target).value)" />
  `,
  styles: [`
    .hint { margin: 0 0 .75rem; color: var(--color-text-secondary); font-size: .88rem; }
    .galeria { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: .5rem; }
    .galeria__item {
      position: relative; margin: 0; border-radius: 10px; overflow: hidden; aspect-ratio: 1; background: var(--color-bg-muted);
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
      figcaption {
        position: absolute; inset: auto 0 0 0; padding: .25rem .4rem; font-size: .7rem; color: #fff;
        background: linear-gradient(transparent, rgba(0,0,0,.7)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
    }
    .galeria__quitar {
      position: absolute; top: .3rem; right: .3rem; width: 26px; height: 26px; border-radius: 50%; border: 0;
      display: grid; place-items: center; cursor: pointer; background: rgba(255,255,255,.92); color: var(--color-danger, #dc2626);
    }
    .galeria__nuevo {
      aspect-ratio: 1; border: 1.5px dashed var(--color-border); border-radius: 10px; cursor: pointer;
      display: grid; place-content: center; justify-items: center; gap: .25rem; font-size: .8rem; color: var(--color-text-secondary);
      &:hover { border-color: var(--color-primary); color: var(--color-primary); }
      &--ocupado { opacity: .6; cursor: progress; }
    }
    .descripcion { margin-top: .75rem; width: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GaleriaServicioEditorComponent {
  private readonly api = inject(ReservaApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly idServicio = input.required<number>();

  readonly imagenes = signal<PortafolioImagen[]>([]);
  readonly descripcion = signal('');
  readonly ocupado = signal(false);

  constructor() {
    effect(() => {
      const id = this.idServicio();
      const neg = this.auth.negocio()?.id_negocio;
      if (!id || !neg) return;
      this.api.listarGaleriaServicio(id, neg).subscribe({
        next: r => this.imagenes.set(r?.data ?? []),
        error: () => this.toast.error('No se pudo cargar la galería.'),
      });
    });
  }

  subir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    const neg = this.auth.negocio()?.id_negocio;
    if (!archivo || !neg) return;
    if (!TIPOS.includes(archivo.type)) { this.toast.error('Selecciona una imagen (JPG, PNG o WEBP).'); return; }
    if (archivo.size > MAX_MB * 1024 * 1024) { this.toast.error(`La imagen supera ${MAX_MB} MB.`); return; }

    this.ocupado.set(true);
    this.api.agregarGaleriaServicio(this.idServicio(), neg, archivo, this.descripcion().trim() || null).subscribe({
      next: r => {
        this.ocupado.set(false);
        if (r?.data) { this.imagenes.update(l => [...l, r.data!]); this.descripcion.set(''); }
      },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo subir la foto.'); },
    });
  }

  eliminar(img: PortafolioImagen): void {
    const neg = this.auth.negocio()?.id_negocio;
    if (!neg) return;
    this.ocupado.set(true);
    this.api.eliminarGaleriaServicio(img.id_imagen, neg).subscribe({
      next: () => { this.ocupado.set(false); this.imagenes.update(l => l.filter(x => x.id_imagen !== img.id_imagen)); },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo quitar la foto.'); },
    });
  }
}
