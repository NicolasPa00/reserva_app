import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { Profesional, Servicio } from '../../core/models';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'reserva-profesionales',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, LucideAngularModule,
    ModalComponent, ConfirmDialogComponent,
  ],
  templateUrl: './profesionales.html',
  styleUrl: './profesionales.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfesionalesComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);
  private readonly fb    = inject(FormBuilder);

  readonly profesionales = signal<Profesional[]>([]);
  readonly servicios = signal<Servicio[]>([]);
  readonly cargando = signal(false);
  readonly busqueda = signal('');
  readonly incluirInactivos = signal(false);

  readonly modalAbierto = signal(false);
  readonly editando = signal<Profesional | null>(null);
  readonly guardando = signal(false);

  readonly modalServiciosAbierto = signal(false);
  readonly profesionalServicios = signal<Profesional | null>(null);
  readonly serviciosSeleccionados = signal<Set<number>>(new Set());

  readonly confirmAbierto = signal(false);
  readonly profesionalAInactivar = signal<Profesional | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre:       ['', [Validators.required, Validators.maxLength(150)]],
    especialidad: [''],
    telefono:     [''],
    email:        ['', [Validators.email]],
    foto_url:     [''],
    color_hex:    ['#10b981'],
  });

  readonly profesionalesFiltrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return this.profesionales();
    return this.profesionales().filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.especialidad ?? '').toLowerCase().includes(q),
    );
  });

  readonly puedeCrear   = computed(() => this.permisoVista()?.puede_crear ?? true);
  readonly puedeEditar  = computed(() => this.permisoVista()?.puede_editar ?? true);
  readonly puedeEliminar = computed(() => this.permisoVista()?.puede_eliminar ?? true);

  private permisoVista() {
    return this.auth.permisosVistaActivos().find(p => p.url === '/profesionales') ?? null;
  }

  ngOnInit() { this.recargar(); }

  recargar() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.cargando.set(true);
    forkJoin({
      pros: this.api.listarProfesionales(idNegocio, { incluirInactivos: this.incluirInactivos() }),
      svs:  this.api.listarServicios(idNegocio),
    }).subscribe({
      next: ({ pros, svs }) => {
        if (pros?.success && pros.data) this.profesionales.set(pros.data);
        if (svs?.success && svs.data)   this.servicios.set(svs.data);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudieron cargar los profesionales.'); this.cargando.set(false); },
    });
  }

  toggleInactivos() {
    this.incluirInactivos.update(v => !v);
    this.recargar();
  }

  abrirCrear() {
    this.editando.set(null);
    this.form.reset({
      nombre: '', especialidad: '', telefono: '', email: '', foto_url: '', color_hex: '#10b981',
    });
    this.modalAbierto.set(true);
  }

  abrirEditar(p: Profesional) {
    this.editando.set(p);
    this.form.reset({
      nombre: p.nombre,
      especialidad: p.especialidad ?? '',
      telefono: p.telefono ?? '',
      email: p.email ?? '',
      foto_url: p.foto_url ?? '',
      color_hex: p.color_hex ?? '#10b981',
    });
    this.modalAbierto.set(true);
  }

  cerrarModal() { this.modalAbierto.set(false); this.editando.set(null); }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;

    const v = this.form.getRawValue();
    const payload: Partial<Profesional> & { id_negocio: number } = {
      id_negocio: idNegocio,
      nombre: v.nombre.trim(),
      especialidad: v.especialidad?.trim() || null,
      telefono: v.telefono?.trim() || null,
      email: v.email?.trim() || null,
      foto_url: v.foto_url?.trim() || null,
      color_hex: v.color_hex?.startsWith('#') ? v.color_hex : `#${v.color_hex}`,
    };

    this.guardando.set(true);
    const editando = this.editando();
    const obs$ = editando
      ? this.api.actualizarProfesional(editando.id_profesional, payload)
      : this.api.crearProfesional(payload);

    obs$.subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success(editando ? 'Profesional actualizado' : 'Profesional creado');
          this.cerrarModal();
          this.recargar();
        } else this.toast.error(r?.message || 'No se pudo guardar.');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar.');
      },
    });
  }

  // ── Asignación de servicios ──
  abrirServicios(p: Profesional) {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.profesionalServicios.set(p);
    this.api.getProfesional(p.id_profesional, idNegocio).subscribe({
      next: r => {
        const ids = (r?.data?.servicios ?? []).map(s => s.id_servicio);
        this.serviciosSeleccionados.set(new Set(ids));
      },
      error: () => this.serviciosSeleccionados.set(new Set()),
    });
    this.modalServiciosAbierto.set(true);
  }

  toggleServicio(idServicio: number) {
    this.serviciosSeleccionados.update(s => {
      const next = new Set(s);
      if (next.has(idServicio)) next.delete(idServicio); else next.add(idServicio);
      return next;
    });
  }

  cerrarServicios() {
    this.modalServiciosAbierto.set(false);
    this.profesionalServicios.set(null);
    this.serviciosSeleccionados.set(new Set());
  }

  guardarServicios() {
    const p = this.profesionalServicios();
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!p || !idNegocio) return;
    const ids = Array.from(this.serviciosSeleccionados());
    this.guardando.set(true);
    this.api.setServiciosProfesional(p.id_profesional, idNegocio, ids).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success('Servicios actualizados');
          this.cerrarServicios();
        } else this.toast.error(r?.message || 'No se pudo guardar.');
      },
      error: () => { this.guardando.set(false); this.toast.error('Error al asignar servicios.'); },
    });
  }

  // ── Inactivar ──
  pedirInactivar(p: Profesional) {
    this.profesionalAInactivar.set(p);
    this.confirmAbierto.set(true);
  }

  inactivarConfirmado() {
    const p = this.profesionalAInactivar();
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!p || !idNegocio) return;
    this.api.inactivarProfesional(p.id_profesional, idNegocio).subscribe({
      next: r => {
        if (r?.success) { this.toast.success('Profesional inactivado'); this.recargar(); }
        else this.toast.error(r?.message || 'No se pudo inactivar.');
        this.cerrarConfirm();
      },
      error: () => { this.toast.error('Error al inactivar.'); this.cerrarConfirm(); },
    });
  }

  cerrarConfirm() { this.confirmAbierto.set(false); this.profesionalAInactivar.set(null); }
}
