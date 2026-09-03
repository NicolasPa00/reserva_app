import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom, forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { Profesional, Servicio } from '../../core/models';
import { MayusculasDirective } from '../../shared/mayusculas.directive';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { ImageCropperComponent } from '../../shared/image-cropper/image-cropper';
import { colorDeEntidad } from '../../core/utils/color-entidad';

@Component({
  selector: 'reserva-profesionales',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, LucideAngularModule,
    MayusculasDirective, ModalComponent, ConfirmDialogComponent, ImageCropperComponent,
  ],
  templateUrl: './profesionales.html',
  styleUrl: './profesionales.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfesionalesComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly router = inject(Router);
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

  // ── Foto ──
  //
  // Cuadrada (aspect 1) porque se muestra en círculo en la ficha pública y en la lista: un
  // recorte 4:3 metido en un círculo corta la cabeza o deja aire a los lados.
  readonly cropperAbierto = signal(false);
  readonly archivoFoto = signal<File | null>(null);
  readonly fotoBlob = signal<Blob | null>(null);
  readonly fotoPreview = signal('');
  readonly fotoBorrada = signal(false);

  readonly form = this.fb.nonNullable.group({
    nombre:       ['', [Validators.required, Validators.maxLength(150)]],
    especialidad: [''],
    telefono:     [''],
    email:        ['', [Validators.email]],
  });

  readonly profesionalesFiltrados = computed(() => {
    const base = this.incluirInactivos()
      ? this.profesionales()
      : this.profesionales().filter(p => p.estado === 'A');

    const q = this.busqueda().trim().toLowerCase();
    if (!q) return base;
    return base.filter(p =>
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
      pros: this.api.listarProfesionales(idNegocio, { incluirInactivos: true }),
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

  /** Filtro local: no hay petición detrás, así que alternarlo es instantáneo. */
  toggleInactivos() {
    this.incluirInactivos.update(v => !v);
  }

  /** Sin ninguno inactivo el check no se pinta: un control que no cambia nada estorba. */
  readonly hayInactivos = computed(() => this.profesionales().some(p => p.estado === 'I'));

  /**
   * Cuántos servicios realiza, en texto.
   *
   * Sin asignaciones ofrece el catálogo entero: es la convención del backend y la que espera el
   * portal. Decir «0 servicios» sería justo lo contrario de lo que ocurre.
   */
  conteoServicios(p: Profesional): string {
    const n = p.servicios?.length ?? 0;
    if (n === 0) return 'Todos los servicios';
    return n === 1 ? '1 servicio' : n + ' servicios';
  }

  /**
   * El alta vive en **Usuarios**, no aquí.
   *
   * Un profesional creado solo en esta pantalla queda sin acceso al sistema: existe en la
   * agenda, recibe citas y no puede entrar a verlas. Al crearlo desde Usuarios se hacen las dos
   * cosas a la vez —la cuenta y su ficha— y no quedan mitades. Esta pantalla sigue siendo la de
   * editar al equipo, asignarle servicios y darlo de baja.
   */
  irACrearUsuario() {
    this.router.navigate(['/usuarios']);
  }

  abrirEditar(p: Profesional) {
    this.editando.set(p);
    this.limpiarFotoPendiente();
    this.form.reset({
      nombre: p.nombre,
      especialidad: p.especialidad ?? '',
      telefono: p.telefono ?? '',
      email: p.email ?? '',
    });
    this.modalAbierto.set(true);
  }

  cerrarModal() {
    this.modalAbierto.set(false);
    this.editando.set(null);
    this.limpiarFotoPendiente();
  }

  // ── Foto del profesional ──
  //
  // El recorte espera en memoria y se sube DESPUÉS de guardar la ficha: el archivo se nombra
  // con el id (`profesional_00012.webp`) y en un alta ese id todavía no existe.

  elegirFoto(event: Event) {
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
    this.archivoFoto.set(file);
    this.cropperAbierto.set(true);
  }

  cerrarCropper() {
    this.cropperAbierto.set(false);
    this.archivoFoto.set(null);
  }

  onFotoRecortada(blob: Blob) {
    this.cerrarCropper();
    this.revocarPreview();
    this.fotoBlob.set(blob);
    this.fotoPreview.set(URL.createObjectURL(blob));
    this.fotoBorrada.set(false);
  }

  quitarFoto() {
    this.revocarPreview();
    this.fotoBlob.set(null);
    this.fotoPreview.set('');
    this.fotoBorrada.set(true);
  }

  private revocarPreview() {
    const url = this.fotoPreview();
    if (url) URL.revokeObjectURL(url);
  }

  private limpiarFotoPendiente() {
    this.revocarPreview();
    this.fotoBlob.set(null);
    this.fotoPreview.set('');
    this.fotoBorrada.set(false);
  }

  /** Lo que se ve en el modal: el recorte sin subir, o la foto que ya tiene. */
  fotoActual(): string {
    if (this.fotoPreview()) return this.fotoPreview();
    if (this.fotoBorrada()) return '';
    return this.urlImagen(this.editando()?.foto_url);
  }

  urlImagen(ruta: string | null | undefined): string {
    if (!ruta) return '';
    if (/^https?:\/\//i.test(ruta)) return ruta;
    return `${this.api.origenArchivos}${ruta}`;
  }

  /**
   * Sube o borra la foto una vez la ficha existe.
   *
   * Si falla, la ficha ya se guardó: se avisa de que la foto no se actualizó en vez de dar el
   * guardado por fallido, que llevaría a reintentar y duplicar el resto de cambios.
   */
  private async sincronizarFoto(idProfesional: number | undefined, idNegocio: number): Promise<void> {
    if (!idProfesional) return;
    const blob = this.fotoBlob();
    try {
      if (blob) {
        await firstValueFrom(this.api.subirFotoProfesional(idProfesional, idNegocio, blob));
      } else if (this.fotoBorrada()) {
        await firstValueFrom(this.api.eliminarFotoProfesional(idProfesional, idNegocio));
      }
    } catch {
      this.toast.warning('Se guardaron los datos, pero la foto no se pudo actualizar.');
    }
  }

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
    };

    this.guardando.set(true);
    const editando = this.editando();
    const obs$ = editando
      ? this.api.actualizarProfesional(editando.id_profesional, payload)
      : this.api.crearProfesional(payload);

    obs$.subscribe({
      next: async r => {
        if (r?.success) {
          await this.sincronizarFoto(r.data?.id_profesional ?? editando?.id_profesional, idNegocio);
          this.guardando.set(false);
          this.toast.success(editando ? 'Profesional actualizado' : 'Profesional creado');
          this.cerrarModal();
          this.recargar();
        } else {
          this.guardando.set(false);
          this.toast.error(r?.message || 'No se pudo guardar.');
        }
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

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
