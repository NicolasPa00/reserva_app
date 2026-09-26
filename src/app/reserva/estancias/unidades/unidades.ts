import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../../core/services/auth.service';
import { EstanciaApiService } from '../../../core/services/estancia-api.service';
import { PerfilApiService } from '../../../core/services/perfil-api.service';
import { ReservaApiService } from '../../../core/services/reserva-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { CatalogoVistaPrevia, TarifaTemporada, Unidad, UnidadTipo } from '../../../core/models';
import { ModalComponent } from '../../../shared/modal/modal';
import { MonedaPipe } from '../../../shared/moneda.pipe';

type TipoForm = Pick<UnidadTipo, 'nombre' | 'descripcion' | 'ocupacion_base' | 'capacidad_max' | 'tarifa_base'
  | 'tarifa_fin_semana' | 'tarifa_persona_extra' | 'min_noches'> & { comodidades: string; cantidad: number };

/**
 * Lo que se reserva por noches: tipos de unidad con su tarifa, temporadas y unidades concretas,
 * y los calendarios de Airbnb/Booking que se sincronizan.
 *
 * La sincronización es lo que evita vender dos veces la misma noche: cada unidad importa los
 * calendarios de las plataformas donde también se publica, y exporta el suyo para pegarlo allá.
 */
