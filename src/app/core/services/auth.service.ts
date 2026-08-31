import { Injectable, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse, NegocioReserva, PermisoSubnivel, SesionReserva } from '../models';

const TOKEN_KEY   = 'reserva_token';
const SESSION_KEY = 'reserva_session';
const NEGOCIO_KEY = 'reserva_negocio_activo';

// Orden en que se busca una ruta de respaldo cuando la pedida no está permitida. Debe contener
// **todas** las rutas de módulo: una que falte aquí nunca podrá ser el destino de un usuario
// cuyo rol solo tenga acceso a ella.
const APP_ROUTE_PRIORITY = [
  '/dashboard', '/agenda', '/citas',
  '/servicios', '/profesionales', '/horarios', '/caja', '/informes', '/usuarios', '/configuracion',
];

/**
 * `/citas/no-show` → `citas_no_show`. Mismo criterio que el backend.
 *
 * El guion se normaliza igual que la barra: si no, `citas_no-show` nunca casaría con el
 * `citas_no_show` que consultan las vistas y la acción se vería siempre denegada.
 */
function normalizeCodigoAccion(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[/-]/g, '_');
}

function normalizeRoute(rawPath: string): string {
  if (!rawPath) return '/';
  const noQuery = rawPath.split('?')[0]?.split('#')[0]?.trim() ?? '';
  if (!noQuery) return '/';
  const withSlash = noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
  return withSlash.replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);

  readonly session = signal<SesionReserva | null>(null);
  private readonly _negocioIdx = signal<number>(0);

  readonly isAuthenticated = computed(() => this.session() !== null);

  /**
   * ¿El negocio **activo** tiene plan vigente?
   *
   * Se lee del negocio seleccionado, no de la bandera suelta de la raíz de la sesión: con un
   * usuario multi-negocio esa bandera se quedaba con el plan del primero y no cambiaba al
   * alternar de inquilino. La raíz queda como respaldo para sesiones viejas guardadas en
   * `localStorage` antes de que el backend enviara el dato por negocio.
   */
  readonly planActivo = computed(() =>
    this.negocio()?.plan_activo ?? this.session()?.plan_activo ?? false,
  );
  readonly usuario   = computed(() => this.session()?.usuario ?? null);
  readonly negocios  = computed(() => this.session()?.negocios ?? []);
  readonly negocio   = computed<NegocioReserva | null>(() => {
    const s = this.session();
    if (!s?.negocios?.length) return null;
    return s.negocios[this._negocioIdx()] ?? s.negocios[0];
  });
  readonly rolPrincipal = computed(() => {
    const s = this.session();
    if (!s) return '';
    if (s.roles_globales?.length > 0) return s.roles_globales[0].descripcion;
    if (s.roles?.length > 0) return s.roles[0].descripcion;
    return 'Usuario';
  });
  readonly permisosVistaActivos = computed(() => this.negocio()?.permisos_vista ?? []);

  readonly permisosSubnivelActivos = computed<PermisoSubnivel[]>(() => {
    const delNegocio = this.negocio()?.permisos_subnivel;
    if (delNegocio?.length) return delNegocio;
    return this.session()?.permisos_subnivel ?? [];
  });

  /**
   * ¿Tiene el usuario concedida una acción concreta? (`'citas_cancelar'`, `'caja_cerrar'`…)
   *
   * Las vistas la usan para esconder o deshabilitar el control. **No es la seguridad**: el
   * backend vuelve a comprobarlo en las rutas que mueven dinero o cierran algo, porque ocultar
   * un botón no impide llamar a la API. Aquí solo se evita ofrecer lo que se va a rechazar.
   *
   * Con `permisos_cargados !== true` devuelve `true`: una sesión antigua guardada en
   * `localStorage`, de antes de que existieran estos permisos, no debe dejar la app sin botones
   * hasta que el usuario vuelva a entrar.
   */
  puedeAccion(codigo: string): boolean {
    const session = this.session();
    if (!session) return false;
    if (session.permisos_cargados !== true) return true;

    const buscado = normalizeCodigoAccion(codigo);
    if (!buscado) return false;
    return this.permisosSubnivelActivos()
      .some(p => p.puede_ver && normalizeCodigoAccion(p.codigo) === buscado);
  }

  constructor() {
    if (isPlatformBrowser(this.platformId)) this.restoreSession();
  }

  setNegocioActivo(idNegocio: number): void {
    const idx = this.negocios().findIndex(n => n.id_negocio === idNegocio);
    if (idx >= 0) {
      this._negocioIdx.set(idx);
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem(NEGOCIO_KEY, String(idNegocio));
      }
    }
  }

  /**
   * Parchea el negocio activo dentro de la sesión y lo persiste.
   *
   * Lo usa Configuración al cambiar el logo o los colores: sin esto el cambio se vería solo
   * hasta recargar, porque `authGuard` vuelve a aplicar el tema desde la sesión guardada en
   * `localStorage`, que seguiría teniendo los valores anteriores.
   */
  actualizarNegocioActivo(parche: Partial<NegocioReserva>): void {
    const actual = this.negocio();
    if (!actual) return;

    this.session.update(s => {
      if (!s) return s;
      const negocios = s.negocios.map(n =>
        n.id_negocio === actual.id_negocio ? { ...n, ...parche } : n,
      );
      const siguiente: SesionReserva = {
        ...s,
        negocios,
        negocio: s.negocio?.id_negocio === actual.id_negocio
          ? { ...s.negocio, ...parche }
          : s.negocio,
      };
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(siguiente));
      }
      return siguiente;
    });
  }

  getAccessToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  async validateAndSetToken(token: string): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<SesionReserva>>(
          `${environment.apiUrl}/auth/verificar-token`, { token },
        ),
      );
      if (res?.success && res.data) {
        this.setSession(token, res.data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async canjearCodigo(code: string): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<SesionReserva & { token: string }>>(
          `${environment.apiUrl}/auth/canjear-codigo`, { code },
        ),
      );
      if (res?.success && res.data?.token) {
        const { token, ...sessionData } = res.data;
        const sesion = sessionData as SesionReserva;
        this.setSession(token, sesion);

        // El código de un solo uso lleva dentro el negocio que el usuario pulsó en la consola
        // de administración, y el backend lo devuelve resuelto en `negocio`. Sin esta línea se
        // ignoraba: la sesión se quedaba con `negocios[0]`, así que entrar a «Barbería Don
        // Nico» abría el primero de la lista —«Salón Demo EscalApp»— y con él su plan, sus
        // permisos y sus datos. Elegir un negocio y trabajar sobre otro es de las peores cosas
        // que puede hacer una app multi-inquilino.
        const elegido = sesion.negocio?.id_negocio;
        if (elegido != null) this.setNegocioActivo(elegido);

        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.clearSession();
    if (isPlatformBrowser(this.platformId)) {
      window.location.href = `${environment.adminUrl}/auth/login`;
    }
  }

  canAccessRoute(routePath: string): boolean {
    const session = this.session();
    if (!session) return false;
    if (session.permisos_cargados !== true) return true;

    const allowed = new Set(
      this.permisosVistaActivos().filter(p => p.puede_ver).map(p => normalizeRoute(p.url)),
    );
    if (allowed.size === 0) return false;
    const target = normalizeRoute(routePath);

    for (const a of allowed) {
      if (a === target) return true;
      if (a.startsWith(`${target}/`)) return true;
      if (target.startsWith(`${a}/`)) return true;
    }
    return false;
  }

  getFirstAccessibleRoute(): string | null {
    for (const r of APP_ROUTE_PRIORITY) if (this.canAccessRoute(r)) return r;
    return null;
  }

  // ── Internos ──
  private restoreSession(): void {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw   = localStorage.getItem(SESSION_KEY);
    if (!token || !raw) return;
    try {
      const parsed = JSON.parse(raw) as SesionReserva;
      if (!parsed?.usuario) { this.clearSession(); return; }
      this.session.set(parsed);
      const saved = localStorage.getItem(NEGOCIO_KEY);
      if (saved && parsed.negocios) {
        const idx = parsed.negocios.findIndex(n => n.id_negocio === Number(saved));
        if (idx >= 0) this._negocioIdx.set(idx);
      }
    } catch {
      this.clearSession();
    }
  }

  /**
   * Manda el negocio que eligió el backend, no el que quedó guardado de la vez anterior.
   *
   * `data.negocio` viene de canjear el código SSO: el admin dice a qué negocio se entra y el
   * backend lo resuelve. Preferir aquí el `localStorage` invertía esa decisión — se pulsaba
   * «Barbería Don Nico» y se aterrizaba en el negocio de la visita pasada. El valor guardado
   * sigue sirviendo, pero solo como respaldo para cuando no hay elección explícita (recargar la
   * app directamente, sin pasar por el admin).
   */
  private setSession(token: string, data: SesionReserva): void {
    this.session.set(data);

    const elegido = data.negocio?.id_negocio ?? null;
    const idxElegido = elegido !== null
      ? (data.negocios?.findIndex(n => n.id_negocio === elegido) ?? -1)
      : -1;

    if (idxElegido >= 0) this._negocioIdx.set(idxElegido);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));

      if (idxElegido >= 0) {
        localStorage.setItem(NEGOCIO_KEY, String(elegido));
      } else {
        const saved = localStorage.getItem(NEGOCIO_KEY);
        const idx = saved
          ? (data.negocios?.findIndex(n => n.id_negocio === Number(saved)) ?? -1)
          : -1;
        if (idx >= 0) this._negocioIdx.set(idx);
      }
    }
  }

  private clearSession(): void {
    this.session.set(null);
    this._negocioIdx.set(0);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(NEGOCIO_KEY);
    }
  }
}
