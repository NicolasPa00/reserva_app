import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
// Sin CurrencyPipe: el formato de moneda pasa por `moneda()`, que además tiene una variante
// corta para las etiquetas de las gráficas. Un único sitio decide cómo se ve un peso.
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import {
  EstadoCita, Informe, InformeDia, InformeProfesional, Profesional,
} from '../../core/models';
import { aHora12 } from '../../core/utils/hora';
import { ESTADO_LABELS, badgeEstado } from '../../shared/cita-detalle/cita-detalle';
import { colorDeEntidad } from '../../core/utils/color-entidad';

type Preset = 'hoy' | '7' | '30' | 'mes' | 'personalizado';

interface Kpi {
  label: string;
  valor: string;
  detalle: string;
  icon: string;
  tono: 'primario' | 'exito' | 'alerta' | 'neutro';
}

/** Punto de la serie ya proyectado a coordenadas del SVG. */
interface PuntoSerie {
  dia: InformeDia;
  x: number;
  y: number;
  alturaPx: number;
  esFinDeSemana: boolean;
}

// Lienzo de la gráfica de barras diaria. Se dibuja en un viewBox fijo y se escala con CSS: así
// el SVG es nítido a cualquier ancho sin recalcular nada al redimensionar.
const VB_ANCHO = 720;
const VB_ALTO = 200;
const MARGEN_IZQ = 8;
const MARGEN_DER = 8;
const MARGEN_SUP = 12;
const MARGEN_INF = 26;

/**
 * Informes del negocio.
 *
 * ## Decisiones de visualización
 *
 * Todas las gráficas usan **un solo tono** (el primario del inquilino) y llevan **etiqueta
 * directa**. No es minimalismo por gusto: la paleta de estados de la app —verde, naranja, azul,
 * rojo— falla la separación para daltonismo (verde↔naranja ΔE 5.9 en protanopia, por debajo del
 * mínimo de 8), así que codificar identidad por color dejaría fuera a parte de los usuarios. Al
 * comparar magnitudes, un tono con el nombre escrito al lado se lee bien siempre, y encima es la
 * forma recomendada para este trabajo: el color categórico se reserva para cuando las series
 * *son* el tema, no para adornar un ranking.
 *
 * Por lo mismo no hay gráfica de doble eje en ninguna parte. Ingresos y citas tienen escalas
 * distintas; se muestran en dos bloques, no superpuestos en un mismo dibujo con dos reglas.
 *
 * Las cifras sueltas (ingresos, ticket, tasas) van como tarjetas, no como gráficas de una barra.
 */
