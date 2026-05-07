import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { Bloqueo, Profesional } from '../../core/models';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';

interface BloqueDia {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

@Component({
  selector: 'reserva-horarios',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, ModalComponent, ConfirmDialogComponent, DatePipe],
  templateUrl: './horarios.html',
  styleUrl: './horarios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HorariosComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);

  readonly profesionales = signal<Profesional[]>([]);
  // null = horario por defecto del negocio; id = override por profesional
  readonly profesionalSeleccionado = signal<number | null>(null);
  readonly bloques = signal<BloqueDia[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);

  // Bloqueos
  readonly bloqueos = signal<Bloqueo[]>([]);
  readonly modalBloqueoAbierto = signal(false);
  readonly bloqueoForm = signal<{ id_profesional: number | null; fecha_inicio: string; fecha_fin: string; motivo: string }>(
    { id_profesional: null, fecha_inicio: '', fecha_fin: '', motivo: '' }
  );
  readonly confirmAbierto = signal(false);
  readonly bloqueoAEliminar = signal<Bloqueo | null>(null);

  readonly diasSemana = DIAS;

  readonly bloquesPorDia = computed(() => {
    const map = new Map<number, BloqueDia[]>();
    for (let d = 0; d < 7; d++) map.set(d, []);
    for (const b of this.bloques()) map.get(b.dia_semana)!.push(b);
    for (const arr of map.values()) arr.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    return map;
  });

  ngOnInit() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.cargando.set(true);
    forkJoin({
      pros: this.api.listarProfesionales(idNegocio),
      bls:  this.api.listarBloqueos(idNegocio),
    }).subscribe({
      next: ({ pros, bls }) => {
        if (pros?.success && pros.data) this.profesionales.set(pros.data);
        if (bls?.success && bls.data) this.bloqueos.set(bls.data);
        this.cargarHorario();
      },
      error: () => { this.toast.error('No se pudo cargar.'); this.cargando.set(false); },
    });
  }

  cargarHorario() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.cargando.set(true);
    this.api.listarHorarios(idNegocio, this.profesionalSeleccionado()).subscribe({
      next: r => {
        const data = (r?.data ?? []).map(h => ({
          dia_semana: h.dia_semana,
          hora_inicio: this.normalizarHora(h.hora_inicio),
          hora_fin:    this.normalizarHora(h.hora_fin),
        }));
        this.bloques.set(data);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudo cargar el horario.'); this.cargando.set(false); },
    });
  }

  cambiarTarget(idRaw: string) {
    const id = idRaw === '' ? null : Number(idRaw);
    this.profesionalSeleccionado.set(id);
    this.cargarHorario();
  }

  setBloqueoProfesional(idRaw: string) {
    const id = idRaw === '' ? null : Number(idRaw);
    this.setBloqueoCampo('id_profesional', id);
  }

  agregarBloque(dia: number) {
    this.bloques.update(arr => [...arr, { dia_semana: dia, hora_inicio: '09:00', hora_fin: '12:00' }]);
  }

  eliminarBloque(b: BloqueDia, idx: number) {
    this.bloques.update(arr => arr.filter((x, i) => !(x === b || (x.dia_semana === b.dia_semana && i === idx))));
  }

  actualizarHora(b: BloqueDia, campo: 'hora_inicio' | 'hora_fin', valor: string) {
    this.bloques.update(arr => arr.map(x => x === b ? { ...x, [campo]: valor } : x));
  }

  guardar() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;

    // Validación liviana cliente
    for (const b of this.bloques()) {
      if (b.hora_fin <= b.hora_inicio) {
        this.toast.error(`Horario inválido el ${this.diasSemana[b.dia_semana]}: fin debe ser mayor que inicio.`);
        return;
      }
    }

    this.guardando.set(true);
    this.api.reemplazarHorarios({
      id_negocio: idNegocio,
      id_profesional: this.profesionalSeleccionado(),
      bloques: this.bloques(),
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) this.toast.success('Horario guardado');
        else this.toast.error(r?.message || 'No se pudo guardar.');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar.');
      },
    });
  }

  // ── Bloqueos ──
  abrirNuevoBloqueo() {
    const hoy = new Date(); const en1h = new Date(Date.now() + 3600_000);
    this.bloqueoForm.set({
      id_profesional: this.profesionalSeleccionado(),
      fecha_inicio: hoy.toISOString().slice(0, 16),
      fecha_fin:    en1h.toISOString().slice(0, 16),
      motivo: '',
    });
    this.modalBloqueoAbierto.set(true);
  }

  setBloqueoCampo<K extends keyof ReturnType<typeof this.bloqueoForm>>(campo: K, valor: any) {
    this.bloqueoForm.update(f => ({ ...f, [campo]: valor }));
  }

  guardarBloqueo() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    const f = this.bloqueoForm();
    if (!f.fecha_inicio || !f.fecha_fin) { this.toast.error('Faltan fechas.'); return; }
    if (new Date(f.fecha_fin) <= new Date(f.fecha_inicio)) {
      this.toast.error('La fecha fin debe ser mayor a la inicio.'); return;
    }
    this.guardando.set(true);
    this.api.crearBloqueo({
      id_negocio: idNegocio,
      id_profesional: f.id_profesional,
      fecha_inicio: f.fecha_inicio,
      fecha_fin: f.fecha_fin,
      motivo: f.motivo?.trim() || null,
    } as any).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success('Bloqueo creado');
          this.modalBloqueoAbierto.set(false);
          this.recargarBloqueos();
        } else this.toast.error(r?.message || 'No se pudo crear el bloqueo.');
      },
      error: () => { this.guardando.set(false); this.toast.error('Error al crear el bloqueo.'); },
    });
  }

  recargarBloqueos() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;
    this.api.listarBloqueos(idNegocio).subscribe({
      next: r => { if (r?.success && r.data) this.bloqueos.set(r.data); },
    });
  }

  pedirEliminarBloqueo(b: Bloqueo) {
    this.bloqueoAEliminar.set(b);
    this.confirmAbierto.set(true);
  }

  eliminarBloqueoConfirmado() {
    const b = this.bloqueoAEliminar();
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!b || !idNegocio) return;
    this.api.eliminarBloqueo(b.id_bloqueo, idNegocio).subscribe({
      next: r => {
        if (r?.success) { this.toast.success('Bloqueo eliminado'); this.recargarBloqueos(); }
        else this.toast.error(r?.message || 'No se pudo eliminar.');
        this.cerrarConfirm();
      },
      error: () => { this.toast.error('Error al eliminar.'); this.cerrarConfirm(); },
    });
  }

  cerrarConfirm() { this.confirmAbierto.set(false); this.bloqueoAEliminar.set(null); }

  nombreProfesional(id: number | null): string {
    if (id == null) return 'Todo el negocio';
    return this.profesionales().find(p => p.id_profesional === id)?.nombre ?? `#${id}`;
  }

  private normalizarHora(h: string): string {
    // "09:00:00" → "09:00"
    return h.length >= 5 ? h.slice(0, 5) : h;
  }
}
