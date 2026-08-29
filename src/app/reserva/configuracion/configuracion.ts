import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { MetodoPago } from '../../core/models';
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
    ModalComponent, ConfirmDialogComponent,
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

  readonly cargando = signal(false);
  readonly guardando = signal(false);

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
    }).subscribe({
      next: ({ cfg, metodos }) => {
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
