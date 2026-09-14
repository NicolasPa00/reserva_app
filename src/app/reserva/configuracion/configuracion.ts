import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ColoresNegocio, MarcaNegocio, MetodoPago, Moneda, PaisDisponible } from '../../core/models';
import { ThemeService } from '../../core/theme/theme.service';
import { MonedaService } from '../../core/services/moneda.service';
import { ImageCropperComponent } from '../../shared/image-cropper/image-cropper';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { IconoTiktokComponent } from '../../shared/iconos-marca/iconos-marca';

/**
 * Configuración del vertical.
 *
 * Las formas de pago viven aquí y no en una pantalla propia porque son un ajuste del negocio,
 * no una entidad que se trabaje a diario: se definen una vez y se tocan poco. Estar junto a los
 * interruptores de cobro también hace evidente la dependencia — activar el cobro por profesional
 * no sirve de nada si no hay con qué cobrar.
 */
@Component({
  selector: 'reserva-configuracion',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, LucideAngularModule,
    ModalComponent, ConfirmDialogComponent, ImageCropperComponent, IconoTiktokComponent,
  ],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly location = inject(Location);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly fb    = inject(FormBuilder);
  private readonly theme = inject(ThemeService);
  private readonly monedas = inject(MonedaService);

  readonly cargando = signal(false);
  readonly guardando = signal(false);

  /**
   * Pestañas.
   *
   * Se agrupan por la pregunta que responde cada una, no por la tabla de la que salen los
   * datos: «cómo se ve mi negocio», «cuándo se puede reservar» y «cómo se cobra». Las formas de
   * pago van con los cobros a propósito —y no en una pestaña propia— porque el interruptor de
   * multipago depende de cuántas haya activas, y separarlos escondería esa dependencia.
   */
  readonly tabs = [
    { id: 'identidad' as const, label: 'Identidad',     icono: 'image' },
    { id: 'publica'   as const, label: 'Página pública', icono: 'globe' },
    { id: 'reservas'  as const, label: 'Reservas',      icono: 'calendar-clock' },
    { id: 'cobros'    as const, label: 'Cobros y pagos', icono: 'wallet' },
  ];
  readonly tab = signal<'identidad' | 'publica' | 'reservas' | 'cobros'>('identidad');

  // ── Identidad visual ──
  readonly marca = signal<MarcaNegocio | null>(null);
  readonly subiendoLogo = signal(false);
  readonly cropperAbierto = signal(false);
  readonly archivoLogo = signal<File | null>(null);
  readonly confirmQuitarLogo = signal(false);

  readonly subiendoBanner = signal(false);
  readonly cropperBannerAbierto = signal(false);
  readonly archivoBanner = signal<File | null>(null);
  readonly confirmQuitarBanner = signal(false);

  /** Colores en edición. Se previsualizan en vivo antes de guardar. */
  readonly primario = signal('#312E81');
  readonly acento = signal('#6366F1');
  readonly coloresSucios = signal(false);

  // ── Formas de pago ──
  readonly metodos = signal<MetodoPago[]>([]);
  readonly modalMetodo = signal(false);
  readonly metodoEditando = signal<MetodoPago | null>(null);
  readonly nombreMetodo = signal('');
  readonly confirmInactivar = signal(false);
  readonly metodoAInactivar = signal<MetodoPago | null>(null);

  readonly metodosActivos = computed(() => this.metodos().filter(m => m.estado === 'A'));
  readonly metodosInactivos = computed(() => this.metodos().filter(m => m.estado === 'I'));

  /** Con menos de dos formas activas, el multipago no tiene entre qué repartir. */
  readonly puedeMultipago = computed(() => this.metodosActivos().length >= 2);

  // ── País y moneda ──
  //
  // El país es del negocio (`gener_negocio.pais`), no del vertical, y decide dos cosas: con qué
  // moneda se pintan los precios y cómo se normalizan los teléfonos de los clientes. Se edita
  // aquí porque es donde el dueño lo busca, pero se guarda donde siempre estuvo.
  readonly paises = signal<PaisDisponible[]>([]);
  readonly paisElegido = signal('CO');

  /** La moneda que se va a usar con el país elegido, para poder enseñar un ejemplo. */
  readonly monedaElegida = computed<Moneda | null>(
    () => this.paises().find(p => p.codigo === this.paisElegido())?.moneda ?? null,
  );

  /**
   * «$ 25.000» / «S/ 25.00»: el mismo número en la moneda elegida, antes de guardar.
   *
   * Se formatea con el mismo servicio que pinta los precios de verdad, y no con un `Intl` aparte:
   * un ejemplo que no coincidiera con lo que se ve después sería peor que no enseñar ninguno.
   */
  readonly ejemploPrecio = computed(() => {
    const m = this.monedaElegida();
    return m ? this.monedas.formatear(25000, m) : '';
  });

  // ── Página pública ──
  //
  // Contacto y redes viven en `gener_negocio` y la presentación en `reserva_config`, pero para
  // quien rellena el formulario son una sola cosa: «lo que verá mi cliente». Se editan juntos y
  // el backend los reparte.
  readonly guardandoVitrina = signal(false);
  readonly urlPublicaCopiada = signal(false);
  readonly puedeEditarVitrina = computed(() => this.auth.puedeAccion('configuracion_vitrina'));

  readonly vitrinaForm = this.fb.nonNullable.group({
    telefono:            [''],
    direccion:           [''],
    url_whatsapp:        [''],
    url_facebook:        [''],
    url_instagram:       [''],
    url_tiktok:          [''],
    descripcion_publica: ['', [Validators.maxLength(1200)]],
    publico_activo:      [true],
  });

  /**
   * Enlace que el negocio comparte con sus clientes.
   *
   * Se arma con `Location.prepareExternalUrl`, que antepone el baseHref del build
   * (`/reserva/`). Antes se concatenaba `origin + /p/:id` a mano, y el enlace
   * resultante caía en una ruta que el servidor no sirve: el cliente veía una
   * página en blanco. El baseHref no se escribe a mano para que un cambio de
   * despliegue no vuelva a romperlo.
   */
  readonly urlPublica = computed(() => {
    const id = this.auth.negocio()?.id_negocio;
    if (!id) return '';
    // `location` no existe en SSR; se compone sin él y se completa en el navegador.
    const origen = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origen}${this.location.prepareExternalUrl(`/p/${id}`)}`;
  });

  readonly form = this.fb.nonNullable.group({
    anticipacion_min_horas:    [1,  [Validators.required, Validators.min(0), Validators.max(168)]],
    buffer_limpieza_min:       [10, [Validators.required, Validators.min(0), Validators.max(240)]],
    ventana_cancelacion_horas: [4,  [Validators.required, Validators.min(0), Validators.max(168)]],
    paso_slot_min:             [15, [Validators.required, Validators.min(5),  Validators.max(60)]],
    cobro_adelantado:          [false],
    instrucciones_pago:        [''],
    permite_cobro_profesional: [false],
    permite_multipago:         [false],
  });

  constructor() {
    // El multipago necesita al menos dos formas activas entre las que repartir. Se refleja
    // deshabilitando el control —no con `[disabled]` en la plantilla, que en formularios
    // reactivos avisa Angular y puede dar 'changed after checked'—, y se desmarca al caer por
    // debajo del mínimo para no guardar una opción inservible.
    effect(() => {
      const ctrl = this.form.controls.permite_multipago;
      if (this.puedeMultipago()) {
        if (ctrl.disabled) ctrl.enable({ emitEvent: false });
      } else {
        if (ctrl.value) ctrl.setValue(false, { emitEvent: false });
        if (ctrl.enabled) ctrl.disable({ emitEvent: false });
      }
    });
  }

  ngOnInit() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.cargando.set(true);

    forkJoin({
      cfg: this.api.getConfig(idNegocio),
      metodos: this.api.listarMetodosPago(idNegocio, { incluirInactivos: true }),
      marca: this.api.getMarca(idNegocio),
      vitrina: this.api.getVitrinaEdicion(idNegocio),
    }).subscribe({
      next: ({ cfg, metodos, marca, vitrina }) => {
        if (vitrina?.success && vitrina.data) {
          const v = vitrina.data;
          this.vitrinaForm.patchValue({
            telefono:            v.telefono ?? '',
            direccion:           v.direccion ?? '',
            url_whatsapp:        v.url_whatsapp ?? '',
            url_facebook:        v.url_facebook ?? '',
            url_instagram:       v.url_instagram ?? '',
            url_tiktok:          v.url_tiktok ?? '',
            descripcion_publica: v.descripcion_publica ?? '',
            publico_activo:      v.publico_activo,
          });
          this.vitrinaForm.markAsPristine();
        }
        if (marca?.success && marca.data) {
          this.marca.set(marca.data);
          this.primario.set(marca.data.colores?.primario ?? '#312E81');
          this.acento.set(marca.data.colores?.acento ?? '#6366F1');
          this.coloresSucios.set(false);
        }
        if (cfg?.success && cfg.data) {
          this.form.patchValue({
            anticipacion_min_horas:    cfg.data.anticipacion_min_horas,
            buffer_limpieza_min:       cfg.data.buffer_limpieza_min,
            ventana_cancelacion_horas: cfg.data.ventana_cancelacion_horas,
            paso_slot_min:             cfg.data.paso_slot_min,
            cobro_adelantado:          cfg.data.cobro_adelantado,
            instrucciones_pago:        cfg.data.instrucciones_pago ?? '',
            permite_cobro_profesional: cfg.data.permite_cobro_profesional ?? false,
            permite_multipago:         cfg.data.permite_multipago ?? false,
          });
          this.paises.set(cfg.data.paises ?? []);
          this.paisElegido.set(cfg.data.pais ?? 'CO');
        }
        if (metodos?.success && metodos.data) this.metodos.set(metodos.data);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudo cargar la configuración.'); this.cargando.set(false); },
    });
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;

    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.api.actualizarConfig({
      id_negocio: idNegocio,
      anticipacion_min_horas:    Number(v.anticipacion_min_horas),
      buffer_limpieza_min:       Number(v.buffer_limpieza_min),
      ventana_cancelacion_horas: Number(v.ventana_cancelacion_horas),
      paso_slot_min:             Number(v.paso_slot_min),
      cobro_adelantado:          v.cobro_adelantado,
      instrucciones_pago:        v.cobro_adelantado ? (v.instrucciones_pago?.trim() || null) : null,
      permite_cobro_profesional: v.permite_cobro_profesional,
      // Guardar multipago activo sin formas suficientes dejaría una opción que no se puede
      // usar; se corrige en el envío en vez de dejar que el usuario lo descubra al cobrar.
      permite_multipago:         v.permite_multipago && this.puedeMultipago(),
      pais:                      this.paisElegido(),
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.toast.success('Configuración guardada');
        // La moneda vive en la sesión —de ahí la leen todas las pantallas—, así que se parchea
        // con lo que devolvió el servidor. Sin esto, los precios seguirían en la moneda anterior
        // hasta volver a entrar, que es justo cuando el usuario dudaría de si guardó algo.
        if (r.data?.moneda) {
          this.auth.actualizarNegocioActivo({ pais: r.data.pais ?? null, moneda: r.data.moneda });
        }
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar.');
      },
    });
  }

  // ── Página pública ──

  guardarVitrina() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio || this.vitrinaForm.invalid) { this.vitrinaForm.markAllAsTouched(); return; }

    const v = this.vitrinaForm.getRawValue();
    this.guardandoVitrina.set(true);
    this.api.guardarVitrina({
      id_negocio: idNegocio,
      telefono:            v.telefono.trim(),
      direccion:           v.direccion.trim(),
      url_whatsapp:        v.url_whatsapp.trim(),
      url_facebook:        v.url_facebook.trim(),
      url_instagram:       v.url_instagram.trim(),
      url_tiktok:          v.url_tiktok.trim(),
      descripcion_publica: v.descripcion_publica.trim(),
      publico_activo:      v.publico_activo,
    }).subscribe({
      next: r => {
        this.guardandoVitrina.set(false);
        if (!r?.success || !r.data) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        // El backend normaliza («@usuario» acaba siendo una URL completa); se refresca el
        // formulario con lo guardado para que se vea exactamente lo que quedó.
        const d = r.data;
        this.vitrinaForm.patchValue({
          telefono:      d.telefono ?? '',
          direccion:     d.direccion ?? '',
          url_whatsapp:  d.url_whatsapp ?? '',
          url_facebook:  d.url_facebook ?? '',
          url_instagram: d.url_instagram ?? '',
          url_tiktok:    d.url_tiktok ?? '',
        });
        this.vitrinaForm.markAsPristine();
        this.toast.success('Página pública actualizada');
      },
      error: e => {
        this.guardandoVitrina.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar la página pública.');
      },
    });
  }

  async copiarUrlPublica() {
    const url = this.urlPublica();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.urlPublicaCopiada.set(true);
      setTimeout(() => this.urlPublicaCopiada.set(false), 2000);
    } catch {
      // Sin permiso de portapapeles (http sin TLS, por ejemplo) queda el enlace visible para
      // copiarlo a mano; avisar de un fallo técnico no le sirve de nada al usuario.
      this.toast.info('Copia el enlace manualmente.');
    }
  }

  // ── Identidad visual ──

  /** Vista previa en vivo: se ve el color aplicado a toda la app antes de guardarlo. */
  setColor(cual: 'primario' | 'acento', valor: string) {
    (cual === 'primario' ? this.primario : this.acento).set(valor);
    this.coloresSucios.set(true);
    this.theme.aplicar({ primario: this.primario(), acento: this.acento() });
  }

  guardarColores() {
    const id = this.auth.negocio()?.id_negocio;
    if (!id) return;
    this.guardando.set(true);
    this.api.guardarColores(id, this.primario(), this.acento()).subscribe({
      next: r => {
        this.guardando.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudieron guardar.'); return; }
        this.toast.success('Colores guardados');
        this.coloresSucios.set(false);
        this.actualizarSesion(r.data!.colores, null);
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar los colores.');
      },
    });
  }

  aplicarPaleta(idPaleta: number) {
    const id = this.auth.negocio()?.id_negocio;
    if (!id) return;
    this.guardando.set(true);
    this.api.aplicarPaletaNegocio(id, idPaleta).subscribe({
      next: r => {
        this.guardando.set(false);
        if (!r?.success || !r.data) { this.toast.error(r?.message || 'No se pudo aplicar.'); return; }
        this.primario.set(r.data.colores.primario);
        this.acento.set(r.data.colores.acento);
        this.coloresSucios.set(false);
        this.theme.aplicar(r.data.colores);
        this.actualizarSesion(r.data.colores, r.data.id_paleta);
        this.toast.success(`Paleta «${r.data.nombre}» aplicada`);
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al aplicar la paleta.');
      },
    });
  }

  restablecerColores() {
    const id = this.auth.negocio()?.id_negocio;
    if (!id) return;
    this.guardando.set(true);
    this.api.restablecerColores(id).subscribe({
      next: () => {
        this.guardando.set(false);
        this.primario.set('#312E81');
        this.acento.set('#6366F1');
        this.coloresSucios.set(false);
        this.theme.aplicar(null);
        this.actualizarSesion(null, null);
        this.toast.success('Colores restablecidos');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al restablecer.');
      },
    });
  }

  // ── Logo ──

  elegirLogo(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (input) input.value = '';   // permite volver a elegir el mismo archivo
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toast.error('Selecciona una imagen (JPG, PNG o WEBP).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.toast.error('La imagen es demasiado grande (máximo 25 MB).');
      return;
    }
    this.archivoLogo.set(file);
    this.cropperAbierto.set(true);
  }

  cerrarCropper() {
    this.cropperAbierto.set(false);
    this.archivoLogo.set(null);
  }

  /** El recorte llega ya cuadrado, a 512 px y en WebP: se sube tal cual. */
  onLogoRecortado(blob: Blob) {
    const id = this.auth.negocio()?.id_negocio;
    this.cerrarCropper();
    if (!id) return;

    this.subiendoLogo.set(true);
    this.api.subirLogo(id, blob).subscribe({
      next: r => {
        this.subiendoLogo.set(false);
        if (!r?.success || !r.data) { this.toast.error(r?.message || 'No se pudo subir.'); return; }
        this.marca.update(m => (m ? { ...m, logo_url: r.data!.logo_url } : m));
        this.actualizarLogoSesion(r.data.logo_url);
        this.toast.success(`Logo actualizado (${Math.round(r.data.bytes / 1024)} KB)`);
      },
      error: e => {
        this.subiendoLogo.set(false);
        this.toast.error(e?.error?.message || 'Error al subir el logo.');
      },
    });
  }

  // ── Banner ──
  //
  // Va aparte del logo porque cumple otra función: el logo identifica en la barra y en el
  // avatar; el banner ambienta la cabecera del portal. Se recorta 16:5, la proporción exacta
  // de esa cabecera, para que ninguna subida la deforme.

  elegirBanner(event: Event) {
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
    this.archivoBanner.set(file);
    this.cropperBannerAbierto.set(true);
  }

  cerrarCropperBanner() {
    this.cropperBannerAbierto.set(false);
    this.archivoBanner.set(null);
  }

  onBannerRecortado(blob: Blob) {
    const id = this.auth.negocio()?.id_negocio;
    this.cerrarCropperBanner();
    if (!id) return;

    this.subiendoBanner.set(true);
    this.api.subirBanner(id, blob).subscribe({
      next: r => {
        this.subiendoBanner.set(false);
        if (!r?.success || !r.data) { this.toast.error(r?.message || 'No se pudo subir.'); return; }
        this.marca.update(m => (m ? { ...m, banner_url: r.data!.banner_url } : m));
        this.toast.success(`Banner actualizado (${Math.round(r.data.bytes / 1024)} KB)`);
      },
      error: e => {
        this.subiendoBanner.set(false);
        this.toast.error(e?.error?.message || 'Error al subir el banner.');
      },
    });
  }

  quitarBanner() {
    const id = this.auth.negocio()?.id_negocio;
    if (!id) return;
    this.api.eliminarBanner(id).subscribe({
      next: () => {
        this.marca.update(m => (m ? { ...m, banner_url: null } : m));
        this.confirmQuitarBanner.set(false);
        this.toast.success('Banner eliminado');
      },
      error: e => {
        this.confirmQuitarBanner.set(false);
        this.toast.error(e?.error?.message || 'Error al eliminar el banner.');
      },
    });
  }

  quitarLogo() {
    const id = this.auth.negocio()?.id_negocio;
    if (!id) return;
    this.api.eliminarLogo(id).subscribe({
      next: () => {
        this.marca.update(m => (m ? { ...m, logo_url: null } : m));
        this.actualizarLogoSesion(null);
        this.confirmQuitarLogo.set(false);
        this.toast.success('Logo eliminado');
      },
      error: e => {
        this.confirmQuitarLogo.set(false);
        this.toast.error(e?.error?.message || 'Error al eliminar el logo.');
      },
    });
  }

  /** URL absoluta: el backend devuelve rutas relativas y la app vive en otro origen. */
  urlImagen(ruta: string | null | undefined): string {
    if (!ruta) return '';
    if (/^https?:\/\//i.test(ruta)) return ruta;
    return `${this.api.origenArchivos}${ruta}`;
  }

  esPaletaActiva(idPaleta: number): boolean {
    return this.marca()?.id_paleta === idPaleta;
  }

  colorDe(paleta: { colores: Record<string, string> }, cual: 'primario' | 'acento'): string {
    return paleta.colores?.[cual] ?? paleta.colores?.['primary'] ?? '#312E81';
  }

  /**
   * Refleja el cambio en la sesión guardada.
   *
   * Sin esto, el color nuevo se ve hasta que el usuario recarga: `authGuard` vuelve a aplicar el
   * tema desde la sesión de `localStorage`, que seguiría con el color anterior.
   */
  private actualizarSesion(colores: ColoresNegocio | null, idPaleta: number | null) {
    this.auth.actualizarNegocioActivo({ colores });
    this.marca.update(m => (m ? { ...m, colores, id_paleta: idPaleta } : m));
  }

  private actualizarLogoSesion(logoUrl: string | null) {
    this.auth.actualizarNegocioActivo({ logo_url: logoUrl });
  }

  // ── CRUD de formas de pago ──

  abrirNuevoMetodo() {
    this.metodoEditando.set(null);
    this.nombreMetodo.set('');
    this.modalMetodo.set(true);
  }

  abrirEditarMetodo(m: MetodoPago) {
    this.metodoEditando.set(m);
    this.nombreMetodo.set(m.nombre);
    this.modalMetodo.set(true);
  }

  guardarMetodo() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    const nombre = this.nombreMetodo().trim();
    if (!idNegocio || !nombre) return;

    this.guardando.set(true);
    const editando = this.metodoEditando();
    const peticion = editando
      ? this.api.actualizarMetodoPago(editando.id_metodo_pago, idNegocio, { nombre })
      : this.api.crearMetodoPago(idNegocio, nombre, this.metodos().length);

    peticion.subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success(editando ? 'Forma de pago actualizada' : 'Forma de pago creada');
          this.modalMetodo.set(false);
          this.recargarMetodos();
        } else this.toast.error(r?.message || 'No se pudo guardar.');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar la forma de pago.');
      },
    });
  }

  pedirInactivar(m: MetodoPago) {
    this.metodoAInactivar.set(m);
    this.confirmInactivar.set(true);
  }

  inactivarConfirmado() {
    const m = this.metodoAInactivar();
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!m || !idNegocio) return;
    this.api.cambiarEstadoMetodoPago(m.id_metodo_pago, idNegocio, 'I').subscribe({
      next: r => {
        if (r?.success) { this.toast.success('Forma de pago desactivada'); this.recargarMetodos(); }
        else this.toast.error(r?.message || 'No se pudo desactivar.');
        this.cerrarConfirm();
      },
      error: e => { this.toast.error(e?.error?.message || 'Error al desactivar.'); this.cerrarConfirm(); },
    });
  }

  reactivar(m: MetodoPago) {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.api.cambiarEstadoMetodoPago(m.id_metodo_pago, idNegocio, 'A').subscribe({
      next: r => {
        if (r?.success) { this.toast.success('Forma de pago reactivada'); this.recargarMetodos(); }
        else this.toast.error(r?.message || 'No se pudo reactivar.');
      },
      error: e => this.toast.error(e?.error?.message || 'Error al reactivar.'),
    });
  }

  cerrarConfirm() { this.confirmInactivar.set(false); this.metodoAInactivar.set(null); }

  private recargarMetodos() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.api.listarMetodosPago(idNegocio, { incluirInactivos: true }).subscribe({
      next: r => { if (r?.success && r.data) this.metodos.set(r.data); },
    });
  }
}