@Component({
  selector: 'reserva-unidades',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, ModalComponent, MonedaPipe],
  templateUrl: './unidades.html',
  styleUrl: './unidades.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnidadesComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(EstanciaApiService);
  private readonly perfilApi = inject(PerfilApiService);
  private readonly reserva = inject(ReservaApiService);
  private readonly toast = inject(ToastService);

  readonly tipos = signal<UnidadTipo[]>([]);
  readonly cargando = signal(false);
  readonly ocupado = signal(false);
  readonly catalogo = signal<CatalogoVistaPrevia | null>(null);

  readonly editandoTipo = signal<UnidadTipo | null>(null);
  readonly modalTipo = signal(false);
  readonly formTipo = signal<TipoForm>(this.tipoVacio());

  readonly temporada = signal<{ idTipo: number; t: TarifaTemporada } | null>(null);
  readonly unidadNueva = signal<Record<number, string | undefined>>({});
  readonly calendario = signal<{ unidad: Unidad; nombre: string; url: string } | null>(null);
  readonly copiado = signal<number | null>(null);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);
  readonly puedeTarifas = computed(() => this.auth.puedeAccion('unidades_tarifas'));
  readonly esAlojamiento = computed(() => this.auth.perfil().clave === 'ALOJAMIENTO');
  readonly titulo = computed(() => (this.esAlojamiento() ? 'Habitaciones' : 'Unidades'));

  ngOnInit() { this.cargar(); }

  private tipoVacio(): TipoForm {
    return {
      nombre: '', descripcion: '', ocupacion_base: 2, capacidad_max: 2, tarifa_base: 0,
      tarifa_fin_semana: null, tarifa_persona_extra: 0, min_noches: 1, comodidades: '', cantidad: 1,
    };
  }

  cargar() {
    if (!this.idNegocio()) return;
    this.cargando.set(true);
    this.api.listarUnidades(this.idNegocio()).subscribe({
      next: r => {
        this.tipos.set(r?.data ?? []);
        this.cargando.set(false);
        if (!this.tipos().length) {
          this.perfilApi.catalogoVistaPrevia(this.idNegocio()).subscribe({
            next: c => this.catalogo.set(c?.data?.unidades?.length ? c.data : null),
          });
        }
      },
      error: e => { this.cargando.set(false); this.toast.error(e?.error?.message || 'No se pudieron cargar.'); },
    });
  }

  private tras(obs: ReturnType<EstanciaApiService['crearUnidad']>, ok: string, alTerminar?: () => void) {
    this.ocupado.set(true);
    obs.subscribe({
      next: r => {
        this.ocupado.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.toast.success(ok);
        alTerminar?.();
        this.cargar();
      },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo guardar.'); },
    });
  }

  sembrar() {
    this.ocupado.set(true);
    this.perfilApi.sembrarUnidades(this.idNegocio()).subscribe({
      next: r => {
        this.ocupado.set(false);
        this.toast.success(`Listo: ${r?.data?.unidades ?? 0} unidades de ejemplo. Ajusta nombres y tarifas.`);
        this.catalogo.set(null);
        this.cargar();
      },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudieron cargar.'); },
    });
  }

  // ── Tipos ──
  nuevoTipo() {
    this.editandoTipo.set(null);
    this.formTipo.set(this.tipoVacio());
    this.modalTipo.set(true);
  }

  editarTipo(t: UnidadTipo) {
    this.editandoTipo.set(t);
    this.formTipo.set({
      nombre: t.nombre, descripcion: t.descripcion ?? '', ocupacion_base: t.ocupacion_base,
      capacidad_max: t.capacidad_max, tarifa_base: Number(t.tarifa_base),
      tarifa_fin_semana: t.tarifa_fin_semana == null ? null : Number(t.tarifa_fin_semana),
      tarifa_persona_extra: Number(t.tarifa_persona_extra), min_noches: t.min_noches,
      comodidades: (t.comodidades ?? []).join(', '), cantidad: 1,
    });
    this.modalTipo.set(true);
  }

  campoTipo<K extends keyof TipoForm>(k: K, v: TipoForm[K]) {
    this.formTipo.update(f => ({ ...f, [k]: v }));
  }

  guardarTipo() {
    const f = this.formTipo();
    if (!f.nombre.trim()) { this.toast.error('Ponle un nombre.'); return; }
    const datos: Omit<Partial<UnidadTipo>, 'unidades' | 'temporadas'> & { cantidad?: number } = {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion?.trim() || null,
      ocupacion_base: Number(f.ocupacion_base) || 1,
      capacidad_max: Number(f.capacidad_max) || 1,
      tarifa_base: Number(f.tarifa_base) || 0,
      tarifa_fin_semana: f.tarifa_fin_semana === null || (f.tarifa_fin_semana as unknown) === '' ? null : Number(f.tarifa_fin_semana),
      tarifa_persona_extra: Number(f.tarifa_persona_extra) || 0,
      min_noches: Number(f.min_noches) || 1,
      comodidades: f.comodidades.split(',').map(x => x.trim()).filter(Boolean),
    };
    const editando = this.editandoTipo();
    const obs = editando
      ? this.api.actualizarTipo(editando.id_unidad_tipo, this.idNegocio(), datos)
      : this.api.crearTipo(this.idNegocio(), { ...datos, cantidad: Number(f.cantidad) || 1 });
    this.tras(obs as never, editando ? 'Tipo actualizado' : 'Tipo creado', () => this.modalTipo.set(false));
  }

  inactivarTipo(t: UnidadTipo) {
    this.tras(this.api.inactivarTipo(t.id_unidad_tipo, this.idNegocio()) as never, 'Tipo retirado');
  }

  subirImagen(t: UnidadTipo, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (input) input.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { this.toast.error('Elige una imagen.'); return; }
    if (f.size > 3 * 1024 * 1024) { this.toast.error('La imagen supera 3 MB.'); return; }
    this.tras(this.api.subirImagenTipo(t.id_unidad_tipo, this.idNegocio(), f) as never, 'Imagen actualizada');
  }

  urlImagen(ruta: string | null): string {
    if (!ruta) return '';
    return /^https?:\/\//i.test(ruta) ? ruta : this.reserva.origenArchivos + ruta;
  }

  // ── Temporadas ──
  nuevaTemporada(t: UnidadTipo) {
    const hoy = new Date().toISOString().slice(0, 10);
    this.temporada.set({ idTipo: t.id_unidad_tipo, t: { nombre: '', desde: hoy, hasta: hoy, precio_noche: Number(t.tarifa_base), min_noches: null } });
  }

  editarTemporada(idTipo: number, t: TarifaTemporada) {
    this.temporada.set({ idTipo, t: { ...t, precio_noche: Number(t.precio_noche) } });
  }

  campoTemporada<K extends keyof TarifaTemporada>(k: K, v: TarifaTemporada[K]) {
    this.temporada.update(x => (x ? { ...x, t: { ...x.t, [k]: v } } : x));
  }

  guardarTemporada() {
    const x = this.temporada();
    if (!x || !x.t.nombre.trim()) { this.toast.error('Ponle un nombre a la temporada.'); return; }
    const t = { ...x.t, nombre: x.t.nombre.trim(), precio_noche: Number(x.t.precio_noche), min_noches: x.t.min_noches ? Number(x.t.min_noches) : null };
    this.tras(this.api.guardarTemporada(x.idTipo, this.idNegocio(), t) as never, 'Temporada guardada', () => this.temporada.set(null));
  }

  eliminarTemporada(t: TarifaTemporada) {
    if (!t.id_tarifa) return;
    this.tras(this.api.eliminarTemporada(t.id_tarifa, this.idNegocio()) as never, 'Temporada quitada');
  }

  // ── Unidades ──
  escribirUnidad(idTipo: number, v: string) { this.unidadNueva.update(u => ({ ...u, [idTipo]: v })); }

  agregarUnidad(t: UnidadTipo) {
    const nombre = (this.unidadNueva()[t.id_unidad_tipo] ?? '').trim();
    if (!nombre) { this.toast.error('Escribe el nombre de la unidad (ej.: 104).'); return; }
    this.tras(this.api.crearUnidad(t.id_unidad_tipo, this.idNegocio(), nombre), 'Unidad agregada',
      () => this.unidadNueva.update(u => ({ ...u, [t.id_unidad_tipo]: '' })));
  }

  quitarUnidad(u: Unidad) {
    this.tras(this.api.inactivarUnidad(u.id_unidad, this.idNegocio()), 'Unidad retirada');
  }

  // ── Calendarios ──
  copiarIcal(u: Unidad) {
    const url = this.api.urlIcal(u.ical_token);
    navigator.clipboard?.writeText(url).then(() => {
      this.copiado.set(u.id_unidad);
      setTimeout(() => this.copiado.set(null), 2000);
    }).catch(() => this.toast.info(url));
  }

  abrirCalendario(u: Unidad) { this.calendario.set({ unidad: u, nombre: 'Airbnb', url: '' }); }

  conectarCalendario() {
    const c = this.calendario();
    if (!c || !c.url.trim().startsWith('https://')) { this.toast.error('Pega la dirección https del calendario (.ics).'); return; }
    this.tras(this.api.conectarCalendario(c.unidad.id_unidad, this.idNegocio(), c.nombre.trim() || 'Calendario', c.url.trim()),
      'Calendario conectado y sincronizado', () => this.calendario.set(null));
  }

  desconectarCalendario(id: number) {
    this.tras(this.api.desconectarCalendario(id, this.idNegocio()), 'Calendario desconectado');
  }

  sincronizar() {
    this.tras(this.api.sincronizar(this.idNegocio()), 'Calendarios sincronizados');
  }

  readonly hayCalendarios = computed(() => this.tipos().some(t => (t.unidades ?? []).some(u => (u.calendarios ?? []).length)));
}
