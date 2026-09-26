import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../../core/services/auth.service';
import { EstanciaApiService } from '../../../core/services/estancia-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { OcupacionTablero } from '../../../core/models';
import { ModalComponent } from '../../../shared/modal/modal';
import { EstanciaDetalleComponent } from '../estancia-detalle/estancia-detalle';
import { EstanciaFormComponent, PrefillEstancia } from '../estancia-form/estancia-form';

const DIAS = 14;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sumar(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return iso(d);
}
function dif(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000);
}

interface Barra {
  tipo: 'estancia' | 'bloqueo';
  id: number;
  col: number;     // 1-based
  span: number;
  etiqueta: string;
  estado?: string;
  cortadaIni: boolean;
  cortadaFin: boolean;
  detalle: string;
}

/**
 * Ocupación: una fila por unidad y una columna por noche, dos semanas a la vista.
 *
 * Es la pantalla de trabajo de un alojamiento, igual que la agenda lo es de una barbería. Tocar
 * una noche libre abre una estancia nueva en esa unidad y esa fecha; tocar una barra abre la
 * estancia. Los bloqueos (mantenimiento, reservas importadas de Airbnb/Booking) se pintan
 * aparte para que se vea de dónde vienen.
 */
@Component({
  selector: 'reserva-ocupacion',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, ModalComponent, EstanciaDetalleComponent, EstanciaFormComponent],
  templateUrl: './ocupacion.html',
  styleUrl: './ocupacion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OcupacionComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(EstanciaApiService);
  private readonly toast = inject(ToastService);

  readonly desde = signal(iso(new Date()));
  readonly tablero = signal<OcupacionTablero | null>(null);
  readonly cargando = signal(false);

  readonly detalleId = signal<number | null>(null);
  readonly formAbierto = signal(false);
  readonly prefill = signal<PrefillEstancia | null>(null);

  readonly bloqueo = signal<{ idUnidad: number; desde: string; hasta: string; motivo: string } | null>(null);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);
  readonly puedeCrear = computed(() => this.auth.puedeAccion('estancias_crear'));
  readonly hasta = computed(() => sumar(this.desde(), DIAS));
  readonly hoy = iso(new Date());

  readonly dias = computed(() => Array.from({ length: DIAS }, (_, i) => {
    const f = sumar(this.desde(), i);
    const d = new Date(`${f}T12:00:00`);
    return {
      fecha: f,
      dia: d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''),
      num: d.getDate(),
      finde: d.getDay() === 5 || d.getDay() === 6,
      hoy: f === this.hoy,
    };
  }));

  /** Filas: unidades agrupadas por tipo, cada una con sus barras ya posicionadas. */
  readonly filas = computed(() => {
    const t = this.tablero();
    if (!t) return [];
    const desde = this.desde();
    const hasta = this.hasta();
    const barrasDe = (idUnidad: number): Barra[] => {
      const barras: Barra[] = [];
      const poner = (tipo: Barra['tipo'], id: number, ini: string, fin: string, etiqueta: string, detalle: string, estado?: string) => {
        const a = ini < desde ? desde : ini;
        const b = fin > hasta ? hasta : fin;
        const span = dif(a, b);
        if (span <= 0) return;
        barras.push({
          tipo, id, col: dif(desde, a) + 1, span, etiqueta, estado, detalle,
          cortadaIni: ini < desde, cortadaFin: fin > hasta,
        });
      };
      for (const e of t.estancias.filter(x => x.id_unidad === idUnidad)) {
        poner('estancia', e.id_estancia, e.fecha_entrada, e.fecha_salida, e.cliente_nombre,
          `${e.cliente_nombre} · ${e.huespedes} huésped(es)`, e.estado);
      }
      for (const b of t.bloqueos.filter(x => x.id_unidad === idUnidad)) {
        poner('bloqueo', b.id_bloqueo, b.fecha_desde, b.fecha_hasta,
          b.origen === 'ical' ? (b.calendario || 'Otra plataforma') : 'Bloqueada', b.motivo || '', b.origen);
      }
      return barras;
    };
    const grupos: { tipo: string; unidades: { id_unidad: number; nombre: string; id_unidad_tipo: number; barras: Barra[]; libres: Set<string> }[] }[] = [];
    for (const u of t.unidades) {
      let g = grupos.find(x => x.tipo === u.tipo);
      if (!g) { g = { tipo: u.tipo, unidades: [] }; grupos.push(g); }
      const barras = barrasDe(u.id_unidad);
      const ocupadas = new Set<number>();
      for (const b of barras) for (let i = 0; i < b.span; i++) ocupadas.add(b.col + i);
      const libres = new Set(this.dias().filter((_, i) => !ocupadas.has(i + 1)).map(d => d.fecha));
      g.unidades.push({ ...u, barras, libres });
    }
    return grupos;
  });

  readonly ocupacionHoy = computed(() => {
    const t = this.tablero();
    if (!t?.unidades.length) return null;
    const ocupadas = new Set(t.estancias
      .filter(e => ['pendiente', 'confirmada', 'en_curso'].includes(e.estado) && e.fecha_entrada <= this.hoy && e.fecha_salida > this.hoy)
      .map(e => e.id_unidad));
    return Math.round((ocupadas.size / t.unidades.length) * 100);
  });

  ngOnInit() { this.cargar(); }

  cargar() {
    if (!this.idNegocio()) return;
    this.cargando.set(true);
    this.api.ocupacion(this.idNegocio(), this.desde(), this.hasta()).subscribe({
      next: r => { this.tablero.set(r?.data ?? null); this.cargando.set(false); },
      error: e => { this.cargando.set(false); this.toast.error(e?.error?.message || 'No se pudo cargar la ocupación.'); },
    });
  }

  mover(semanas: number) {
    this.desde.set(semanas === 0 ? iso(new Date()) : sumar(this.desde(), semanas * 7));
    this.cargar();
  }

  irA(fecha: string) {
    if (!fecha) return;
    this.desde.set(fecha);
    this.cargar();
  }

  nuevaEn(idUnidad: number, idTipo: number, fecha: string) {
    if (!this.puedeCrear() || fecha < this.hoy) return;
    this.prefill.set({ entrada: fecha, salida: sumar(fecha, 1), idUnidad, idUnidadTipo: idTipo });
    this.formAbierto.set(true);
  }

  nueva() {
    this.prefill.set(null);
    this.formAbierto.set(true);
  }

  abrirBarra(b: Barra) {
    if (b.tipo === 'estancia') { this.detalleId.set(b.id); return; }
    if (b.estado === 'ical') {
      this.toast.info('Esta noche viene de otra plataforma: se libera cuando la cancelen allá.');
      return;
    }
    if (!this.puedeCrear()) return;
    this.api.eliminarBloqueo(b.id, this.idNegocio()).subscribe({
      next: () => { this.toast.success('Bloqueo quitado'); this.cargar(); },
      error: e => this.toast.error(e?.error?.message || 'No se pudo quitar el bloqueo.'),
    });
  }

  abrirBloqueo(idUnidad: number) {
    this.bloqueo.set({ idUnidad, desde: this.desde(), hasta: sumar(this.desde(), 1), motivo: '' });
  }

  guardarBloqueo() {
    const b = this.bloqueo();
    if (!b || b.hasta <= b.desde) { this.toast.error('La fecha final tiene que ser posterior.'); return; }
    this.api.crearBloqueo(b.idUnidad, this.idNegocio(), b.desde, b.hasta, b.motivo.trim() || null).subscribe({
      next: () => { this.toast.success('Unidad bloqueada'); this.bloqueo.set(null); this.cargar(); },
      error: e => this.toast.error(e?.error?.message || 'No se pudo bloquear.'),
    });
  }

  editarBloqueo(campo: 'desde' | 'hasta' | 'motivo', valor: string) {
    this.bloqueo.update(b => (b ? { ...b, [campo]: valor } : b));
  }

  alCrear() {
    this.formAbierto.set(false);
    this.cargar();
  }
}
