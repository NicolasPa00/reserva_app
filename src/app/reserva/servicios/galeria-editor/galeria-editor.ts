import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { PortafolioImagen } from '../../../core/models';
import { UrlArchivoPipe } from '../../../shared/url-archivo.pipe';
import { ImageCropperComponent } from '../../../shared/image-cropper/image-cropper';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 25;

/** Una foto recortada que todavía no existe en el servidor. */
interface FotoPendiente {
  blob: Blob;
  /** `objectURL` para la vista previa; se revoca al soltarla. */
  preview: string;
  descripcion: string | null;
}

/**
 * Fotos de un servicio, aparte de su portada (arriba en el formulario). Solo una sale en la
 * tarjeta del catálogo; estas son las que ve quien abre el detalle, en un carrusel.
 *
 * ## Sirve igual creando que editando
 *
 * Antes solo funcionaba editando: al crear un servicio se leía «guarda primero y luego añade las
 * fotos», porque el archivo se nombra con el id de la entidad y ese id no existe hasta que el
 * backend responde. Es el mismo problema que ya tenía la portada, y se resuelve igual: el
 * recorte se queda en memoria y se sube **después** de guardar. Mientras tanto se ve en la
 * rejilla como una más, marcada como pendiente.
 *
 * El padre (`servicios.ts`) llama a `subirPendientes()` cuando el servicio ya tiene id.
 *
 * ## Todas pasan por el recorte
 *
 * El carrusel del detalle es 4:3 (`servicio.scss`). Subir la foto tal cual dejaba que el
 * navegador la recortara por su cuenta, sin que nadie viera dónde iba a quedar el centro. Ahora
 * se recorta con la misma herramienta y la misma proporción que la portada, así lo que se ve al
 * ajustar es exactamente lo que sale publicado.
 */
@Component({
  selector: 'reserva-galeria-servicio-editor',
  standalone: true,
  imports: [LucideAngularModule, UrlArchivoPipe, ImageCropperComponent],
  template: `
    <p class="hint">
      Estas fotos salen en el detalle del servicio, en un carrusel.
      @if (!idServicio()) { <strong>Se suben al guardar.</strong> }
    </p>

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

      @for (p of pendientes(); track p.preview) {
        <figure class="galeria__item galeria__item--pendiente">
          <img [src]="p.preview" [alt]="p.descripcion || 'Foto por subir'" />
          <span class="galeria__etiqueta">Por subir</span>
          @if (p.descripcion) { <figcaption>{{ p.descripcion }}</figcaption> }
          <button type="button" class="galeria__quitar" (click)="quitarPendiente(p)" [disabled]="ocupado()"
                  aria-label="Quitar foto" title="Quitar">
            <lucide-icon name="trash-2" [size]="14" />
          </button>
        </figure>
      }

      <label class="galeria__nuevo" [class.galeria__nuevo--ocupado]="ocupado()">
        <lucide-icon name="image-plus" [size]="22" />
        <span>{{ ocupado() ? 'Subiendo…' : 'Añadir foto' }}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden
               [disabled]="ocupado()" (change)="elegir($event)" />
      </label>
    </div>

    <input class="input descripcion" type="text" maxlength="200"
           placeholder="Descripción para la próxima foto (opcional)"
           [value]="descripcion()" (input)="descripcion.set($any($event.target).value)" />

    @if (cropperAbierto() && archivo(); as file) {
      <reserva-image-cropper
        [file]="file"
        [aspect]="4 / 3"
        [outputWidth]="640"
        titulo="Ajustar la foto"
        (recortada)="onRecortada($event)"
        (cancelada)="cerrarCropper()" />
    }
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
      &--pendiente { outline: 2px dashed var(--color-primary); outline-offset: -2px; }
    }
    .galeria__etiqueta {
      position: absolute; top: .3rem; left: .3rem; padding: .1rem .35rem; border-radius: 999px;
      font-size: .62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
      background: var(--color-primary); color: var(--color-on-primary, #fff);
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
export class GaleriaServicioEditorComponent implements OnDestroy {
  private readonly api = inject(ReservaApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** `null` mientras el servicio no existe: las fotos se quedan pendientes hasta que tenga id. */
  readonly idServicio = input<number | null>(null);

  readonly imagenes = signal<PortafolioImagen[]>([]);
  readonly pendientes = signal<FotoPendiente[]>([]);
  readonly descripcion = signal('');
  readonly ocupado = signal(false);

  readonly archivo = signal<File | null>(null);
  readonly cropperAbierto = signal(false);

  /** Lo usa el padre para saber si hay algo que subir tras guardar. */
  readonly hayPendientes = computed(() => this.pendientes().length > 0);

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

  ngOnDestroy(): void {
    this.pendientes().forEach(p => URL.revokeObjectURL(p.preview));
  }

  elegir(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!TIPOS.includes(file.type)) { this.toast.error('Selecciona una imagen (JPG, PNG o WEBP).'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { this.toast.error(`La imagen supera ${MAX_MB} MB.`); return; }
    this.archivo.set(file);
    this.cropperAbierto.set(true);
  }

  cerrarCropper(): void {
    this.cropperAbierto.set(false);
    this.archivo.set(null);
  }

  onRecortada(blob: Blob): void {
    this.cerrarCropper();
    const descripcion = this.descripcion().trim() || null;
    this.descripcion.set('');

    const id = this.idServicio();
    // Servicio nuevo: se guarda en memoria y sube al final, como la portada.
    if (!id) {
      this.pendientes.update(l => [...l, { blob, preview: URL.createObjectURL(blob), descripcion }]);
      return;
    }

    const neg = this.auth.negocio()?.id_negocio;
    if (!neg) return;
    this.ocupado.set(true);
    this.api.agregarGaleriaServicio(id, neg, blob, descripcion).subscribe({
      next: r => {
        this.ocupado.set(false);
        if (r?.data) this.imagenes.update(l => [...l, r.data!]);
      },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo subir la foto.'); },
    });
  }

  quitarPendiente(p: FotoPendiente): void {
    URL.revokeObjectURL(p.preview);
    this.pendientes.update(l => l.filter(x => x !== p));
  }

  /** Una que ya está en el servidor: se borra allí en el momento, sin esperar a «Guardar». */
  eliminar(img: PortafolioImagen): void {
    const neg = this.auth.negocio()?.id_negocio;
    if (!neg) return;
    this.ocupado.set(true);
    this.api.eliminarGaleriaServicio(img.id_imagen, neg).subscribe({
      next: () => {
        this.ocupado.set(false);
        this.imagenes.update(l => l.filter(x => x.id_imagen !== img.id_imagen));
      },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo quitar la foto.'); },
    });
  }

  /**
   * Sube lo que quedó en espera, ya con el id del servicio recién creado.
   *
   * @returns cuántas no se pudieron subir; el padre avisa con eso sin invalidar el guardado —
   *          el servicio ya existe y es correcto, solo le faltan fotos.
   */
  async subirPendientes(idServicio: number, idNegocio: number): Promise<number> {
    const cola = this.pendientes();
    if (cola.length === 0) return 0;

    this.ocupado.set(true);
    let fallidas = 0;
    for (const p of cola) {
      try {
        await firstValueFrom(this.api.agregarGaleriaServicio(idServicio, idNegocio, p.blob, p.descripcion));
        URL.revokeObjectURL(p.preview);
      } catch {
        fallidas += 1;
      }
    }
    this.pendientes.set([]);
    this.ocupado.set(false);
    return fallidas;
  }
}
