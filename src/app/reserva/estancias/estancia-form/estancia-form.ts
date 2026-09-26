import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges,
  computed, inject, signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../../core/services/auth.service';
import { EstanciaApiService } from '../../../core/services/estancia-api.service';
import { PerfilApiService } from '../../../core/services/perfil-api.service';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { DisponibilidadEstancia, Estancia, Mascota } from '../../../core/models';
import { ModalComponent } from '../../../shared/modal/modal';
import { MonedaPipe } from '../../../shared/moneda.pipe';

export interface PrefillEstancia {
  entrada?: string;
  salida?: string;
  idUnidad?: number | null;
  idUnidadTipo?: number | null;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumar(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return iso(d);
}

/**
 * Nueva estancia desde recepción: fechas y huéspedes → qué tipos quedan libres y cuánto cuestan
 * → a quién. La unidad concreta es opcional (si no se elige, el backend toma la primera libre).
 * Desde Ocupación llega precargada con la celda que se tocó.
 */
@Component({
  selector: 'reserva-estancia-form',
  standalone: true,
  imports: [LucideAngularModule, ModalComponent, MonedaPipe],
  templateUrl: './estancia-form.html',
  styleUrl: './estancia-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstanciaFormComponent implements OnChanges {
  @Input({ required: true }) idNegocio!: number;
  @Input() open = false;
  @Input() prefill: PrefillEstancia | null = null;
  @Output() cerrar = new EventEmitter<void>();
  @Output() creada = new EventEmitter<Estancia>();

  private readonly api = inject(EstanciaApiService);
  private readonly reserva = inject(ReservaApiService);
  private readonly perfilApi = inject(PerfilApiService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly conMascotas = computed(() => this.auth.tieneFuncion('mascotas'));

  readonly entrada = signal(iso(new Date()));
  readonly salida = signal(sumar(iso(new Date()), 1));
  readonly huespedes = signal(1);
  readonly opciones = signal<DisponibilidadEstancia[]>([]);
  readonly buscando = signal(false);
  readonly idTipo = signal<number | null>(null);
  readonly idUnidad = signal<number | null>(null);

  readonly cliente = signal({ nombre: '', telefono: '', email: '', documento: '', notas: '' });
  readonly mascotas = signal<Mascota[]>([]);
  readonly idMascota = signal<string | null>(null);
  readonly enviando = signal(false);
  private buscaCliente: ReturnType<typeof setTimeout> | null = null;

  readonly noches = computed(() => {
    const a = new Date(`${this.entrada()}T12:00:00`).getTime();
    const b = new Date(`${this.salida()}T12:00:00`).getTime();
    return Math.max(0, Math.round((b - a) / 86_400_000));
  });
  readonly elegida = computed(() => this.opciones().find(o => o.id_unidad_tipo === this.idTipo()) ?? null);
  readonly listo = computed(() =>
    this.noches() > 0 && !!this.elegida()?.disponible && !!this.cliente().nombre.trim()
    && (!this.conMascotas() || !!this.idMascota()));

  ngOnChanges(c: SimpleChanges) {
    if (c['open'] && this.open) this.reiniciar();
  }

  private reiniciar() {
    const p = this.prefill ?? {};
    const hoy = iso(new Date());
    this.entrada.set(p.entrada ?? hoy);
    this.salida.set(p.salida ?? sumar(p.entrada ?? hoy, 1));
    this.huespedes.set(1);
    this.idTipo.set(p.idUnidadTipo ?? null);
    this.idUnidad.set(p.idUnidad ?? null);
    this.cliente.set({ nombre: '', telefono: '', email: '', documento: '', notas: '' });
    this.mascotas.set([]);
    this.idMascota.set(null);
    this.buscar();
  }

  cambiarFecha(campo: 'entrada' | 'salida', valor: string) {
    if (!valor) return;
    if (campo === 'entrada') {
      this.entrada.set(valor);
      if (this.salida() <= valor) this.salida.set(sumar(valor, 1));
    } else {
      this.salida.set(valor);
    }
    this.buscar();
  }

  cambiarHuespedes(v: number) {
    this.huespedes.set(Math.max(1, v || 1));
    this.buscar();
  }

  buscar() {
    if (this.noches() <= 0) { this.opciones.set([]); return; }
    this.buscando.set(true);
    this.api.disponibilidad(this.idNegocio, this.entrada(), this.salida(), this.huespedes()).subscribe({
      next: r => {
        const lista = r?.data ?? [];
        this.opciones.set(lista);
        const actual = lista.find(o => o.id_unidad_tipo === this.idTipo());
        if (!actual?.disponible) {
          // Si venía una unidad concreta (celda de Ocupación), se respeta su tipo.
          const primera = lista.find(o => o.disponible);
          if (!this.idUnidad()) this.idTipo.set(primera?.id_unidad_tipo ?? null);
        }
        if (this.idUnidad() && !actual?.unidades_libres?.some(u => u.id_unidad === this.idUnidad())) this.idUnidad.set(null);
        this.buscando.set(false);
      },
      error: e => { this.buscando.set(false); this.toast.error(e?.error?.message || 'No se pudo consultar la disponibilidad.'); },
    });
  }

  elegirTipo(o: DisponibilidadEstancia) {
    if (!o.disponible) return;
    this.idTipo.set(o.id_unidad_tipo);
    this.idUnidad.set(null);
  }

  setCliente(campo: 'nombre' | 'telefono' | 'email' | 'documento' | 'notas', valor: string) {
    this.cliente.update(c => ({ ...c, [campo]: valor }));
    if (campo === 'telefono') this.reconocer(valor);
  }

  /** Mismo reconocimiento por teléfono que en la agenda: un huésped que ya vino se completa solo. */
  private reconocer(telefono: string) {
    if (this.buscaCliente) clearTimeout(this.buscaCliente);
    if ((telefono || '').replace(/\D/g, '').length < 10) return;
    this.buscaCliente = setTimeout(() => {
      this.reserva.buscarClientePorTelefono(this.idNegocio, telefono).subscribe({
        next: r => {
          const c = r?.data;
          if (!c) return;
          this.cliente.update(x => ({ ...x, nombre: x.nombre.trim() ? x.nombre : (c.nombre ?? ''), email: x.email || (c.email ?? '') }));
          if (this.conMascotas()) {
            this.perfilApi.mascotasDeCliente(this.idNegocio, c.id_persona_negocio).subscribe({
              next: m => {
                const lista = m?.data ?? [];
                this.mascotas.set(lista);
                if (lista.length === 1) this.idMascota.set(lista[0].id_mascota);
              },
            });
          }
        },
      });
    }, 400);
  }

  guardar() {
    const o = this.elegida();
    if (!this.listo() || !o) return;
    const c = this.cliente();
    this.enviando.set(true);
    this.api.crear(this.idNegocio, {
      id_unidad_tipo: o.id_unidad_tipo,
      id_unidad: this.idUnidad(),
      fecha_entrada: this.entrada(),
      fecha_salida: this.salida(),
      huespedes: this.huespedes(),
      cliente_nombre: c.nombre.trim(),
      cliente_telefono: c.telefono.trim() || null,
      cliente_email: c.email.trim() || null,
      cliente_documento: c.documento.trim() || null,
      notas: c.notas.trim() || null,
      id_mascota: this.idMascota(),
    }).subscribe({
      next: r => {
        this.enviando.set(false);
        if (!r?.success || !r.data) { this.toast.error(r?.message || 'No se pudo crear.'); return; }
        this.toast.success('Estancia creada');
        this.creada.emit(r.data);
      },
      error: e => {
        this.enviando.set(false);
        this.toast.error(e?.error?.message || 'No se pudo crear la estancia.');
        this.buscar();
      },
    });
  }
}
