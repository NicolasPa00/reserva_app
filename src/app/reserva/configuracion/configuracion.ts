import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ColoresNegocio, MarcaNegocio, MetodoPago } from '../../core/models';
import { ThemeService } from '../../core/theme/theme.service';
import { ImageCropperComponent } from '../../shared/image-cropper/image-cropper';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';

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
    ModalComponent, ConfirmDialogComponent, ImageCropperComponent,
  ],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly fb    = inject(FormBuilder);
  private readonly theme = inject(ThemeService);

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
    { id: 'reservas'  as const, label: 'Reservas',      icono: 'calendar-clock' },
    { id: 'cobros'    as const, label: 'Cobros y pagos', icono: 'wallet' },
  ];
  readonly tab = signal<'identidad' | 'reservas' | 'cobros'>('identidad');

  // ── Identidad visual ──
  readonly marca = signal<MarcaNegocio | null>(null);
  readonly subiendoLogo = signal(false);
  readonly cropperAbierto = signal(false);
  readonly archivoLogo = signal<File | null>(null);
  readonly confirmQuitarLogo = signal(false);

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

  readonly form = this.fb.nonNullable.group({
    anticipacion_min_horas:    [1,  [Validators.required, Validators.min(0), Validators.max(168)]],
    buffer_limpieza_min:       [10, [Validators.required, Validators.min(0), Validators.max(240)]],
    ventana_cancelacion_horas: [4,  [Validators.required, Validators.min(0), Validators.max(168)]],
    paso_slot_min:             [15, [Validators.required, Validators.min(5),  Validators.max(60)]],
    cobro_adelantado:          [false],
    instrucciones_pago:        [''],
    permite_cobro_profesional: [false],
    permite_multipago:         [false],
    exige_caja_abierta:        [false],
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
    }).subscribe({
      next: ({ cfg, metodos, marca }) => {
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
            exige_caja_abierta:        cfg.data.exige_caja_abierta ?? false,
          });
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
      exige_caja_abierta:        v.exige_caja_abierta,
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) this.toast.success('Configuración guardada');
        else this.toast.error(r?.message || 'No se pudo guardar.');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar.');
      },
    });
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
