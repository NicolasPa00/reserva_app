import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ApiResponse, Servicio, Profesional, Horario, Bloqueo, Cita,
  ConfigReserva, DisponibilidadResponse, DiaDisponible, Informe, InfoNegocioPublico,
  ResumenDashboard, MetodoPago, PagoLinea, EstadoCaja, CajaHistorial, MovimientoCaja,
  UsuarioNegocio, RolReserva, PermisosRol, UsuarioPayload,
} from '../models';

/**
 * Wrapper único para todos los endpoints de /reserva.
 * Cada método devuelve Observable<ApiResponse<T>>.
 */
@Injectable({ providedIn: 'root' })
export class ReservaApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

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
  disponibilidad(opts: {
    idNegocio: number; idProfesional: number; idServicios: number[]; fecha: string;
  }) {
    const p = new HttpParams()
      .set('id_negocio', String(opts.idNegocio))
      .set('id_profesional', String(opts.idProfesional))
      .set('id_servicios', opts.idServicios.join(','))
      .set('fecha', opts.fecha);
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

  publicoDisponibilidad(opts: { idNegocio: number; idServicio: number; idProfesional: number; fecha: string }) {
    const p = new HttpParams()
      .set('fecha', opts.fecha)
      .set('id_servicio', String(opts.idServicio))
      .set('id_profesional', String(opts.idProfesional));
    return this.http.get<ApiResponse<DisponibilidadResponse>>(
      `${this.base}/publico/${opts.idNegocio}/disponibilidad`, { params: p },
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
      return this.http.post<ApiResponse<Cita>>(`${this.base}/publico/${idNegocio}/cita`, fd);
    }
    const { comprobante: _omit, ...body } = payload;
    return this.http.post<ApiResponse<Cita>>(`${this.base}/publico/${idNegocio}/cita`, body);
  }

  publicoConsultarCita(codigoPublico: string) {
    return this.http.get<ApiResponse<Cita>>(`${this.base}/publico/cita/${codigoPublico}`);
  }

  publicoCancelarCita(codigoPublico: string, motivo?: string) {
    return this.http.post<ApiResponse<{ id_cita: number; estado: string }>>(
      `${this.base}/publico/cita/${codigoPublico}/cancelar`, { motivo },
    );
  }
}
