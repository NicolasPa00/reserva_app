import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { Bloqueo, Profesional } from '../../core/models';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';

/**
 * Franja de un día. `uid` es de cliente, no viaja al backend.
 *
 * Existe porque la edición anterior identificaba la franja por **identidad de objeto**
 * (`x === b`) con un índice de respaldo, y eso se rompe en cuanto dos franjas del mismo día
 * tienen las mismas horas: editar una movía la otra. Una clave estable lo cierra.
 */
interface BloqueDia {
  uid: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const LABORABLES = [1, 2, 3, 4, 5];

let contadorUid = 1;

/**
 * Horario semanal de atención y bloqueos puntuales.
 *
 * Esta pantalla es la que gobierna la agenda: lo que se marque aquí es literalmente lo que
 * `reglasAgenda.intervalosLaborales` usa para decidir qué días y qué horas se pueden reservar.
 * Por eso el objetivo de la interfaz es que **no quede ambiguo** qué días están abiertos: un
 * día sin franjas es un día cerrado, y ahora se dice con esas palabras y con un interruptor,
 * en vez de dejar la tarjeta vacía y que el usuario lo deduzca.
 *
 * Añadidos que evitan el trabajo repetitivo que tenía antes (siete días a mano, uno por uno):
 * copiar la jornada de un día al resto, y un resumen de horas semanales para ver de un vistazo
 * si el horario cuadra.
 */
@Component({
  selector: 'reserva-horarios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ModalComponent, ConfirmDialogComponent, DatePipe],
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
  readonly sucio = signal(false);

  // Bloqueos
  readonly bloqueos = signal<Bloqueo[]>([]);
  readonly modalBloqueoAbierto = signal(false);
  readonly bloqueoForm = signal<{ id_profesional: number | null; fecha_inicio: string; fecha_fin: string; motivo: string }>(
    { id_profesional: null, fecha_inicio: '', fecha_fin: '', motivo: '' },
  );
  readonly confirmAbierto = signal(false);
  readonly bloqueoAEliminar = signal<Bloqueo | null>(null);

  // Editar la jornada semanal afecta a lo que se puede reservar; los bloqueos son del día a día.
  readonly puedeEditarHorario = computed(() => this.auth.puedeAccion('horarios_editar'));
  readonly puedeBloqueos      = computed(() => this.auth.puedeAccion('horarios_bloqueos'));

  readonly diasSemana = DIAS;
  readonly diasCortos = DIAS_CORTOS;

  readonly bloquesPorDia = computed(() => {
    const map = new Map<number, BloqueDia[]>();
    for (let d = 0; d < 7; d++) map.set(d, []);
    for (const b of this.bloques()) map.get(b.dia_semana)!.push(b);
    for (const arr of map.values()) arr.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    return map;
  });

  readonly diasAbiertos = computed(() =>
    [...this.bloquesPorDia().values()].filter(arr => arr.length > 0).length,
  );

  /** Horas semanales según lo que hay en pantalla; las franjas inválidas no suman. */
  readonly horasSemanales = computed(() => {
    const min = this.bloques().reduce((acc, b) => {
      const d = this.minutosEntre(b.hora_inicio, b.hora_fin);
      return d > 0 ? acc + d : acc;
    }, 0);
    return Math.round((min / 60) * 10) / 10;
  });

  /** Errores de validación por día: se muestran junto a la tarjeta, no en un toast al guardar. */
  readonly erroresPorDia = computed(() => {
    const errores = new Map<number, string>();
    for (const [dia, arr] of this.bloquesPorDia()) {
      const invalida = arr.find(b => this.minutosEntre(b.hora_inicio, b.hora_fin) <= 0);
      if (invalida) { errores.set(dia, 'La hora de fin debe ser posterior a la de inicio.'); continue; }
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].hora_inicio < arr[i - 1].hora_fin) {
          errores.set(dia, 'Hay franjas que se solapan.');
          break;
        }
      }
    }
    return errores;
  });

  readonly hayErrores = computed(() => this.erroresPorDia().size > 0);

  readonly nombreTarget = computed(() => {
    const id = this.profesionalSeleccionado();
    if (id == null) return 'el negocio';
    return this.profesionales().find(p => p.id_profesional === id)?.nombre ?? 'este profesional';
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
        this.bloques.set((r?.data ?? []).map(h => ({
          uid: contadorUid++,
          dia_semana: h.dia_semana,
          hora_inicio: this.normalizarHora(h.hora_inicio),
          hora_fin:    this.normalizarHora(h.hora_fin),
        })));
        this.sucio.set(false);
        this.cargando.set(false);
      },
      error: () => { this.toast.error('No se pudo cargar el horario.'); this.cargando.set(false); },
    });
  }

  cambiarTarget(idRaw: string) {
    this.profesionalSeleccionado.set(idRaw === '' ? null : Number(idRaw));
    this.cargarHorario();
  }

  // ── Edición de franjas ──

  abrirDia(dia: number) {
    // Se abre con la jornada más común (9–13 y 14–18) en vez de una franja vacía: es la
    // suposición correcta la mayoría de las veces y siempre se puede ajustar.
    this.bloques.update(arr => [
      ...arr,
      { uid: contadorUid++, dia_semana: dia, hora_inicio: '09:00', hora_fin: '13:00' },
      { uid: contadorUid++, dia_semana: dia, hora_inicio: '14:00', hora_fin: '18:00' },
    ]);
    this.sucio.set(true);
  }

  cerrarDia(dia: number) {
    this.bloques.update(arr => arr.filter(b => b.dia_semana !== dia));
    this.sucio.set(true);
  }

  alternarDia(dia: number) {
    if ((this.bloquesPorDia().get(dia)?.length ?? 0) > 0) this.cerrarDia(dia);
    else this.abrirDia(dia);
  }

  agregarFranja(dia: number) {
    const existentes = this.bloquesPorDia().get(dia) ?? [];
    const ultima = existentes[existentes.length - 1];
    // La nueva franja arranca donde acabó la anterior; encadenar es el caso normal.
    const inicio = ultima ? ultima.hora_fin : '09:00';
    this.bloques.update(arr => [
      ...arr,
      { uid: contadorUid++, dia_semana: dia, hora_inicio: inicio, hora_fin: this.sumarHoras(inicio, 4) },
    ]);
    this.sucio.set(true);
  }

  eliminarFranja(uid: number) {
    this.bloques.update(arr => arr.filter(b => b.uid !== uid));
    this.sucio.set(true);
  }

  actualizarHora(uid: number, campo: 'hora_inicio' | 'hora_fin', valor: string) {
    if (!valor) return;
    this.bloques.update(arr => arr.map(b => b.uid === uid ? { ...b, [campo]: valor } : b));
    this.sucio.set(true);
  }

  /** Copia la jornada de `dia` al resto (a todos, o solo a lunes-viernes). */
  copiarDia(dia: number, destino: 'todos' | 'laborables') {
    const origen = this.bloquesPorDia().get(dia) ?? [];
    if (origen.length === 0) { this.toast.warning('Ese día está cerrado: no hay nada que copiar.'); return; }
    const objetivo = (destino === 'todos' ? [0, 1, 2, 3, 4, 5, 6] : LABORABLES).filter(d => d !== dia);

    this.bloques.update(arr => [
      ...arr.filter(b => !objetivo.includes(b.dia_semana)),
      ...objetivo.flatMap(d => origen.map(b => ({
        uid: contadorUid++, dia_semana: d, hora_inicio: b.hora_inicio, hora_fin: b.hora_fin,
      }))),
    ]);
    this.sucio.set(true);
    this.toast.success(destino === 'todos'
      ? `Jornada del ${DIAS[dia].toLowerCase()} copiada a los demás días.`
      : `Jornada del ${DIAS[dia].toLowerCase()} copiada a lunes–viernes.`);
  }

  guardar() {
    const idNegocio = this.auth.negocio()?.id_negocio;
    if (!idNegocio) return;

    const errores = this.erroresPorDia();
    if (errores.size > 0) {
      const [dia, msg] = [...errores.entries()][0];
      this.toast.error(`${DIAS[dia]}: ${msg}`);
      return;
    }

    this.guardando.set(true);
    this.api.reemplazarHorarios({
      id_negocio: idNegocio,
      id_profesional: this.profesionalSeleccionado(),
      bloques: this.bloques().map(({ dia_semana, hora_inicio, hora_fin }) => ({ dia_semana, hora_inicio, hora_fin })),
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) { this.toast.success('Horario guardado'); this.sucio.set(false); }
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
    // `toISOString()` daba hora UTC: a las 22:40 de Bogotá el formulario proponía las 03:40 del
    // día siguiente. El input `datetime-local` espera hora **local**, así que se formatea local.
    const ahora = new Date();
    const enUnaHora = new Date(ahora.getTime() + 3_600_000);
    this.bloqueoForm.set({
      id_profesional: this.profesionalSeleccionado(),
      fecha_inicio: this.aDatetimeLocal(ahora),
      fecha_fin:    this.aDatetimeLocal(enUnaHora),
      motivo: '',
    });
    this.modalBloqueoAbierto.set(true);
  }

  setBloqueoProfesional(idRaw: string) {
    this.setBloqueoCampo('id_profesional', idRaw === '' ? null : Number(idRaw));
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
    } as Partial<Bloqueo>).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success('Bloqueo creado');
          this.modalBloqueoAbierto.set(false);
          this.recargarBloqueos();
        } else this.toast.error(r?.message || 'No se pudo crear el bloqueo.');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al crear el bloqueo.');
      },
    });
  }

  /** Atajos del formulario de bloqueo: los casos que se repiten (día completo, semana). */
  aplicarPreset(preset: 'hoy' | 'manana' | 'semana') {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    if (preset === 'manana') inicio.setDate(inicio.getDate() + 1);

    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + (preset === 'semana' ? 7 : 1));

    this.bloqueoForm.update(f => ({
      ...f,
      fecha_inicio: this.aDatetimeLocal(inicio),
      fecha_fin: this.aDatetimeLocal(fin),
    }));
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

  /** Un bloqueo ya pasado se sigue listando, pero atenuado: informa sin estorbar. */
  bloqueoVencido(b: Bloqueo): boolean {
    return new Date(b.fecha_fin).getTime() < Date.now();
  }

  horasDelDia(dia: number): string {
    const min = (this.bloquesPorDia().get(dia) ?? []).reduce((acc, b) => {
      const d = this.minutosEntre(b.hora_inicio, b.hora_fin);
      return d > 0 ? acc + d : acc;
    }, 0);
    if (min === 0) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} m`;
  }

  // ── Helpers ──

  private minutosEntre(inicio: string, fin: string): number {
    const [hi, mi] = inicio.split(':').map(Number);
    const [hf, mf] = fin.split(':').map(Number);
    return (hf * 60 + mf) - (hi * 60 + mi);
  }

  private sumarHoras(hora: string, horas: number): string {
    const [h, m] = hora.split(':').map(Number);
    const total = Math.min(23 * 60 + 59, h * 60 + m + horas * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  private normalizarHora(h: string): string {
    // "09:00:00" → "09:00"
    return h.length >= 5 ? h.slice(0, 5) : h;
  }

  /** `YYYY-MM-DDTHH:mm` en hora local, que es lo que espera `datetime-local`. */
  private aDatetimeLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
