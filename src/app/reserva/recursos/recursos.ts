import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { PerfilApiService } from '../../core/services/perfil-api.service';
import { ToastService } from '../../core/services/toast.service';
import { TipoRecurso } from '../../core/models';

/**
 * Cabinas, salas y equipos (función «Cabinas y equipos»: spa, estética).
 *
 * Un tipo («Cabina») agrupa unidades («Cabina 1», «Cabina 2»). El servicio pide un tipo y la
 * agenda solo ofrece horas con una unidad libre: con dos cabinas y tres terapeutas, a la misma
 * hora caben dos citas, no tres. Sin tipos configurados la agenda funciona como siempre.
 */
@Component({
  selector: 'reserva-recursos',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './recursos.html',
  styleUrl: './recursos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecursosComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(PerfilApiService);
  private readonly toast = inject(ToastService);

  readonly tipos = signal<TipoRecurso[]>([]);
  readonly cargando = signal(false);
  readonly ocupado = signal(false);

  readonly nuevo = signal({ nombre: '', cantidad: 1 });
  readonly unidadNueva = signal<Record<number, string | undefined>>({});
  readonly renombrando = signal<{ tipo: 'tipo' | 'unidad'; id: number; nombre: string } | null>(null);
  readonly confirmarBaja = signal<number | null>(null);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);
  private readonly permiso = computed(() => this.auth.permisosVistaActivos().find(p => p.url === '/recursos') ?? null);
  readonly puedeEditar = computed(() => this.permiso()?.puede_editar ?? true);

  ngOnInit() { this.cargar(); }

  cargar() {
    if (!this.idNegocio()) return;
    this.cargando.set(true);
    this.api.listarRecursos(this.idNegocio()).subscribe({
      next: r => { this.tipos.set(r?.success && r.data ? r.data : []); this.cargando.set(false); },
      error: e => { this.cargando.set(false); this.toast.error(e?.error?.message || 'No se pudieron cargar.'); },
    });
  }

  private tras(obs: ReturnType<PerfilApiService['crearRecurso']>, ok: string) {
    this.ocupado.set(true);
    obs.subscribe({
      next: r => {
        this.ocupado.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.toast.success(ok);
        this.cargar();
      },
      error: e => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo guardar.'); },
    });
  }

  crearTipo() {
    const n = this.nuevo();
    if (!n.nombre.trim()) return;
    this.tras(this.api.crearTipoRecurso(this.idNegocio(), { nombre: n.nombre.trim(), cantidad: n.cantidad }), 'Creado');
    this.nuevo.set({ nombre: '', cantidad: 1 });
  }

  agregarUnidad(t: TipoRecurso) {
    const nombre = (this.unidadNueva()[t.id_tipo_recurso] ?? '').trim() || `${t.nombre} ${t.recursos.length + 1}`;
    this.tras(this.api.crearRecurso(t.id_tipo_recurso, this.idNegocio(), nombre), 'Unidad agregada');
    this.unidadNueva.update(u => ({ ...u, [t.id_tipo_recurso]: '' }));
  }

  escribirUnidad(idTipo: number, valor: string) {
    this.unidadNueva.update(u => ({ ...u, [idTipo]: valor }));
  }

  guardarNombre() {
    const r = this.renombrando();
    if (!r || !r.nombre.trim()) return;
    const obs = r.tipo === 'tipo'
      ? this.api.actualizarTipoRecurso(r.id, this.idNegocio(), { nombre: r.nombre.trim() })
      : this.api.actualizarRecurso(r.id, this.idNegocio(), r.nombre.trim());
    this.tras(obs, 'Nombre actualizado');
    this.renombrando.set(null);
  }

  quitarUnidad(id: number) {
    this.tras(this.api.inactivarRecurso(id, this.idNegocio()), 'Unidad retirada');
  }

  quitarTipo(id: number) {
    this.confirmarBaja.set(null);
    this.tras(this.api.inactivarTipoRecurso(id, this.idNegocio()), 'Retirado. Sus servicios ya no piden cabina.');
  }
}
