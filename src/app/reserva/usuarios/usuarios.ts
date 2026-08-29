import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import {
  PermisosRol, RolReserva, UsuarioNegocio, UsuarioPayload,
} from '../../core/models';
import { MayusculasDirective } from '../../shared/mayusculas.directive';
import { ModalComponent } from '../../shared/modal/modal';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';

type Tab = 'usuarios' | 'roles';

interface FormUsuario {
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  num_identificacion: string;
  email: string;
  telefono: string;
  id_rol: number | null;
  password: string;
  id_profesional: number | null;
  especialidad: string;
}

const FORM_VACIO: FormUsuario = {
  primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '',
  num_identificacion: '', email: '', telefono: '',
  id_rol: null, password: '', id_profesional: null, especialidad: '',
};

/**
 * Usuarios del negocio y permisos por rol.
 *
 * ## Dos pestañas, dos preguntas
 *
 * - **Usuarios**: quién entra. Alta, edición, activar/desactivar y restablecer contraseña.
 * - **Roles**: qué ve cada tipo de usuario **en este negocio**.
 *
 * La segunda escribe `gener_nivel_negocio`, el ajuste por negocio, y no `gener_rol_nivel`, que
 * es la plantilla de plataforma. Por eso la matriz muestra las dos columnas: lo que el rol
 * permite en general (gris, no editable) y lo que este negocio concede (la casilla). Sin esa
 * distinción, alguien concede «Caja» a un profesional, ve la vista aparecer sin botones y no
 * entiende por qué.
 *
 * ## Alta de profesionales
 *
 * Crear un usuario con rol PROFESIONAL crea también su ficha en la agenda, o enlaza una que ya
 * exista. Es lo que permite que «Nuevo profesional» redirija aquí: un profesional que no puede
 * entrar al sistema y un usuario que no puede recibir citas son media persona cada uno.
 */
