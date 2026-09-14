import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ApiResponse, Servicio, Profesional, Horario, Bloqueo, Cita,
  ClienteNegocio, ClienteCita, ClientesPagina,
  ConfigReserva, DisponibilidadResponse, DiaDisponible, Informe, InfoNegocioPublico,
  ResumenDashboard, MetodoPago, PagoLinea, EstadoCaja, CajaHistorial, MovimientoCaja,
  UsuarioNegocio, RolReserva, PermisosRol, UsuarioPayload, MarcaNegocio, ColoresNegocio,
  Vitrina, VitrinaEdicion, CitaPublica, CategoriaReserva, DiaServicio, SlotsServicio,
  PaisDisponible,
} from '../models';

/**
 * Wrapper único para todos los endpoints de /reserva.
 * Cada método devuelve Observable<ApiResponse<T>>.
 */
@Injectable({ providedIn: 'root' })
export class ReservaApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /**
   * Origen del que cuelgan los archivos estáticos servidos en `/uploads`.
   *
   * El backend devuelve rutas relativas a su propia raíz, pero la app vive en otro origen, así
   * que hay que anteponerlo. Se deriva de `apiUrl` quitándole el sufijo del vertical, en vez de
   * añadir otra variable de entorno que habría que acordarse de cambiar en cada despliegue.
   */
  readonly origenArchivos = environment.apiUrl.replace(/\/reserva\/?$/, '');

  // ── Dashboard ──
  getResumen(idNegocio: number): Observable<ApiResponse<ResumenDashboard>> {
    return this.http.get<ApiResponse<ResumenDashboard>>(
      `${this.base}/dashboard/resumen?id_negocio=${idNegocio}`,
    );
  }

  getPerfil(): Observable<ApiResponse<unknown>> {
    return this.http.get<ApiResponse<unknown>>(`${this.base}/perfil`);
  }

  // ── Servicios ──
  listarServicios(idNegocio: number, opts?: { incluirInactivos?: boolean }) {
    let p = new HttpParams().set('id_negocio', String(idNegocio));
    if (opts?.incluirInactivos) p = p.set('incluir_inactivos', 'true');
    return this.http.get<ApiResponse<Servicio[]>>(`${this.base}/servicios`, { params: p });
  }

  crearServicio(data: Partial<Servicio>): Observable<ApiResponse<Servicio>> {
    return this.http.post<ApiResponse<Servicio>>(`${this.base}/servicios`, data);
  }

  actualizarServicio(id: number, data: Partial<Servicio>): Observable<ApiResponse<Servicio>> {
    return this.http.put<ApiResponse<Servicio>>(`${this.base}/servicios/${id}`, data);
  }

  inactivarServicio(id: number, idNegocio: number): Observable<ApiResponse<Servicio>> {
    return this.http.patch<ApiResponse<Servicio>>(
      `${this.base}/servicios/${id}/inactivar?id_negocio=${idNegocio}`, {},
    );
  }

  // ── Profesionales ──
  listarProfesionales(idNegocio: number, opts?: { idServicio?: number; incluirInactivos?: boolean }) {
    let p = new HttpParams().set('id_negocio', String(idNegocio));
    if (opts?.idServicio) p = p.set('id_servicio', String(opts.idServicio));
    if (opts?.incluirInactivos) p = p.set('incluir_inactivos', 'true');
    return this.http.get<ApiResponse<Profesional[]>>(`${this.base}/profesionales`, { params: p });
  }

  getProfesional(id: number, idNegocio: number) {
    return this.http.get<ApiResponse<Profesional>>(
      `${this.base}/profesionales/${id}?id_negocio=${idNegocio}`,
    );
  }

  crearProfesional(data: Partial<Profesional>): Observable<ApiResponse<Profesional>> {
    return this.http.post<ApiResponse<Profesional>>(`${this.base}/profesionales`, data);
  }

  actualizarProfesional(id: number, data: Partial<Profesional>): Observable<ApiResponse<Profesional>> {
    return this.http.put<ApiResponse<Profesional>>(`${this.base}/profesionales/${id}`, data);
  }

  inactivarProfesional(id: number, idNegocio: number): Observable<ApiResponse<Profesional>> {
    return this.http.patch<ApiResponse<Profesional>>(
      `${this.base}/profesionales/${id}/inactivar?id_negocio=${idNegocio}`, {},
    );
  }

  setServiciosProfesional(id: number, idNegocio: number, idServicios: number[]) {
    return this.http.put<ApiResponse<Profesional>>(
      `${this.base}/profesionales/${id}/servicios`,
      { id_negocio: idNegocio, id_servicios: idServicios },
    );
  }

  // ── Horarios ──
  listarHorarios(idNegocio: number, idProfesional?: number | null) {
    let p = new HttpParams().set('id_negocio', String(idNegocio));
    if (idProfesional != null) p = p.set('id_profesional', String(idProfesional));
    return this.http.get<ApiResponse<Horario[]>>(`${this.base}/horarios`, { params: p });
  }

  reemplazarHorarios(payload: {
    id_negocio: number; id_profesional?: number | null;
    bloques: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  }) {
    return this.http.put<ApiResponse<Horario[]>>(`${this.base}/horarios`, payload);
  }

  // ── Disponibilidad (vista negocio, con token) ──

  /**
   * Slots reservables. `idServicios` va completo, no solo el primero: el backend calcula la
   * duración sumando todos, que es lo que la cita ocupa de verdad en la agenda.
   */
  /**
   * `excluirCita` deja fuera del cálculo a una cita concreta. Hace falta al EDITAR: la hora
   * que ya ocupa esa cita es suya, y sin excluirla el formulario mostraría como tomado justo
   * el hueco en el que está.
   */
  disponibilidad(opts: {
    idNegocio: number; idProfesional: number; idServicios: number[]; fecha: string;
    excluirCita?: number | null;
  }) {
    let p = new HttpParams()
      .set('id_negocio', String(opts.idNegocio))
      .set('id_profesional', String(opts.idProfesional))
      .set('id_servicios', opts.idServicios.join(','))
      .set('fecha', opts.fecha);
    if (opts.excluirCita) p = p.set('excluir_cita', String(opts.excluirCita));
    return this.http.get<ApiResponse<DisponibilidadResponse>>(
      `${this.base}/disponibilidad`, { params: p },
    );
  }

  /** Qué días del rango atiende el negocio (o un profesional concreto). */
  diasDisponibles(opts: {
    idNegocio: number; idProfesional?: number | null; desde: string; hasta: string;
  }) {
    let p = new HttpParams()
      .set('id_negocio', String(opts.idNegocio))
      .set('desde', opts.desde)
      .set('hasta', opts.hasta);
    if (opts.idProfesional != null) p = p.set('id_profesional', String(opts.idProfesional));
    return this.http.get<ApiResponse<DiaDisponible[]>>(
      `${this.base}/disponibilidad/dias`, { params: p },
    );
  }

  // ── Bloqueos ──
  listarBloqueos(idNegocio: number, opts?: { idProfesional?: number | null; desde?: string; hasta?: string }) {
    let p = new HttpParams().set('id_negocio', String(idNegocio));
    if (opts?.idProfesional != null) p = p.set('id_profesional', String(opts.idProfesional));
    if (opts?.desde) p = p.set('desde', opts.desde);
    if (opts?.hasta) p = p.set('hasta', opts.hasta);
    return this.http.get<ApiResponse<Bloqueo[]>>(`${this.base}/bloqueos`, { params: p });
  }

  crearBloqueo(data: Partial<Bloqueo>): Observable<ApiResponse<Bloqueo>> {
    return this.http.post<ApiResponse<Bloqueo>>(`${this.base}/bloqueos`, data);
  }

  eliminarBloqueo(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<void>>(
      `${this.base}/bloqueos/${id}?id_negocio=${idNegocio}`,
    );
  }

  // ── Citas (vista negocio) ──
  listarCitas(opts: {
    idNegocio: number; desde?: string; hasta?: string;
    idProfesional?: number; estado?: string;
  }) {
    let p = new HttpParams().set('id_negocio', String(opts.idNegocio));
    if (opts.desde) p = p.set('desde', opts.desde);
    if (opts.hasta) p = p.set('hasta', opts.hasta);
    if (opts.idProfesional) p = p.set('id_profesional', String(opts.idProfesional));
    if (opts.estado) p = p.set('estado', opts.estado);
    return this.http.get<ApiResponse<Cita[]>>(`${this.base}/citas`, { params: p });
  }

  listarCitasPendientesPago(idNegocio: number) {
    return this.http.get<ApiResponse<Cita[]>>(
      `${this.base}/citas/pendientes-pago?id_negocio=${idNegocio}`,
    );
  }

  getCita(id: number, idNegocio: number) {
    return this.http.get<ApiResponse<Cita>>(
      `${this.base}/citas/${id}?id_negocio=${idNegocio}`,
    );
  }

  crearCitaManual(data: {
    id_negocio: number; id_profesional: number; id_servicios: number[];
    fecha_hora_inicio: string; cliente_nombre: string;
    cliente_telefono?: string | null; cliente_email?: string | null; notas?: string | null;
  }) {
    return this.http.post<ApiResponse<Cita>>(`${this.base}/citas`, data);
  }

  /**
   * Edita una cita agendada: servicios, profesional y hora.
   *
   * `id_servicios` es la lista COMPLETA que debe quedar, no un delta — quitar uno es
   * mandarla sin el. Profesional y hora son opcionales: omitirlos conserva los actuales.
   */
  actualizarCita(id: number, data: {
    id_negocio: number; id_servicios: number[];
    id_profesional?: number | null; fecha_hora_inicio?: string | null;
  }) {
    return this.http.put<ApiResponse<Cita>>(`${this.base}/citas/${id}`, data);
  }

  confirmarCita(id: number, idNegocio: number) {
    return this.http.post<ApiResponse<Cita>>(
      `${this.base}/citas/${id}/confirmar`, { id_negocio: idNegocio },
    );
  }
  /**
   * Completar una cita **es** cobrarla: el backend asienta el dinero en la caja abierta dentro
   * de la misma transacción. Se manda `id_metodo_pago` (pago simple) o `pagos` (multipago),
   * nunca los dos.
   */
  completarCita(id: number, idNegocio: number, pago?: {
    idMetodoPago?: number | null; pagos?: PagoLinea[];
  }) {
    const body: Record<string, unknown> = { id_negocio: idNegocio };
    if (pago?.pagos?.length) body['pagos'] = pago.pagos;
    else if (pago?.idMetodoPago != null) body['id_metodo_pago'] = pago.idMetodoPago;
    return this.http.post<ApiResponse<Cita>>(`${this.base}/citas/${id}/completar`, body);
  }
  noShowCita(id: number, idNegocio: number) {
    return this.http.post<ApiResponse<Cita>>(
      `${this.base}/citas/${id}/no-show`, { id_negocio: idNegocio },
    );
  }
  cancelarCita(id: number, idNegocio: number, motivo?: string) {
    return this.http.post<ApiResponse<Cita>>(
      `${this.base}/citas/${id}/cancelar`, { id_negocio: idNegocio, motivo },
    );
  }
  /**
   * Borrado definitivo de una cita. No es `cancelarCita`: aquella la deja en el histórico con
   * su motivo, ésta la quita del todo. Exige la acción `agenda_eliminar` y queda auditada.
   */
  eliminarCita(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<{ id_cita: number }>>(
      `${this.base}/citas/${id}?id_negocio=${idNegocio}`,
    );
  }
  aprobarPago(id: number, idNegocio: number) {
    return this.http.post<ApiResponse<Cita>>(
      `${this.base}/citas/${id}/pago/aprobar`, { id_negocio: idNegocio },
    );
  }
  rechazarPago(id: number, idNegocio: number, motivo?: string) {
    return this.http.post<ApiResponse<Cita>>(
      `${this.base}/citas/${id}/pago/rechazar`, { id_negocio: idNegocio, motivo },
    );
  }

  /** URL absoluta del comprobante (incluye token vía interceptor cuando se descarga por XHR). */
  urlComprobante(idCita: number, idNegocio: number): string {
    return `${this.base}/citas/${idCita}/comprobante?id_negocio=${idNegocio}`;
  }

  // ── Identidad visual (logo y colores) ──

  getMarca(idNegocio: number) {
    return this.http.get<ApiResponse<MarcaNegocio>>(`${this.base}/marca?id_negocio=${idNegocio}`);
  }

  guardarColores(idNegocio: number, primario: string, acento: string) {
    return this.http.put<ApiResponse<{ colores: ColoresNegocio }>>(
      `${this.base}/marca/colores`, { id_negocio: idNegocio, primario, acento },
    );
  }

  aplicarPaletaNegocio(idNegocio: number, idPaleta: number) {
    return this.http.put<ApiResponse<{ colores: ColoresNegocio; id_paleta: number; nombre: string }>>(
      `${this.base}/marca/paleta`, { id_negocio: idNegocio, id_paleta: idPaleta },
    );
  }

  restablecerColores(idNegocio: number) {
    return this.http.delete<ApiResponse<{ colores: null }>>(
      `${this.base}/marca/colores?id_negocio=${idNegocio}`,
    );
  }

  /** El blob viene ya recortado y comprimido por `image-cropper`. */
  subirLogo(idNegocio: number, blob: Blob) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    fd.append('imagen', blob, `logo.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`);
    return this.http.post<ApiResponse<{ logo_url: string; bytes: number }>>(
      `${this.base}/marca/logo`, fd,
    );
  }

  eliminarLogo(idNegocio: number) {
    return this.http.delete<ApiResponse<{ logo_url: null }>>(
      `${this.base}/marca/logo?id_negocio=${idNegocio}`,
    );
  }

  subirImagenServicio(idServicio: number, idNegocio: number, blob: Blob) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    fd.append('imagen', blob, `servicio.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`);
    return this.http.post<ApiResponse<{ imagen_url: string; bytes: number }>>(
      `${this.base}/servicios/${idServicio}/imagen`, fd,
    );
  }

  eliminarImagenServicio(idServicio: number, idNegocio: number) {
    return this.http.delete<ApiResponse<{ imagen_url: null }>>(
      `${this.base}/servicios/${idServicio}/imagen?id_negocio=${idNegocio}`,
    );
  }

  /** El banner es 16:5; lo recorta el cropper antes de llegar aquí. */
  subirBanner(idNegocio: number, blob: Blob) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    fd.append('imagen', blob, `banner.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`);
    return this.http.post<ApiResponse<{ banner_url: string; bytes: number }>>(
      `${this.base}/marca/banner`, fd,
    );
  }

  eliminarBanner(idNegocio: number) {
    return this.http.delete<ApiResponse<{ banner_url: null }>>(
      `${this.base}/marca/banner?id_negocio=${idNegocio}`,
    );
  }

  // ── Categorías del catálogo ──

  listarCategorias(idNegocio: number) {
    return this.http.get<ApiResponse<CategoriaReserva[]>>(
      `${this.base}/categorias?id_negocio=${idNegocio}`,
    );
  }

  crearCategoria(idNegocio: number, nombre: string, descripcion?: string) {
    return this.http.post<ApiResponse<CategoriaReserva>>(
      `${this.base}/categorias`, { id_negocio: idNegocio, nombre, descripcion },
    );
  }

  actualizarCategoria(id: number, idNegocio: number, datos: { nombre?: string; descripcion?: string }) {
    return this.http.put<ApiResponse<CategoriaReserva>>(
      `${this.base}/categorias/${id}`, { id_negocio: idNegocio, ...datos },
    );
  }

  eliminarCategoria(id: number, idNegocio: number) {
    return this.http.patch<ApiResponse<CategoriaReserva>>(
      `${this.base}/categorias/${id}/inactivar?id_negocio=${idNegocio}`, {},
    );
  }

  reordenarCategorias(idNegocio: number, idCategorias: number[]) {
    return this.http.put<ApiResponse<CategoriaReserva[]>>(
      `${this.base}/categorias/orden`, { id_negocio: idNegocio, id_categorias: idCategorias },
    );
  }

  subirFotoProfesional(idProfesional: number, idNegocio: number, blob: Blob) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    fd.append('imagen', blob, `profesional.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`);
    return this.http.post<ApiResponse<{ foto_url: string; bytes: number }>>(
      `${this.base}/profesionales/${idProfesional}/foto`, fd,
    );
  }

  eliminarFotoProfesional(idProfesional: number, idNegocio: number) {
    return this.http.delete<ApiResponse<{ foto_url: null }>>(
      `${this.base}/profesionales/${idProfesional}/foto?id_negocio=${idNegocio}`,
    );
  }

  // ── Página pública (edición desde Configuración) ──

  /**
   * Catálogo de países: código, nombre, indicativo telefónico y moneda.
   *
   * Sin `id_negocio`: es catálogo de plataforma, el mismo para todos. Lo consume
   * `PaisesService`, que lo pide una vez por sesión.
   */
  listarPaises() {
    return this.http.get<ApiResponse<PaisDisponible[]>>(`${this.base}/paises`);
  }

  getVitrinaEdicion(idNegocio: number) {
    return this.http.get<ApiResponse<VitrinaEdicion>>(`${this.base}/vitrina?id_negocio=${idNegocio}`);
  }

  guardarVitrina(datos: Partial<VitrinaEdicion> & { id_negocio: number }) {
    return this.http.put<ApiResponse<VitrinaEdicion>>(`${this.base}/vitrina`, datos);
  }

  // ── Usuarios y permisos del negocio ──
  //
  // Endpoints propios del vertical, no los de `/admin`. Allí `id_negocio` es un parámetro libre
  // y el listado no acota por los negocios del llamante; aquí el backend lo verifica en cada
  // operación contra la base de datos.

  listarUsuarios(idNegocio: number, opts?: { search?: string; incluirInactivos?: boolean }) {
    let p = new HttpParams().set('id_negocio', String(idNegocio));
    if (opts?.search) p = p.set('search', opts.search);
    if (opts?.incluirInactivos) p = p.set('incluir_inactivos', 'true');
    return this.http.get<ApiResponse<UsuarioNegocio[]>>(`${this.base}/usuarios`, { params: p });
  }

  listarRolesReserva(idNegocio: number) {
    return this.http.get<ApiResponse<RolReserva[]>>(
      `${this.base}/usuarios/roles?id_negocio=${idNegocio}`,
    );
  }

  /** Profesionales sin usuario: los candidatos a los que darles acceso al sistema. */
  profesionalesSinUsuario(idNegocio: number) {
    return this.http.get<ApiResponse<{ id_profesional: number; nombre: string; especialidad: string | null }[]>>(
      `${this.base}/usuarios/profesionales-libres?id_negocio=${idNegocio}`,
    );
  }

  getPermisosRol(idRol: number, idNegocio: number) {
    return this.http.get<ApiResponse<PermisosRol>>(
      `${this.base}/usuarios/roles/${idRol}/permisos?id_negocio=${idNegocio}`,
    );
  }

  savePermisosRol(idRol: number, idNegocio: number, modulos: {
    id_nivel: number; puede_ver: boolean;
    acciones?: { id_nivel: number; puede_ver: boolean }[];
  }[]) {
    return this.http.put<ApiResponse<PermisosRol>>(
      `${this.base}/usuarios/roles/${idRol}/permisos`, { id_negocio: idNegocio, modulos },
    );
  }

  crearUsuario(idNegocio: number, datos: UsuarioPayload) {
    return this.http.post<ApiResponse<{ id_usuario: number; password_temporal: string | null; id_profesional: number | null }>>(
      `${this.base}/usuarios`, { id_negocio: idNegocio, ...datos },
    );
  }

  actualizarUsuario(idUsuario: number, idNegocio: number, datos: Partial<UsuarioPayload>) {
    return this.http.put<ApiResponse<{ id_usuario: number }>>(
      `${this.base}/usuarios/${idUsuario}`, { id_negocio: idNegocio, ...datos },
    );
  }

  cambiarEstadoUsuario(idUsuario: number, idNegocio: number, estado: 'A' | 'I') {
    return this.http.patch<ApiResponse<{ id_usuario: number }>>(
      `${this.base}/usuarios/${idUsuario}/estado`, { id_negocio: idNegocio, estado },
    );
  }

  resetPasswordUsuario(idUsuario: number, idNegocio: number) {
    return this.http.post<ApiResponse<{ id_usuario: number; password_temporal: string }>>(
      `${this.base}/usuarios/${idUsuario}/reset-password`, { id_negocio: idNegocio },
    );
  }

  // ── Formas de pago ──

  listarMetodosPago(idNegocio: number, opts?: { incluirInactivos?: boolean }) {
    let p = new HttpParams().set('id_negocio', String(idNegocio));
    if (opts?.incluirInactivos) p = p.set('incluir_inactivos', 'true');
    return this.http.get<ApiResponse<MetodoPago[]>>(`${this.base}/metodos-pago`, { params: p });
  }

  crearMetodoPago(idNegocio: number, nombre: string, orden?: number) {
    return this.http.post<ApiResponse<MetodoPago>>(
      `${this.base}/metodos-pago`, { id_negocio: idNegocio, nombre, orden },
    );
  }

  actualizarMetodoPago(id: number, idNegocio: number, datos: { nombre?: string; orden?: number }) {
    return this.http.put<ApiResponse<MetodoPago>>(
      `${this.base}/metodos-pago/${id}`, { id_negocio: idNegocio, ...datos },
    );
  }

  /** No hay borrado: se inactiva para no dejar huérfanos los cobros ya hechos. */
  cambiarEstadoMetodoPago(id: number, idNegocio: number, estado: 'A' | 'I') {
    return this.http.patch<ApiResponse<MetodoPago>>(
      `${this.base}/metodos-pago/${id}/estado`, { id_negocio: idNegocio, estado },
    );
  }

  // ── Caja ──

  getCaja(idNegocio: number) {
    return this.http.get<ApiResponse<EstadoCaja>>(
      `${this.base}/caja?id_negocio=${idNegocio}`,
    );
  }

  abrirCaja(idNegocio: number, montoApertura: number, observaciones?: string) {
    return this.http.post<ApiResponse<unknown>>(
      `${this.base}/caja/abrir`,
      { id_negocio: idNegocio, monto_apertura: montoApertura, observaciones },
    );
  }

  cerrarCaja(idCaja: number, idNegocio: number, montoReportado?: number | null, observaciones?: string) {
    return this.http.post<ApiResponse<unknown>>(
      `${this.base}/caja/${idCaja}/cerrar`,
      { id_negocio: idNegocio, monto_reportado: montoReportado, observaciones },
    );
  }

  registrarMovimientoCaja(idNegocio: number, datos: {
    tipo: 'INGRESO' | 'EGRESO'; monto: number; concepto?: string; idMetodoPago?: number | null;
  }) {
    return this.http.post<ApiResponse<MovimientoCaja>>(
      `${this.base}/caja/movimiento`,
      {
        id_negocio: idNegocio, tipo: datos.tipo, monto: datos.monto,
        concepto: datos.concepto, id_metodo_pago: datos.idMetodoPago,
      },
    );
  }

  /**
   * Borra un movimiento del turno **abierto**. Exige la acción `caja_eliminar` y queda
   * auditado; sobre un turno ya cerrado el backend responde `CAJA_CERRADA`.
   */
  eliminarMovimientoCaja(idMovimiento: number, idNegocio: number) {
    return this.http.delete<ApiResponse<{ id_movimiento: number }>>(
      `${this.base}/caja/movimiento/${idMovimiento}?id_negocio=${idNegocio}`,
    );
  }

  getHistorialCaja(idNegocio: number, limite = 30) {
    return this.http.get<ApiResponse<CajaHistorial[]>>(
      `${this.base}/caja/historial?id_negocio=${idNegocio}&limite=${limite}`,
    );
  }

  /** Citas completadas hoy que no entraron en ninguna caja (se cobraron con la caja cerrada). */
  getCitasSinCaja(idNegocio: number) {
    return this.http.get<ApiResponse<{ id_cita: number; cliente_nombre: string; monto_total: number }[]>>(
      `${this.base}/caja/pendientes?id_negocio=${idNegocio}`,
    );
  }

  // ── Informes ──

  /** Todo el informe de un rango en una llamada: totales, series y desgloses. */
  getInforme(opts: {
    idNegocio: number; desde: string; hasta: string; idProfesional?: number | null;
  }) {
    let p = new HttpParams()
      .set('id_negocio', String(opts.idNegocio))
      .set('desde', opts.desde)
      .set('hasta', opts.hasta);
    if (opts.idProfesional != null) p = p.set('id_profesional', String(opts.idProfesional));
    return this.http.get<ApiResponse<Informe>>(`${this.base}/informes`, { params: p });
  }

  // ── Configuración ──
  getConfig(idNegocio: number) {
    return this.http.get<ApiResponse<ConfigReserva>>(
      `${this.base}/config?id_negocio=${idNegocio}`,
    );
  }

  actualizarConfig(data: Partial<ConfigReserva> & { id_negocio: number }) {
    return this.http.put<ApiResponse<ConfigReserva>>(`${this.base}/config`, data);
  }

  // ────────────── Endpoints públicos (sin token) ──────────────

  /**
   * Paquete completo de la portada. Sustituye a encadenar `info` + `servicios` +
   * `profesionales` + un horario por profesional: son 10 peticiones desde el móvil de alguien
   * que solo quiere ver si le cogen mañana.
   */
  publicoVitrina(idNegocio: number) {
    return this.http.get<ApiResponse<Vitrina>>(`${this.base}/publico/${idNegocio}/vitrina`);
  }

  publicoInfoNegocio(idNegocio: number) {
    return this.http.get<ApiResponse<InfoNegocioPublico>>(
      `${this.base}/publico/${idNegocio}/info`,
    );
  }

  publicoListarServicios(idNegocio: number) {
    return this.http.get<ApiResponse<Servicio[]>>(
      `${this.base}/publico/${idNegocio}/servicios`,
    );
  }

  publicoListarProfesionales(idNegocio: number, idServicio?: number) {
    let p = new HttpParams();
    if (idServicio) p = p.set('id_servicio', String(idServicio));
    return this.http.get<ApiResponse<Profesional[]>>(
      `${this.base}/publico/${idNegocio}/profesionales`, { params: p },
    );
  }

  /**
   * Huecos de un día.
   *
   * Acepta un servicio o una lista: la duración de un combo es la **suma** de sus servicios, y
   * pedir la disponibilidad de solo el primero devolvía huecos que luego la creación rechazaba
   * con un 409. Cuando llegan varios se manda `id_servicios`, que es lo que el backend suma.
   */
  publicoDisponibilidad(opts: {
    idNegocio: number; idServicio?: number; idServicios?: number[];
    idProfesional: number; fecha: string;
  }) {
    let p = new HttpParams()
      .set('fecha', opts.fecha)
      .set('id_profesional', String(opts.idProfesional));
    if (opts.idServicios?.length) p = p.set('id_servicios', opts.idServicios.join(','));
    else if (opts.idServicio)     p = p.set('id_servicio', String(opts.idServicio));
    return this.http.get<ApiResponse<DisponibilidadResponse>>(
      `${this.base}/publico/${opts.idNegocio}/disponibilidad`, { params: p },
    );
  }

  /**
   * Días con atención en un rango (máx. 92 días, lo limita el backend).
   *
   * Es lo que apaga los días cerrados en el calendario del asistente. No se deriva del horario
   * semanal en el cliente porque ese no conoce los bloqueos: unas vacaciones cargadas por el
   * negocio dejarían el día pintado como abierto y sin un solo hueco al pulsarlo.
   */
  publicoDiasDisponibles(idNegocio: number, idProfesional: number, desde: string, hasta: string) {
    const p = new HttpParams()
      .set('id_profesional', String(idProfesional))
      .set('desde', desde)
      .set('hasta', hasta);
    return this.http.get<ApiResponse<DiaDisponible[]>>(
      `${this.base}/publico/${idNegocio}/dias`, { params: p },
    );
  }

  /**
   * Días con alguien libre para un servicio, y quién atiende cada día.
   *
   * Lo agrega el backend sobre todos los profesionales que lo ofrecen. Hacerlo aquí serían
   * tantas peticiones como profesionales, con el calendario pintándose a trozos.
   */
  publicoDiasDeServicio(idNegocio: number, idServicio: number, desde: string, hasta: string) {
    const p = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<ApiResponse<DiaServicio[]>>(
      `${this.base}/publico/${idNegocio}/servicio/${idServicio}/dias`, { params: p },
    );
  }

  /** Huecos de un día, ya agrupados por profesional. */
  publicoSlotsDeServicio(idNegocio: number, idServicio: number, fecha: string) {
    const p = new HttpParams().set('fecha', fecha);
    return this.http.get<ApiResponse<SlotsServicio>>(
      `${this.base}/publico/${idNegocio}/servicio/${idServicio}/slots`, { params: p },
    );
  }

  /** Crea cita pública. Si payload contiene `comprobante` (File), envía como multipart. */
  publicoCrearCita(idNegocio: number, payload: {
    id_profesional: number; id_servicios: number[]; fecha_hora_inicio: string;
    cliente_nombre: string; cliente_telefono?: string; cliente_email?: string; notas?: string;
    comprobante?: File | null;
  }) {
    if (payload.comprobante) {
      const fd = new FormData();
      fd.append('id_profesional', String(payload.id_profesional));
      fd.append('id_servicios', JSON.stringify(payload.id_servicios));
      fd.append('fecha_hora_inicio', payload.fecha_hora_inicio);
      fd.append('cliente_nombre', payload.cliente_nombre);
      if (payload.cliente_telefono) fd.append('cliente_telefono', payload.cliente_telefono);
      if (payload.cliente_email)    fd.append('cliente_email', payload.cliente_email);
      if (payload.notas)            fd.append('notas', payload.notas);
      fd.append('comprobante', payload.comprobante);
      return this.http.post<ApiResponse<CitaPublica>>(`${this.base}/publico/${idNegocio}/cita`, fd);
    }
    const { comprobante: _omit, ...body } = payload;
    return this.http.post<ApiResponse<CitaPublica>>(`${this.base}/publico/${idNegocio}/cita`, body);
  }

  // ── Clientes ──
  //
  // La cartera del negocio. El backend exige la vista `/clientes` en todas, así que un rol
  // sin ese permiso recibe 403 aunque llegue a la ruta: esconder el menú no cierra la puerta.

  listarClientes(opts: { idNegocio: number; buscar?: string; limite?: number; offset?: number }) {
    let p = new HttpParams().set('id_negocio', String(opts.idNegocio));
    if (opts.buscar) p = p.set('buscar', opts.buscar);
    if (opts.limite != null) p = p.set('limite', String(opts.limite));
    if (opts.offset != null) p = p.set('offset', String(opts.offset));
    return this.http.get<ApiResponse<ClientesPagina>>(`${this.base}/clientes`, { params: p });
  }

  /** La cartera completa en Excel o PDF, con el mismo filtro de búsqueda que el listado. */
  exportarClientes(opts: { idNegocio: number; formato: 'xlsx' | 'pdf'; buscar?: string }) {
    let p = new HttpParams().set('id_negocio', String(opts.idNegocio)).set('formato', opts.formato);
    if (opts.buscar) p = p.set('buscar', opts.buscar);
    return this.http.get(`${this.base}/clientes/exportar`, {
      params: p,
      responseType: 'blob',
      observe: 'response',
    });
  }

  /**
   * Reconoce a un cliente por su teléfono. `data` llega en `null` cuando no se le conoce —
   * que es la respuesta normal para alguien nuevo, no un error.
   */
  buscarClientePorTelefono(idNegocio: number, telefono: string) {
    const p = new HttpParams().set('id_negocio', String(idNegocio)).set('telefono', telefono);
    return this.http.get<ApiResponse<ClienteNegocio | null>>(`${this.base}/clientes/buscar`, { params: p });
  }

  getCliente(id: string, idNegocio: number) {
    return this.http.get<ApiResponse<ClienteNegocio & { citas: ClienteCita[] }>>(
      `${this.base}/clientes/${id}`,
      { params: new HttpParams().set('id_negocio', String(idNegocio)) },
    );
  }

  /** Nombre y notas. El teléfono es la llave: no se edita. */
  actualizarCliente(id: string, data: { id_negocio: number; nombre?: string; notas?: string | null }) {
    return this.http.put<ApiResponse<ClienteNegocio>>(`${this.base}/clientes/${id}`, data);
  }

  publicoConsultarCita(codigoPublico: string) {
    return this.http.get<ApiResponse<CitaPublica>>(`${this.base}/publico/cita/${codigoPublico}`);
  }

  publicoCancelarCita(codigoPublico: string, motivo?: string) {
    return this.http.post<ApiResponse<{ id_cita: number; estado: string }>>(
      `${this.base}/publico/cita/${codigoPublico}/cancelar`, { motivo },
    );
  }
}
