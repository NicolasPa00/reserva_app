import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { Servicio } from '../../core/models';
import { ImageCropperComponent } from '../../shared/image-cropper/image-cropper';
import { MayusculasDirective } from '../../shared/mayusculas.directive';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'reserva-servicios',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, LucideAngularModule, CurrencyPipe,
    ModalComponent, ConfirmDialogComponent, ImageCropperComponent, MayusculasDirective,
  ],
  templateUrl: './servicios.html',
  styleUrl: './servicios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiciosComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api  = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly fb   = inject(FormBuilder);

  readonly servicios = signal<Servicio[]>([]);
  readonly cargando = signal(false);
  readonly busqueda = signal('');
  readonly incluirInactivos = signal(false);

  readonly modalAbierto = signal(false);
  readonly editando = signal<Servicio | null>(null);
  readonly guardando = signal(false);

  // Imagen pendiente de subir: el recorte vive en memoria hasta que se guarda el servicio.
  readonly cropperAbierto = signal(false);
  readonly archivoImagen = signal<File | null>(null);
  readonly imagenBlob = signal<Blob | null>(null);
  readonly imagenPreview = signal('');
  readonly imagenBorrada = signal(false);

  readonly confirmAbierto = signal(false);
  readonly servicioAInactivar = signal<Servicio | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre:       ['', [Validators.required, Validators.maxLength(150)]],
    duracion_min: [30, [Validators.required, Validators.min(5), Validators.max(600)]],
    precio:       [0,  [Validators.required, Validators.min(0)]],
    descripcion:  [''],
    color_hex:    ['#3b82f6', [Validators.pattern(/^#?[0-9a-fA-F]{6}$/)]],
    imagen_url:   [''],
  });

  readonly serviciosFiltrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return this.servicios();
    return this.servicios().filter(s =>
      s.nombre.toLowerCase().includes(q) ||
      (s.descripcion ?? '').toLowerCase().includes(q),
    );
  });

  readonly puedeCrear = computed(() => this.permisoVista()?.puede_crear ?? true);
  readonly puedeEditar = computed(() => this.permisoVista()?.puede_editar ?? true);
  readonly puedeEliminar = computed(() => this.permisoVista()?.puede_eliminar ?? true);

  private permisoVista() {
    return this.auth.permisosVistaActivos().find(p => p.url === '/servicios') ?? null;
  }

  ngOnInit() { this.recargar(); }

  recargar() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.cargando.set(true);
    this.api.listarServicios(idNegocio, { incluirInactivos: this.incluirInactivos() }).subscribe({
      next: r => {
        if (r?.success && r.data) this.servicios.set(r.data);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudieron cargar los servicios.'); this.cargando.set(false); },
    });
  }

  toggleInactivos() {
    this.incluirInactivos.update(v => !v);
    this.recargar();
  }

  abrirCrear() {
    this.limpiarImagenPendiente();
    this.editando.set(null);
    this.form.reset({
      nombre: '', duracion_min: 30, precio: 0, descripcion: '',
      color_hex: '#3b82f6', imagen_url: '',
    });
    this.modalAbierto.set(true);
  }

  abrirEditar(s: Servicio) {
    this.limpiarImagenPendiente();
    this.editando.set(s);
    this.form.reset({
      nombre: s.nombre,
      duracion_min: s.duracion_min,
      precio: Number(s.precio),
      descripcion: s.descripcion ?? '',
      color_hex: s.color_hex ?? '#3b82f6',
      imagen_url: s.imagen_url ?? '',
    });
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
    this.editando.set(null);
    this.limpiarImagenPendiente();
  }

  /**
   * Sube o borra la imagen una vez el servicio existe.
   *
   * Va después de guardar porque el archivo se nombra con el id (`servicio_00007.webp`), y al
   * crear uno nuevo ese id no existe hasta que el backend responde. Un fallo aquí no invalida
   * el guardado: el servicio ya está bien, solo se avisa de que la foto no subió.
   */
  private async sincronizarImagen(idServicio: number | undefined, idNegocio: number): Promise<void> {
    if (!idServicio) return;
    const blob = this.imagenBlob();

    try {
      if (blob) {
        await firstValueFrom(this.api.subirImagenServicio(idServicio, idNegocio, blob));
      } else if (this.imagenBorrada()) {
        await firstValueFrom(this.api.eliminarImagenServicio(idServicio, idNegocio));
      }
    } catch {
      this.toast.warning('El servicio se guardó, pero la imagen no se pudo actualizar.');
    }
  }

  // ── Imagen del servicio ──
  //
  // El recorte se guarda en memoria y se sube DESPUÉS de guardar el servicio: el nombre del
  // archivo lo fija el id de la entidad, y al crear uno nuevo ese id todavía no existe.

  elegirImagen(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.error('Selecciona una imagen (JPG, PNG o WEBP).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.toast.error('La imagen es demasiado grande (máximo 25 MB).');
      return;
    }
    this.archivoImagen.set(file);
    this.cropperAbierto.set(true);
  }

  cerrarCropper() {
    this.cropperAbierto.set(false);
    this.archivoImagen.set(null);
  }

  onImagenRecortada(blob: Blob) {
    this.cerrarCropper();
    this.revocarPreview();
    this.imagenBlob.set(blob);
    this.imagenPreview.set(URL.createObjectURL(blob));
  }

  /** Marca la imagen para borrarse al guardar; el archivo se elimina en el servidor. */
  quitarImagen() {
    this.revocarPreview();
    this.imagenBlob.set(null);
    this.imagenPreview.set('');
    this.imagenBorrada.set(true);
  }

  private revocarPreview() {
    const url = this.imagenPreview();
    if (url) URL.revokeObjectURL(url);
  }

  private limpiarImagenPendiente() {
    this.revocarPreview();
    this.imagenBlob.set(null);
    this.imagenPreview.set('');
    this.imagenBorrada.set(false);
  }

  /** Imagen a mostrar en el modal: la recortada sin subir, o la que ya tiene el servicio. */
  imagenActual(): string {
    if (this.imagenPreview()) return this.imagenPreview();
    if (this.imagenBorrada()) return '';
    return this.urlImagen(this.editando()?.imagen_url);
  }

  /** El backend devuelve rutas relativas; la app vive en otro origen y hay que anteponerlo. */
  urlImagen(ruta: string | null | undefined): string {
    if (!ruta) return '';
    if (/^https?:\/\//i.test(ruta)) return ruta;
    return `${this.api.origenArchivos}${ruta}`;
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;

    const v = this.form.getRawValue();
    const payload: Partial<Servicio> & { id_negocio: number } = {
      id_negocio: idNegocio,
      nombre: v.nombre.trim(),
      duracion_min: Number(v.duracion_min),
      precio: Number(v.precio),
      descripcion: v.descripcion?.trim() || null,
      color_hex: this.normalizarColor(v.color_hex),
      imagen_url: v.imagen_url?.trim() || null,
    };

    this.guardando.set(true);
    const editando = this.editando();
    const obs$ = editando
      ? this.api.actualizarServicio(editando.id_servicio, payload)
      : this.api.crearServicio(payload);

    obs$.subscribe({
      next: async r => {
        if (!r?.success) {
          this.guardando.set(false);
          this.toast.error(r?.message || 'No se pudo guardar.');
          return;
        }
        const idServicio = editando?.id_servicio ?? r.data?.id_servicio;
        await this.sincronizarImagen(idServicio, idNegocio);
        this.guardando.set(false);
        this.toast.success(editando ? 'Servicio actualizado' : 'Servicio creado');
        this.cerrarModal();
        this.recargar();
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar el servicio.');
      },
    });
  }

  pedirInactivar(s: Servicio) {
    this.servicioAInactivar.set(s);
    this.confirmAbierto.set(true);
  }

  inactivarConfirmado() {
    const s = this.servicioAInactivar();
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!s || !idNegocio) return;
    this.api.inactivarServicio(s.id_servicio, idNegocio).subscribe({
      next: r => {
        if (r?.success) {
          this.toast.success('Servicio inactivado');
          this.recargar();
        } else this.toast.error(r?.message || 'No se pudo inactivar.');
        this.cerrarConfirm();
      },
      error: () => { this.toast.error('Error al inactivar.'); this.cerrarConfirm(); },
    });
  }

  cerrarConfirm() {
    this.confirmAbierto.set(false);
    this.servicioAInactivar.set(null);
  }

  private normalizarColor(c: string): string {
    if (!c) return '#3b82f6';
    return c.startsWith('#') ? c : `#${c}`;
  }
}
