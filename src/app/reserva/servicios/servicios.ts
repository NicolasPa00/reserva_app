import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { Servicio } from '../../core/models';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'reserva-servicios',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, LucideAngularModule, CurrencyPipe,
    ModalComponent, ConfirmDialogComponent,
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
    this.editando.set(null);
    this.form.reset({
      nombre: '', duracion_min: 30, precio: 0, descripcion: '',
      color_hex: '#3b82f6', imagen_url: '',
    });
    this.modalAbierto.set(true);
  }

  abrirEditar(s: Servicio) {
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
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success(editando ? 'Servicio actualizado' : 'Servicio creado');
          this.cerrarModal();
          this.recargar();
        } else {
          this.toast.error(r?.message || 'No se pudo guardar.');
        }
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
