import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom, forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { CategoriaReserva, Servicio } from '../../core/models';
import { ImageCropperComponent } from '../../shared/image-cropper/image-cropper';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { MonedaPipe } from '../../shared/moneda.pipe';
import { MonedaService } from '../../core/services/moneda.service';

@Component({
  selector: 'reserva-servicios',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, LucideAngularModule, MonedaPipe,
    ModalComponent, ConfirmDialogComponent, ImageCropperComponent,
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
  private readonly monedas = inject(MonedaService);

  /**
   * El código de la moneda, para la etiqueta del campo de precio.
   *
   * Estaba escrito «COP» a mano: en un negocio chileno el formulario pedía pesos colombianos y
   * la lista de abajo mostraba pesos chilenos, con el mismo número en las dos.
   */
  readonly codigoMoneda = computed(() => this.monedas.moneda().codigo);

  /**
   * Cuánto sube el precio con las flechas del campo.
   *
   * Donde no hay céntimos (COP, CLP) los precios se mueven en miles y el paso de 500 ahorra
   * pulsaciones; donde sí los hay, un paso de 500 haría inalcanzable un servicio de 25,50.
   */
  readonly pasoPrecio = computed(() => (this.monedas.moneda().decimales > 0 ? 0.5 : 500));

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

  // ── Categorías ──
  //
  // Se gestionan desde aquí y no en una pantalla propia porque solo existen para agrupar
  // servicios: separarlas obligaría a ir y volver para clasificar cada alta.
  readonly categorias = signal<CategoriaReserva[]>([]);
  readonly modalCategorias = signal(false);
  readonly nombreCategoria = signal('');
  readonly categoriaEditando = signal<CategoriaReserva | null>(null);
  readonly confirmCategoria = signal(false);
  readonly categoriaABorrar = signal<CategoriaReserva | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre:       ['', [Validators.required, Validators.maxLength(150)]],
    duracion_min: [30, [Validators.required, Validators.min(5), Validators.max(600)]],
    precio:       [0,  [Validators.required, Validators.min(0)]],
    descripcion:  [''],
    id_categoria: [''],
    imagen_url:   [''],
  });

  readonly serviciosFiltrados = computed(() => {
    const base = this.incluirInactivos()
      ? this.servicios()
      : this.servicios().filter(s => s.estado === 'A');

    const q = this.busqueda().trim().toLowerCase();
    if (!q) return base;
    return base.filter(s =>
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
    forkJoin({
      servicios: this.api.listarServicios(idNegocio, { incluirInactivos: true }),
      categorias: this.api.listarCategorias(idNegocio),
    }).subscribe({
      next: ({ servicios, categorias }) => {
        if (servicios?.success && servicios.data) this.servicios.set(servicios.data);
        if (categorias?.success && categorias.data) this.categorias.set(categorias.data);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudieron cargar los servicios.'); this.cargando.set(false); },
    });
  }

  /**
   * El catálogo agrupado tal y como se verá en el portal.
   *
   * Se construye desde `categorias` y no desde los servicios: así una categoría recién creada
   * aparece vacía —y se ve que hay que llenarla— en vez de no existir hasta tener contenido.
   * Los servicios sin clasificar van al final, nunca ocultos.
   */
  readonly grupos = computed(() => {
    const filtrados = this.serviciosFiltrados();
    const grupos = this.categorias().map(c => ({
      categoria: c as CategoriaReserva | null,
      nombre: c.nombre,
      servicios: filtrados.filter(s => s.id_categoria === c.id_categoria),
    }));

    const sueltos = filtrados.filter(s => s.id_categoria == null);
    if (sueltos.length) {
      grupos.push({ categoria: null, nombre: 'Sin categoría', servicios: sueltos });
    }
    // Con búsqueda activa, una categoría sin coincidencias solo estorba.
    return this.busqueda().trim() ? grupos.filter(g => g.servicios.length > 0) : grupos;
  });

  // ── Gestión de categorías ──

  abrirCategorias() {
    this.nombreCategoria.set('');
    this.categoriaEditando.set(null);
    this.modalCategorias.set(true);
  }

  editarCategoria(c: CategoriaReserva) {
    this.categoriaEditando.set(c);
    this.nombreCategoria.set(c.nombre);
  }

  cancelarEdicionCategoria() {
    this.categoriaEditando.set(null);
    this.nombreCategoria.set('');
  }

  guardarCategoria() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    const nombre = this.nombreCategoria().trim();
    if (!idNegocio || !nombre) return;

    this.guardando.set(true);
    const editando = this.categoriaEditando();
    const peticion = editando
      ? this.api.actualizarCategoria(editando.id_categoria, idNegocio, { nombre })
      : this.api.crearCategoria(idNegocio, nombre);

    peticion.subscribe({
      next: r => {
        this.guardando.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.toast.success(editando ? 'Categoría actualizada' : 'Categoría creada');
        this.cancelarEdicionCategoria();
        this.recargar();
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar la categoría.');
      },
    });
  }

  pedirBorrarCategoria(c: CategoriaReserva) {
    this.categoriaABorrar.set(c);
    this.confirmCategoria.set(true);
  }

  borrarCategoriaConfirmado() {
    const c = this.categoriaABorrar();
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!c || !idNegocio) return;

    this.api.eliminarCategoria(c.id_categoria, idNegocio).subscribe({
      next: r => {
        this.confirmCategoria.set(false);
        this.categoriaABorrar.set(null);
        if (r?.success) { this.toast.success(r.message); this.recargar(); }
        else this.toast.error(r?.message || 'No se pudo eliminar.');
      },
      error: e => {
        this.confirmCategoria.set(false);
        this.categoriaABorrar.set(null);
        this.toast.error(e?.error?.message || 'Error al eliminar la categoría.');
      },
    });
  }

  /** Sube o baja una categoría una posición; el orden manda en el portal. */
  moverCategoria(indice: number, delta: -1 | 1) {
    const lista = [...this.categorias()];
    const destino = indice + delta;
    if (destino < 0 || destino >= lista.length) return;
    [lista[indice], lista[destino]] = [lista[destino], lista[indice]];

    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    // Optimista: reordenar es reversible y esperar al servidor para mover una fila se siente
    // roto. Si falla, se recarga y vuelve a su sitio.
    this.categorias.set(lista);
    this.api.reordenarCategorias(idNegocio, lista.map(c => c.id_categoria)).subscribe({
      error: () => { this.toast.error('No se pudo guardar el orden.'); this.recargar(); },
    });
  }

  /** Filtro local: no hay petición detrás, así que alternarlo es instantáneo. */
  toggleInactivos() {
    this.incluirInactivos.update(v => !v);
  }

  /** Si no hay ninguno inactivo, el check no se pinta: un control que no cambia nada estorba. */
  readonly hayInactivos = computed(() => this.servicios().some(s => s.estado === 'I'));

  abrirCrear() {
    this.limpiarImagenPendiente();
    this.editando.set(null);
    this.form.reset({
      nombre: '', duracion_min: 30, precio: 0, descripcion: '',
      imagen_url: '', id_categoria: '',
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
      imagen_url: s.imagen_url ?? '',
      id_categoria: s.id_categoria != null ? String(s.id_categoria) : '',
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
      imagen_url: v.imagen_url?.trim() || null,
      // El `<select>` devuelve texto; `''` es «sin categoría» y viaja como null.
      id_categoria: v.id_categoria ? Number(v.id_categoria) : null,
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

}