@Component({
  selector: 'reserva-usuarios',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, MayusculasDirective, ModalComponent, ConfirmDialogComponent],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuariosComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  private readonly api   = inject(ReservaApiService);
  private readonly toast = inject(ToastService);

  readonly usuarios = signal<UsuarioNegocio[]>([]);
  readonly roles = signal<RolReserva[]>([]);
  readonly profesionalesLibres = signal<{ id_profesional: number; nombre: string; especialidad: string | null }[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly tab = signal<Tab>('usuarios');

  readonly busqueda = signal('');
  readonly incluirInactivos = signal(false);

  // Alta / edición
  readonly modalUsuario = signal(false);
  readonly usuarioEditando = signal<UsuarioNegocio | null>(null);
  readonly form = signal<FormUsuario>({ ...FORM_VACIO });

  // Credenciales recién creadas
  readonly credenciales = signal<{ email: string; password: string } | null>(null);

  // Estado / reset
  readonly confirmEstado = signal(false);
  readonly usuarioObjetivo = signal<UsuarioNegocio | null>(null);
  readonly confirmReset = signal(false);

  // Permisos por rol
  readonly rolSeleccionado = signal<number | null>(null);
  readonly permisos = signal<PermisosRol | null>(null);
  readonly cargandoPermisos = signal(false);
  readonly permisosSucios = signal(false);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);
  readonly idUsuarioActual = computed(() => this.auth.usuario()?.id_usuario ?? 0);

  readonly rolElegido = computed<RolReserva | null>(() => {
    const id = this.form().id_rol;
    return this.roles().find(r => r.id_rol === id) ?? null;
  });

  readonly esProfesional = computed(() => this.rolElegido()?.descripcion === 'PROFESIONAL');

  readonly usuariosFiltrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return this.usuarios();
    return this.usuarios().filter(u =>
      u.nombre_completo.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.num_identificacion.includes(q),
    );
  });

  readonly formValido = computed(() => {
    const f = this.form();
    const base = !!f.primer_nombre.trim() && !!f.primer_apellido.trim() && !!f.email.trim() && f.id_rol != null;
    if (this.usuarioEditando()) {
      // Al editar, la contraseña es opcional; si se escribe, debe ser válida.
      return base && (!f.password.trim() || f.password.trim().length >= 8);
    }
    return base && !!f.num_identificacion.trim() &&
      (!f.password.trim() || f.password.trim().length >= 8);
  });

  ngOnInit() { this.cargar(); }

  cargar() {
    const id = this.idNegocio();
    if (!id) return;
    this.cargando.set(true);
    forkJoin({
      usuarios: this.api.listarUsuarios(id, { incluirInactivos: this.incluirInactivos() }),
      roles: this.api.listarRolesReserva(id),
      libres: this.api.profesionalesSinUsuario(id),
    }).subscribe({
      next: ({ usuarios, roles, libres }) => {
        this.usuarios.set(usuarios?.data ?? []);
        this.roles.set(roles?.data ?? []);
        this.profesionalesLibres.set(libres?.data ?? []);
        this.cargando.set(false);
      },
      error: e => {
        this.toast.error(e?.error?.message || 'No se pudieron cargar los usuarios.');
        this.cargando.set(false);
      },
    });
  }

  cambiarTab(t: Tab) {
    this.tab.set(t);
    if (t === 'roles' && this.rolSeleccionado() == null && this.roles().length > 0) {
      this.elegirRol(this.roles()[0].id_rol);
    }
  }

  alternarInactivos() {
    this.incluirInactivos.update(v => !v);
    this.cargar();
  }

  // ── Alta y edición ──

  abrirNuevo(preseleccionarProfesional = false) {
    const rolPro = this.roles().find(r => r.descripcion === 'PROFESIONAL');
    this.usuarioEditando.set(null);
    this.form.set({
      ...FORM_VACIO,
      id_rol: preseleccionarProfesional && rolPro ? rolPro.id_rol : (this.roles()[0]?.id_rol ?? null),
    });
    this.credenciales.set(null);
    this.modalUsuario.set(true);
  }

  abrirEditar(u: UsuarioNegocio) {
    this.usuarioEditando.set(u);
    this.form.set({
      primer_nombre: u.primer_nombre ?? '',
      segundo_nombre: u.segundo_nombre ?? '',
      primer_apellido: u.primer_apellido ?? '',
      segundo_apellido: u.segundo_apellido ?? '',
      num_identificacion: u.num_identificacion ?? '',
      email: u.email ?? '',
      telefono: u.telefono ?? '',
      id_rol: u.rol?.id_rol ?? null,
      password: '',
      id_profesional: null,
      especialidad: '',
    });
    this.credenciales.set(null);
    this.modalUsuario.set(true);
  }

  setCampo<K extends keyof FormUsuario>(campo: K, valor: FormUsuario[K]) {
    this.form.update(f => ({ ...f, [campo]: valor }));
  }

  setRol(raw: string) { this.setCampo('id_rol', raw ? Number(raw) : null); }

  setProfesionalExistente(raw: string) {
    const id = raw ? Number(raw) : null;
    this.setCampo('id_profesional', id);
    // Al enlazar una ficha existente, se propone su nombre para no teclearlo otra vez.
    const pro = this.profesionalesLibres().find(p => p.id_profesional === id);
    if (pro && !this.form().primer_nombre.trim()) {
      const partes = pro.nombre.trim().split(/\s+/);
      this.form.update(f => ({
        ...f,
        primer_nombre: partes[0] ?? '',
        primer_apellido: partes.slice(1).join(' ') || '',
        especialidad: pro.especialidad ?? '',
      }));
    }
  }

  guardar() {
    if (!this.formValido()) return;
    const id = this.idNegocio();
    const f = this.form();
    const editando = this.usuarioEditando();

    const payload: UsuarioPayload = {
      primer_nombre: f.primer_nombre.trim(),
      segundo_nombre: f.segundo_nombre.trim() || null,
      primer_apellido: f.primer_apellido.trim(),
      segundo_apellido: f.segundo_apellido.trim() || null,
      num_identificacion: f.num_identificacion.trim(),
      email: f.email.trim(),
      telefono: f.telefono.trim() || null,
      id_rol: f.id_rol!,
      password: f.password.trim() || null,
      id_profesional: f.id_profesional,
      especialidad: f.especialidad.trim() || null,
    };

    this.guardando.set(true);
    const peticion = editando
      ? this.api.actualizarUsuario(editando.id_usuario, id, payload)
      : this.api.crearUsuario(id, payload);

    peticion.subscribe({
      next: r => {
        this.guardando.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }

        if (editando) {
          this.toast.success('Usuario actualizado');
          this.modalUsuario.set(false);
        } else {
          this.toast.success('Usuario creado');
          const temporal = (r.data as { password_temporal?: string | null })?.password_temporal;
          if (temporal) {
            // Se muestran las credenciales en pantalla en vez de cerrar sin más: el admin tiene
            // que poder dictárselas al empleado, y no se vuelven a mostrar.
            this.credenciales.set({ email: payload.email, password: temporal });
          } else {
            this.modalUsuario.set(false);
          }
        }
        this.cargar();
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar el usuario.');
      },
    });
  }

  cerrarModalUsuario() {
    this.modalUsuario.set(false);
    this.credenciales.set(null);
  }

  // ── Estado y contraseña ──

  pedirCambiarEstado(u: UsuarioNegocio) {
    this.usuarioObjetivo.set(u);
    this.confirmEstado.set(true);
  }

  cambiarEstadoConfirmado() {
    const u = this.usuarioObjetivo();
    if (!u) return;
    const nuevo = u.estado === 'A' ? 'I' : 'A';
    this.api.cambiarEstadoUsuario(u.id_usuario, this.idNegocio(), nuevo).subscribe({
      next: r => {
        if (r?.success) {
          this.toast.success(nuevo === 'A' ? 'Acceso reactivado' : 'Acceso desactivado');
          this.cargar();
        } else this.toast.error(r?.message || 'No se pudo cambiar el estado.');
        this.cerrarConfirmEstado();
      },
      error: e => {
        this.toast.error(e?.error?.message || 'Error al cambiar el estado.');
        this.cerrarConfirmEstado();
      },
    });
  }

  cerrarConfirmEstado() { this.confirmEstado.set(false); this.usuarioObjetivo.set(null); }

  pedirReset(u: UsuarioNegocio) {
    this.usuarioObjetivo.set(u);
    this.confirmReset.set(true);
  }

  resetConfirmado() {
    const u = this.usuarioObjetivo();
    if (!u) return;
    this.api.resetPasswordUsuario(u.id_usuario, this.idNegocio()).subscribe({
      next: r => {
        this.confirmReset.set(false);
        if (r?.success && r.data) {
          this.credenciales.set({ email: u.email, password: r.data.password_temporal });
          this.modalUsuario.set(true);
          this.usuarioEditando.set(null);
          this.toast.success('Contraseña restablecida');
          this.cargar();
        } else this.toast.error(r?.message || 'No se pudo restablecer.');
        this.usuarioObjetivo.set(null);
      },
      error: e => {
        this.confirmReset.set(false);
        this.usuarioObjetivo.set(null);
        this.toast.error(e?.error?.message || 'Error al restablecer la contraseña.');
      },
    });
  }

  esUsuarioActual(u: UsuarioNegocio): boolean {
    return u.id_usuario === this.idUsuarioActual();
  }

  // ── Permisos por rol ──

  elegirRol(idRol: number) {
    this.rolSeleccionado.set(idRol);
    this.cargandoPermisos.set(true);
    this.permisosSucios.set(false);
    this.api.getPermisosRol(idRol, this.idNegocio()).subscribe({
      next: r => {
        this.permisos.set(r?.data ?? null);
        this.cargandoPermisos.set(false);
      },
      error: e => {
        this.toast.error(e?.error?.message || 'No se pudieron cargar los permisos.');
        this.cargandoPermisos.set(false);
      },
    });
  }

  /**
   * Alterna una vista. Al quitarla se apagan también sus acciones.
   *
   * Dejar acciones marcadas dentro de una vista que el rol no ve sería un permiso invisible:
   * la pantalla diría que puede cancelar citas y la vista de Citas no se le abriría siquiera.
   */
  alternarPermiso(idNivel: number) {
    this.permisos.update(p => {
      if (!p) return p;
      return {
        ...p,
        modulos: p.modulos.map(m => {
          if (m.id_nivel !== idNivel) return m;
          const visible = !m.puede_ver;
          return {
            ...m,
            puede_ver: visible,
            acciones: visible ? m.acciones : m.acciones.map(a => ({ ...a, puede_ver: false })),
          };
        }),
      };
    });
    this.permisosSucios.set(true);
  }

  /**
   * Alterna una acción dentro de una vista.
   *
   * La plantilla del rol **no** limita: el ajuste por negocio puede añadir, igual que hace la
   * plataforma con las vistas. Lo único que la bloquea es que su vista esté oculta.
   */
  alternarAccion(idNivelVista: number, idNivelAccion: number) {
    this.permisos.update(p => {
      if (!p) return p;
      return {
        ...p,
        modulos: p.modulos.map(m => {
          if (m.id_nivel !== idNivelVista || !m.puede_ver) return m;
          return {
            ...m,
            acciones: m.acciones.map(a =>
              a.id_nivel === idNivelAccion ? { ...a, puede_ver: !a.puede_ver } : a,
            ),
          };
        }),
      };
    });
    this.permisosSucios.set(true);
  }

  /** Cuántas acciones concedidas sobre las disponibles, para el resumen de la cabecera. */
  readonly accionesConcedidas = computed(() => {
    const modulos = this.permisos()?.modulos ?? [];
    let dadas = 0, posibles = 0;
    for (const m of modulos) {
      for (const a of m.acciones) {
        posibles++;
        if (a.puede_ver && m.puede_ver) dadas++;
      }
    }
    return { dadas, posibles };
  });

  readonly vistasConcedidas = computed(() =>
    (this.permisos()?.modulos ?? []).filter(m => m.puede_ver).length,
  );

  readonly puedeGuardarPermisos = computed(() =>
    this.permisosSucios() && !this.guardando() && this.vistasConcedidas() > 0,
  );

  guardarPermisos() {
    const p = this.permisos();
    const idRol = this.rolSeleccionado();
    if (!p || idRol == null || !this.puedeGuardarPermisos()) return;

    this.guardando.set(true);
    this.api.savePermisosRol(idRol, this.idNegocio(),
      p.modulos.map(m => ({
        id_nivel: m.id_nivel,
        puede_ver: m.puede_ver,
        acciones: m.acciones.map(a => ({ id_nivel: a.id_nivel, puede_ver: a.puede_ver })),
      })),
    ).subscribe({
      next: r => {
        this.guardando.set(false);
        if (r?.success) {
          this.toast.success('Permisos guardados');
          this.permisos.set(r.data ?? p);
          this.permisosSucios.set(false);
        } else this.toast.error(r?.message || 'No se pudieron guardar.');
      },
      error: e => {
        this.guardando.set(false);
        this.toast.error(e?.error?.message || 'Error al guardar los permisos.');
      },
    });
  }

  nombreRol(idRol: number | null): string {
    return this.roles().find(r => r.id_rol === idRol)?.descripcion ?? '';
  }

  /** Iniciales para el avatar de la lista. */
  iniciales(u: UsuarioNegocio): string {
    return ((u.primer_nombre?.[0] ?? '') + (u.primer_apellido?.[0] ?? '')).toUpperCase() || '?';
  }

  copiar(texto: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(texto)
      .then(() => this.toast.success('Copiado'))
      .catch(() => this.toast.error('No se pudo copiar.'));
  }
}
