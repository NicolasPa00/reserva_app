import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom, forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { CatalogoVistaPrevia, CategoriaReserva, Servicio, TipoRecurso, VarianteServicio } from '../../core/models';
import { PerfilApiService } from '../../core/services/perfil-api.service';
import { TerminoPipe } from '../../shared/termino.pipe';
import { ImageCropperComponent } from '../../shared/image-cropper/image-cropper';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { MonedaPipe } from '../../shared/moneda.pipe';
import { MonedaService } from '../../core/services/moneda.service';
import { GaleriaServicioEditorComponent } from './galeria-editor/galeria-editor';

@Component({
  selector: 'reserva-servicios',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, LucideAngularModule, MonedaPipe, TerminoPipe,
    ModalComponent, ConfirmDialogComponent, ImageCropperComponent, GaleriaServicioEditorComponent,
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
  private readonly perfilApi = inject(PerfilApiService);

  // ── Perfil del rubro ──
  //
  // Cada campo extra del formulario aparece solo si el negocio tiene su función encendida. En
  // una barbería (perfil BASE, todo apagado) el formulario es exactamente el de siempre.
  readonly conProceso = computed(() => this.auth.tieneFuncion('tiempo_proceso'));
  readonly conVariantes = computed(() => this.auth.tieneFuncion('variantes'));
  readonly conCotizar = computed(() => this.auth.tieneFuncion('a_cotizar'));
  readonly conConsentimiento = computed(() => this.auth.tieneFuncion('consentimiento'));
  readonly conRecursos = computed(() => this.auth.tieneFuncion('recursos'));
  readonly conMascotas = computed(() => this.auth.tieneFuncion('mascotas'));
  readonly tiposRecurso = signal<TipoRecurso[]>([]);
  /** Variantes en edición (largo, tamaño, zona). Se guardan con el servicio. */
  readonly variantes = signal<VarianteServicio[]>([]);

  // Catálogo de arranque: se ofrece cuando no hay ningún servicio activo.
  readonly catalogo = signal<CatalogoVistaPrevia | null>(null);
  readonly sembrando = signal(false);
  readonly nombresCatalogo = computed(() => (this.catalogo()?.categorias ?? []).map(c => c.categoria).join(', '));
  readonly sinServicios = computed(() => !this.cargando() && !this.servicios().some(x => x.estado === 'A'));

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
  /** El editor de fotos del modal: al crear, guarda en memoria lo que haya que subir después. */
  private readonly galeria = viewChild(GaleriaServicioEditorComponent);

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
    // Sin `required`: con el rango encendido el precio fijo es opcional (ver `guardar`).
    precio:       [0,  [Validators.min(0)]],
    descripcion:  [''],
    id_categoria: [''],
    imagen_url:   [''],
    proceso_desde_min:       [0, [Validators.min(0), Validators.max(600)]],
    proceso_min:             [0, [Validators.min(0), Validators.max(600)]],
    a_cotizar:               [false],
    // Solo del formulario: en la base el rango son las dos columnas, y «lo usa» es simplemente
    // que alguna tenga valor. Aquí es un interruptor para que apagarlo borre las dos de una.
    usa_rango:               [false],
    // `<input type="number">`: el control entrega número o null, nunca texto.
    precio_min:              [null as number | null],
    precio_max:              [null as number | null],
    requiere_consentimiento: [false],
    id_tipo_recurso:         [''],
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
        if (this.sinServicios() && this.puedeCrear()) this.cargarCatalogo(idNegocio);
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
  private cargarCatalogo(idNegocio: number) {
    this.perfilApi.catalogoVistaPrevia(idNegocio).subscribe({
      next: r => this.catalogo.set(r?.success && r.data?.total_servicios ? r.data : null),
      error: () => this.catalogo.set(null),
    });
  }

  private cargarTiposRecurso(idNegocio: number) {
    if (!this.conRecursos()) { this.tiposRecurso.set([]); return; }
    this.perfilApi.listarRecursos(idNegocio).subscribe({
      next: r => this.tiposRecurso.set(r?.success && r.data ? r.data : []),
      error: () => this.tiposRecurso.set([]),
    });
  }

  /** Carga los servicios típicos del oficio. Solo sobre un catálogo vacío (el backend lo exige). */
  sembrarCatalogo() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio || this.sembrando()) return;
    this.sembrando.set(true);
    this.perfilApi.sembrarServicios(idNegocio).subscribe({
      next: r => {
        this.sembrando.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudieron cargar.'); return; }
        this.toast.success(`Listo: ${r.data?.servicios ?? 0} servicios de ejemplo. Ajusta precios y tiempos a los tuyos.`);
        this.catalogo.set(null);
        this.recargar();
      },
      error: e => {
        this.sembrando.set(false);
        this.toast.error(e?.error?.message || 'No se pudieron cargar los servicios de ejemplo.');
      },
    });
  }

  // ── Variantes ──
  agregarVariante() {
    const base = this.form.getRawValue();
    this.variantes.update(v => [...v, {
      nombre: '', clave: null, duracion_min: Number(base.duracion_min) || 30, precio: Number(base.precio) || 0,
    }]);
  }

  quitarVariante(i: number) {
    this.variantes.update(v => v.filter((_, j) => j !== i));
  }

  cambiarVariante(i: number, campo: keyof VarianteServicio, valor: string) {
    this.variantes.update(v => v.map((x, j) => {
      if (j !== i) return x;
      if (campo === 'duracion_min' || campo === 'precio') return { ...x, [campo]: Number(valor) };
      if (campo === 'clave') return { ...x, clave: valor || null };
      return { ...x, [campo]: valor };
    }));
  }

  /** Tamaños para emparejar la variante con la mascota (perfil mascotas). */
  readonly tamanos = [
    { clave: 'PEQUENO', etiqueta: 'Pequeño' }, { clave: 'MEDIANO', etiqueta: 'Mediano' },
    { clave: 'GRANDE', etiqueta: 'Grande' }, { clave: 'GIGANTE', etiqueta: 'Gigante' },
  ];

  /** «desde $X» cuando el servicio tiene variantes: el precio de lista ya no dice todo. */
  precioDesde(s: Servicio): number | null {
    if (!this.conVariantes() || !s.variantes?.length) return null;
    return Math.min(...s.variantes.map(v => Number(v.precio)));
  }

  nombreRecurso(id: number | null | undefined): string {
    if (!id) return '';
    return this.tiposRecurso().find(t => t.id_tipo_recurso === id)?.nombre ?? '';
  }

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
      proceso_desde_min: 0, proceso_min: 0, a_cotizar: false,
      usa_rango: false, precio_min: null, precio_max: null,
      requiere_consentimiento: false, id_tipo_recurso: '',
    });
    this.variantes.set([]);
    this.cargarTiposRecurso(this.auth.negocio()?.id_negocio ?? 0);
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
      proceso_desde_min: s.proceso_desde_min ?? 0,
      proceso_min: s.proceso_min ?? 0,
      a_cotizar: !!s.a_cotizar,
      // «Usa rango» no es una columna: es que alguna de las dos tenga valor.
      usa_rango: s.precio_min != null || s.precio_max != null,
      precio_min: s.precio_min != null ? Number(s.precio_min) : null,
      precio_max: s.precio_max != null ? Number(s.precio_max) : null,
      requiere_consentimiento: !!s.requiere_consentimiento,
      id_tipo_recurso: s.id_tipo_recurso != null ? String(s.id_tipo_recurso) : '',
    });
    this.variantes.set((s.variantes ?? []).map(v => ({ ...v, precio: Number(v.precio) })));
    this.cargarTiposRecurso(this.auth.negocio()?.id_negocio ?? 0);
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

    // Con rango el precio fijo sobra: si se deja vacío se guarda el «desde» (o el «hasta») como
    // referencia, que es lo que se propone al facturar. La columna no admite NULL.
    const precioMin = v.usa_rango ? numeroOpcional(v.precio_min) : null;
    const precioMax = v.usa_rango ? numeroOpcional(v.precio_max) : null;
    let precio = numeroOpcional(v.precio);
    if (v.usa_rango) {
      if (precioMin == null && precioMax == null) {
        this.toast.error('Escribe al menos uno de los dos precios del rango, o apaga el rango.');
        return;
      }
      if (precioMin != null && precioMax != null && precioMin > precioMax) {
        this.toast.error('El precio "desde" no puede ser mayor que "hasta".');
        return;
      }
      precio ??= precioMin ?? precioMax;
    } else if (precio == null) {
      this.toast.error('Escribe el precio del servicio.');
      return;
    }

    const payload: Partial<Servicio> & { id_negocio: number } = {
      id_negocio: idNegocio,
      nombre: v.nombre.trim(),
      duracion_min: Number(v.duracion_min),
      precio: precio ?? 0,
      descripcion: v.descripcion?.trim() || null,
      imagen_url: v.imagen_url?.trim() || null,
      // El `<select>` devuelve texto; `''` es «sin categoría» y viaja como null.
      id_categoria: v.id_categoria ? Number(v.id_categoria) : null,
    };
    // Solo se mandan los campos de las funciones encendidas: con una apagada, lo que el servicio
    // ya tuviera se conserva tal cual en vez de pisarse con el valor vacío del formulario.
    if (this.conProceso()) {
      payload.proceso_desde_min = Number(v.proceso_desde_min) || 0;
      payload.proceso_min = Number(v.proceso_min) || 0;
      if (payload.proceso_min > 0 && payload.proceso_desde_min + payload.proceso_min >= payload.duracion_min!) {
        this.toast.error('La espera tiene que terminar antes de que acabe el servicio.');
        return;
      }
    }
    if (this.conCotizar()) payload.a_cotizar = v.a_cotizar;

    // El rango va aparte de «a cotizar» y no depende de ninguna función del rubro: es una forma
    // de presentar el precio que cualquier negocio puede querer. Apagado, se limpian las dos
    // columnas para que la página deje de enseñarlo.
    payload.precio_min = precioMin;
    payload.precio_max = precioMax;
    if (this.conConsentimiento()) payload.requiere_consentimiento = v.requiere_consentimiento;
    if (this.conRecursos()) payload.id_tipo_recurso = v.id_tipo_recurso ? Number(v.id_tipo_recurso) : null;
    if (this.conVariantes()) {
      const variantes = this.variantes();
      if (variantes.some(x => !x.nombre.trim())) { this.toast.error('Ponle nombre a cada variante.'); return; }
      payload.variantes = variantes.map(x => ({ ...x, nombre: x.nombre.trim() }));
    }

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
        // Las fotos que se eligieron antes de que el servicio existiera: ahora ya hay id con el
        // que nombrarlas. Igual que la portada, un fallo aquí no invalida el guardado.
        if (idServicio) {
          const fallidas = await this.galeria()?.subirPendientes(idServicio, idNegocio) ?? 0;
          if (fallidas > 0) {
            this.toast.warning(`El servicio se guardó, pero ${fallidas} foto(s) no se pudieron subir.`);
          }
        }
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

/** Valor de un `<input type="number">`: vacío (null, '' o NaN) es «sin valor», no 0. */
function numeroOpcional(x: unknown): number | null {
  if (x == null || (typeof x === 'string' && !x.trim())) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
