import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { PerfilApiService } from '../../core/services/perfil-api.service';
import { ToastService } from '../../core/services/toast.service';
import { ESPECIES, Mascota, TAMANOS } from '../../core/models';
import { ModalComponent } from '../../shared/modal/modal';

const PAGINA = 50;

/**
 * Las mascotas de los clientes (perfil mascotas).
 *
 * Nacen solas al agendar —el dueño las describe en el portal o recepción las registra en la
 * cita— y aquí se consultan y corrigen: raza, tamaño (que elige el precio de los servicios con
 * variantes), comportamiento y la ficha con vacunas y alergias.
 */
@Component({
  selector: 'reserva-mascotas',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, LowerCasePipe, ModalComponent],
  templateUrl: './mascotas.html',
  styleUrl: './mascotas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MascotasComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(PerfilApiService);
  private readonly toast = inject(ToastService);

  readonly especies = ESPECIES;
  readonly tamanos = TAMANOS;

  readonly mascotas = signal<Mascota[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly cargando = signal(false);
  readonly busqueda = signal('');
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  readonly editando = signal<Mascota | null>(null);
  readonly form = signal<Partial<Mascota>>({});
  readonly guardando = signal(false);
  readonly confirmarBaja = signal(false);
  readonly formValido = computed(() => !!String(this.form().nombre ?? '').trim());

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);
  readonly hayMas = computed(() => this.mascotas().length < this.total());
  readonly puedeVerFicha = computed(() => this.auth.puedeAccion('clientes_ficha_ver'));
  private readonly permiso = computed(() => this.auth.permisosVistaActivos().find(p => p.url === '/mascotas') ?? null);
  readonly puedeEditar = computed(() => this.permiso()?.puede_editar ?? true);
  readonly puedeEliminar = computed(() => this.permiso()?.puede_eliminar ?? false);

  ngOnInit() { this.cargar(true); }

  buscar(texto: string) {
    this.busqueda.set(texto);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(true), 300);
  }

  cargar(reiniciar = false) {
    if (!this.idNegocio() || this.cargando()) return;
    const pagina = reiniciar ? 1 : this.pagina() + 1;
    this.cargando.set(true);
    this.api.listarMascotas(this.idNegocio(), { q: this.busqueda().trim() || undefined, pagina, limite: PAGINA }).subscribe({
      next: r => {
        const items = r?.data?.items ?? [];
        this.mascotas.set(reiniciar ? items : [...this.mascotas(), ...items]);
        this.total.set(r?.data?.total ?? 0);
        this.pagina.set(pagina);
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.toast.error(e?.error?.message || 'No se pudieron cargar las mascotas.');
      },
    });
  }

  abrir(m: Mascota) {
    this.editando.set(m);
    this.form.set({ ...m });
    this.confirmarBaja.set(false);
  }

  cerrar() { this.editando.set(null); }

  campo<K extends keyof Mascota>(k: K, v: Mascota[K]) {
    this.form.update(f => ({ ...f, [k]: v }));
  }

  guardar() {
    const m = this.editando();
    const f = this.form();
    if (!m || !String(f.nombre || '').trim()) return;
    this.guardando.set(true);
    this.api.actualizarMascota(m.id_mascota, this.idNegocio(), {
      nombre: String(f.nombre).trim(),
      especie: f.especie,
      raza: f.raza || null,
      tamano: f.tamano || null,
      peso_kg: f.peso_kg === '' ? null : f.peso_kg ?? null,
      fecha_nacimiento: f.fecha_nacimiento || null,
      sexo: f.sexo || null,
      comportamiento: f.comportamiento || null,
      notas: f.notas || null,
    }).subscribe({
      next: r => {
        this.guardando.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.toast.success('Mascota actualizada');
        this.cerrar();
        this.cargar(true);
      },
      error: e => { this.guardando.set(false); this.toast.error(e?.error?.message || 'No se pudo guardar.'); },
    });
  }

  darDeBaja() {
    const m = this.editando();
    if (!m) return;
    this.api.inactivarMascota(m.id_mascota, this.idNegocio()).subscribe({
      next: () => { this.toast.success('Mascota retirada'); this.cerrar(); this.cargar(true); },
      error: e => this.toast.error(e?.error?.message || 'No se pudo retirar.'),
    });
  }

  especieDe(clave: string) { return ESPECIES.find(e => e.clave === clave)?.etiqueta ?? clave; }
  tamanoDe(clave: string | null) { return TAMANOS.find(t => t.clave === clave)?.etiqueta ?? ''; }

  edad(fecha: string | null): string {
    if (!fecha) return '';
    const n = new Date(`${fecha}T12:00:00`);
    const hoy = new Date();
    let meses = (hoy.getFullYear() - n.getFullYear()) * 12 + (hoy.getMonth() - n.getMonth());
    if (meses < 0) meses = 0;
    return meses < 12 ? `${meses} ${meses === 1 ? 'mes' : 'meses'}` : `${Math.floor(meses / 12)} años`;
  }
}
