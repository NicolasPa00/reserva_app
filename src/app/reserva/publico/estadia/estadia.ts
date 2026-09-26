import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { VitrinaStore } from '../vitrina.store';
import { EstanciaApiService } from '../../../core/services/estancia-api.service';
import { DisponibilidadEstancia, ESPECIES, EstanciaPublica, TAMANOS } from '../../../core/models';
import { UrlArchivoPipe } from '../../../shared/url-archivo.pipe';
import { MonedaPipe } from '../../../shared/moneda.pipe';
import { formatearCodigoCita } from '../../../core/utils/codigo-cita';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sumar(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return iso(d);
}

/**
 * Reservar una estadía desde el portal: un tipo de unidad, unas fechas, cuántos huéspedes.
 *
 * El precio se pide al backend con cada cambio de fechas —la temporada, el fin de semana y las
 * personas extra los calcula él, igual que al crear la reserva—, así que lo que se ve es lo que
 * se cobra. Si el negocio pide anticipo, se muestra cuánto y a dónde consignarlo.
 */
@Component({
  selector: 'reserva-publico-estadia',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, RouterLink, UrlArchivoPipe, MonedaPipe],
  templateUrl: './estadia.html',
  styleUrl: './estadia.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoEstadiaComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(EstanciaApiService);
  readonly store = inject(VitrinaStore);

  readonly especies = ESPECIES;
  readonly tamanos = TAMANOS;
  readonly codigoBonito = formatearCodigoCita;
  readonly hoy = iso(new Date());

  readonly idTipo = signal(0);
  readonly entrada = signal(this.hoy);
  readonly salida = signal(sumar(this.hoy, 1));
  readonly huespedes = signal(2);

  readonly cotizacion = signal<DisponibilidadEstancia | null>(null);
  readonly consultando = signal(false);

  readonly datos = signal({ nombre: '', telefono: '', email: '', documento: '', notas: '' });
  readonly mascota = signal({ nombre: '', especie: 'PERRO', raza: '', tamano: '' });
  readonly comprobante = signal<File | null>(null);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly creada = signal<EstanciaPublica | null>(null);

  readonly raiz = computed(() => `/p/${this.store.negocio()?.id_negocio ?? ''}`);
  readonly tipo = computed(() => this.store.unidadesTipo().find(u => u.id_unidad_tipo === this.idTipo()) ?? null);
  readonly noches = computed(() =>
    Math.max(0, Math.round((new Date(`${this.salida()}T12:00:00`).getTime() - new Date(`${this.entrada()}T12:00:00`).getTime()) / 86_400_000)));
  readonly requiereMascota = computed(() => !!this.store.reglas()?.requiere_mascota);
  readonly anticipo = computed(() => this.store.anticipoDe(this.cotizacion()?.total ?? 0));
  readonly pideComprobante = computed(() => this.store.pideComprobante(this.cotizacion()?.total ?? 0));

  readonly puedeReservar = computed(() =>
    !!this.cotizacion()?.disponible
    && this.datos().nombre.trim().length >= 3
    && this.datos().telefono.trim().length >= 7
    && (!this.requiereMascota() || !!this.mascota().nombre.trim())
    && (!this.pideComprobante() || !!this.comprobante())
    && !this.enviando());

  constructor() {
    // Se cotiza en cuanto la vitrina está cargada y cada vez que cambian fechas o huéspedes.
    effect(() => {
      const id = this.store.negocio()?.id_negocio;
      if (!id || !this.idTipo() || this.noches() <= 0) return;
      this.cotizar(id, this.entrada(), this.salida(), this.huespedes());
    });
  }

  ngOnInit(): void {
    this.store.cargar(Number(this.route.parent?.snapshot.paramMap.get('id_negocio')));
    this.route.paramMap.subscribe(p => this.idTipo.set(Number(p.get('id_unidad_tipo'))));
    const q = this.route.snapshot.queryParamMap;
    const entrada = q.get('entrada');
    if (entrada && entrada >= this.hoy) this.entrada.set(entrada);
    const salida = q.get('salida');
    this.salida.set(salida && salida > this.entrada() ? salida : sumar(this.entrada(), 1));
    const h = Number(q.get('huespedes'));
    if (h > 0) this.huespedes.set(h);
  }

  private cotizar(idNegocio: number, entrada: string, salida: string, huespedes: number) {
    this.consultando.set(true);
    this.api.publicoDisponibilidad(idNegocio, entrada, salida, huespedes).subscribe({
      next: r => {
        this.cotizacion.set((r?.data ?? []).find(x => x.id_unidad_tipo === this.idTipo()) ?? null);
        this.consultando.set(false);
      },
      error: () => { this.cotizacion.set(null); this.consultando.set(false); },
    });
  }

  cambiarEntrada(v: string) {
    if (!v) return;
    this.entrada.set(v);
    if (this.salida() <= v) this.salida.set(sumar(v, 1));
  }

  setDato(campo: 'nombre' | 'telefono' | 'email' | 'documento' | 'notas', v: string) {
    this.datos.update(d => ({ ...d, [campo]: v }));
  }

  setMascota(campo: 'nombre' | 'especie' | 'raza' | 'tamano', v: string) {
    this.mascota.update(m => ({ ...m, [campo]: v }));
  }

  archivo(ev: Event) {
    this.comprobante.set((ev.target as HTMLInputElement).files?.[0] ?? null);
  }

  motivo(m: string | null): string {
    switch (m) {
      case 'CAPACIDAD_EXCEDIDA': return 'Para tantos huéspedes no hay cupo en esta opción.';
      case 'MINIMO_DE_NOCHES': return `Para esas fechas la estadía mínima es de ${this.cotizacion()?.min_noches} noches.`;
      case 'SIN_UNIDADES': return 'No quedan unidades libres para esas fechas. Prueba otras.';
      default: return 'No está disponible para esas fechas.';
    }
  }

  reservar() {
    const id = this.store.negocio()?.id_negocio;
    if (!id || !this.puedeReservar()) return;
    const d = this.datos();
    const m = this.mascota();
    this.enviando.set(true);
    this.error.set(null);
    this.api.publicoReservar(id, {
      id_unidad_tipo: this.idTipo(),
      fecha_entrada: this.entrada(),
      fecha_salida: this.salida(),
      huespedes: this.huespedes(),
      cliente_nombre: d.nombre.trim(),
      cliente_telefono: d.telefono.trim(),
      cliente_email: d.email.trim() || undefined,
      cliente_documento: d.documento.trim() || undefined,
      notas: d.notas.trim() || undefined,
      mascota: this.requiereMascota() ? { nombre: m.nombre.trim(), especie: m.especie, raza: m.raza.trim() || undefined, tamano: m.tamano || undefined } : null,
      comprobante: this.comprobante(),
    }).subscribe({
      next: r => {
        this.enviando.set(false);
        if (r?.success && r.data) this.creada.set(r.data);
        else this.error.set(r?.message || 'No pudimos hacer la reserva.');
      },
      error: e => {
        this.enviando.set(false);
        this.error.set(e?.error?.message || 'No pudimos hacer la reserva. Inténtalo de nuevo.');
        const neg = this.store.negocio()?.id_negocio;
        if (neg) this.cotizar(neg, this.entrada(), this.salida(), this.huespedes());
      },
    });
  }

  verReserva() {
    const c = this.creada()?.codigo_publico;
    if (c) this.router.navigate([this.raiz(), 'mi-cita'], { queryParams: { codigo: c } });
  }
}