@Component({
  selector: 'reserva-informes',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DecimalPipe, DatePipe],
  templateUrl: './informes.html',
  styleUrl: './informes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InformesComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);

  readonly informe = signal<Informe | null>(null);
  readonly profesionales = signal<Profesional[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly desde = signal<string>('');
  readonly hasta = signal<string>('');
  readonly idProfesional = signal<number | null>(null);
  readonly preset = signal<Preset>('30');

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);

  // ── Cabecera ──

  readonly rangoLabel = computed(() => {
    const inf = this.informe();
    if (!inf) return '';
    const f = (iso: string) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    if (inf.rango.desde === inf.rango.hasta) return f(inf.rango.desde);
    return `${f(inf.rango.desde)} — ${f(inf.rango.hasta)}`;
  });

  readonly nombreProfesionalFiltro = computed(() => {
    const id = this.idProfesional();
    if (id == null) return 'Todo el equipo';
    return this.profesionales().find(p => p.id_profesional === id)?.nombre ?? 'Profesional';
  });

  readonly hayDatos = computed(() => (this.informe()?.totales.citas_totales ?? 0) > 0);

  // ── KPIs ──

  readonly kpis = computed<Kpi[]>(() => {
    const inf = this.informe();
    if (!inf) return [];
    const t = inf.totales;
    const dias = Math.max(1, inf.rango.dias);

    return [
      {
        label: 'Ingresos del periodo',
        valor: this.moneda(t.ingresos),
        detalle: `${this.moneda(Math.round(t.ingresos / dias))} por día · confirmadas y completadas`,
        icon: 'trending-up',
        tono: 'exito',
      },
      {
        label: 'Servicios realizados',
        valor: this.numero(t.servicios_realizados),
        detalle: `en ${this.numero(t.completadas)} cita(s) completada(s)`,
        icon: 'scissors',
        tono: 'primario',
      },
      {
        label: 'Ticket promedio',
        valor: this.moneda(t.ticket_promedio),
        detalle: 'por cita que factura',
        icon: 'tag',
        tono: 'neutro',
      },
      {
        label: 'Clientes atendidos',
        valor: this.numero(t.clientes_unicos),
        detalle: `${this.numero(t.citas_activas)} cita(s) activas`,
        icon: 'users',
        tono: 'primario',
      },
      {
        label: 'Cancelaciones',
        valor: `${t.tasa_cancelacion}%`,
        detalle: `${this.numero(t.canceladas)} cancelada(s) de ${this.numero(t.citas_totales)}`,
        icon: 'circle-alert',
        tono: t.tasa_cancelacion >= 15 ? 'alerta' : 'neutro',
      },
      {
        label: 'Inasistencias',
        valor: `${t.tasa_no_show}%`,
        detalle: `${this.numero(t.no_show)} cliente(s) no se presentaron`,
        icon: 'user-round',
        tono: t.tasa_no_show >= 10 ? 'alerta' : 'neutro',
      },
      {
        label: 'Horas trabajadas',
        valor: this.horas(t.minutos_realizados),
        detalle: 'tiempo de servicios completados',
        icon: 'timer',
        tono: 'neutro',
      },
      {
        label: 'Pagos por validar',
        valor: this.numero(t.pagos_por_validar),
        detalle: t.pagos_por_validar > 0 ? 'requieren tu revisión' : 'todo al día',
        icon: 'credit-card',
        tono: t.pagos_por_validar > 0 ? 'alerta' : 'neutro',
      },
    ];
  });

  // ── Gráfica: actividad por día ──

  readonly vbAncho = VB_ANCHO;
  readonly vbAlto = VB_ALTO;
  readonly ejeY = MARGEN_SUP + (VB_ALTO - MARGEN_SUP - MARGEN_INF);

  readonly maxIngresoDia = computed(() =>
    Math.max(1, ...(this.informe()?.serie_dia ?? []).map(d => d.ingresos)),
  );

  /** Ancho de cada barra; el hueco de 2 px entre barras evita que dos días se lean como uno. */
  readonly anchoBarra = computed(() => {
    const n = this.informe()?.serie_dia.length ?? 1;
    return Math.max(1, (VB_ANCHO - MARGEN_IZQ - MARGEN_DER) / n - 2);
  });

  readonly serie = computed<PuntoSerie[]>(() => {
    const dias = this.informe()?.serie_dia ?? [];
    if (dias.length === 0) return [];
    const util = VB_ALTO - MARGEN_SUP - MARGEN_INF;
    const paso = (VB_ANCHO - MARGEN_IZQ - MARGEN_DER) / dias.length;
    const max = this.maxIngresoDia();

    return dias.map((dia, i) => {
      const alturaPx = max > 0 ? (dia.ingresos / max) * util : 0;
      const d = new Date(`${dia.fecha}T12:00:00`).getDay();
      return {
        dia,
        x: MARGEN_IZQ + i * paso,
        y: MARGEN_SUP + util - alturaPx,
        alturaPx,
        esFinDeSemana: d === 0 || d === 6,
      };
    });
  });

  /** Etiquetas del eje: como mucho 8, para que no se solapen en rangos largos. */
  readonly etiquetasEje = computed(() => {
    const s = this.serie();
    if (s.length === 0) return [];
    const cada = Math.max(1, Math.ceil(s.length / 8));
    return s
      .filter((_, i) => i % cada === 0)
      .map(p => ({
        x: p.x + this.anchoBarra() / 2,
        texto: new Date(`${p.dia.fecha}T12:00:00`)
          .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
          .replace('.', ''),
      }));
  });

  readonly mejorDia = computed<InformeDia | null>(() => {
    const dias = (this.informe()?.serie_dia ?? []).filter(d => d.ingresos > 0);
    if (dias.length === 0) return null;
    return dias.reduce((a, b) => (b.ingresos > a.ingresos ? b : a));
  });

  // ── Rankings (barras horizontales, un solo tono) ──

  readonly maxIngresoPro = computed(() =>
    Math.max(1, ...(this.informe()?.por_profesional ?? []).map(p => p.ingresos)),
  );

  readonly maxVecesServicio = computed(() =>
    Math.max(1, ...(this.informe()?.por_servicio ?? []).map(s => s.veces)),
  );

  readonly totalEstados = computed(() =>
    Math.max(1, (this.informe()?.por_estado ?? []).reduce((a, e) => a + e.citas, 0)),
  );

  /** Solo el tramo horario con actividad: 24 columnas de las que 14 están vacías no informan. */
  readonly horasConActividad = computed(() => {
    const horas = this.informe()?.por_hora ?? [];
    const conDatos = horas.filter(h => h.citas > 0);
    if (conDatos.length === 0) return [];
    const min = Math.min(...conDatos.map(h => h.hora));
    const max = Math.max(...conDatos.map(h => h.hora));
    return horas.filter(h => h.hora >= min && h.hora <= max);
  });

  readonly maxCitasHora = computed(() =>
    Math.max(1, ...this.horasConActividad().map(h => h.citas)),
  );

  readonly horaPico = computed(() => {
    const horas = this.horasConActividad();
    if (horas.length === 0) return null;
    return horas.reduce((a, b) => (b.citas > a.citas ? b : a));
  });

  // ── Ciclo de vida ──

  ngOnInit() {
    this.aplicarPreset('30');
    this.cargarProfesionales();
  }

  private cargarProfesionales() {
    if (!this.idNegocio()) return;
    this.api.listarProfesionales(this.idNegocio()).subscribe({
      next: r => { if (r?.success && r.data) this.profesionales.set(r.data); },
    });
  }

  cargar() {
    if (!this.idNegocio() || !this.desde() || !this.hasta()) return;
    if (this.desde() > this.hasta()) {
      this.toast.error('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.api.getInforme({
      idNegocio: this.idNegocio(),
      desde: this.desde(),
      hasta: this.hasta(),
      idProfesional: this.idProfesional(),
    }).subscribe({
      next: r => {
        if (r?.success && r.data) this.informe.set(r.data);
        else this.error.set(r?.message || 'No se pudo generar el informe.');
        this.cargando.set(false);
      },
      error: e => {
        this.error.set(e?.error?.message || 'Error de conexión al generar el informe.');
        this.cargando.set(false);
      },
    });
  }

  aplicarPreset(p: Preset) {
    this.preset.set(p);
    const hoy = new Date();
    const fin = this.aISO(hoy);
    let ini = fin;

    if (p === '7')       ini = this.aISO(this.sumarDias(hoy, -6));
    else if (p === '30') ini = this.aISO(this.sumarDias(hoy, -29));
    else if (p === 'mes') ini = this.aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));

    if (p !== 'personalizado') {
      this.desde.set(ini);
      this.hasta.set(fin);
      this.cargar();
    }
  }

  setFecha(campo: 'desde' | 'hasta', valor: string) {
    if (!valor) return;
    (campo === 'desde' ? this.desde : this.hasta).set(valor);
    this.preset.set('personalizado');
    this.cargar();
  }

  setProfesional(idRaw: string) {
    this.idProfesional.set(idRaw === '' ? null : Number(idRaw));
    this.cargar();
  }

  // ── Presentación ──

  estadoLabel(e: EstadoCita): string { return ESTADO_LABELS[e] ?? e; }
  badgeEstado(e: EstadoCita): string { return badgeEstado(e); }
  hora12(h: number): string { return aHora12(`${String(h).padStart(2, '0')}:00`); }

  moneda(v: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(v || 0);
  }

  /** Versión corta para las etiquetas de la gráfica: "$ 1,2 M" en vez de "$ 1.234.567". */
  monedaCorta(v: number): string {
    if (!v) return '$ 0';
    if (v >= 1_000_000) return `$ ${(v / 1_000_000).toFixed(1).replace('.', ',')} M`;
    if (v >= 1_000)     return `$ ${Math.round(v / 1000)} k`;
    return `$ ${v}`;
  }

  numero(v: number): string { return new Intl.NumberFormat('es-CO').format(v || 0); }

  horas(min: number): string {
    if (!min) return '0 h';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} m`;
  }

  porcentaje(parte: number, total: number): number {
    return total > 0 ? Math.round((parte / total) * 100) : 0;
  }

  tituloBarraDia(p: PuntoSerie): string {
    const f = new Date(`${p.dia.fecha}T12:00:00`)
      .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    return `${f}\n${p.dia.citas} cita(s) · ${p.dia.completadas} completada(s)\n${this.moneda(p.dia.ingresos)}`;
  }

  ocupacionRelativa(p: InformeProfesional): number {
    const max = Math.max(1, ...(this.informe()?.por_profesional ?? []).map(x => x.minutos));
    return Math.round((p.minutos / max) * 100);
  }

  // ── Helpers de fecha ──

  private aISO(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private sumarDias(d: Date, dias: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + dias);
    return x;
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
