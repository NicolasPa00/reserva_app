import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import {
  ApiResponse, DisponibilidadEstancia, Estancia, EstanciaPublica, EstadoEstancia, InformeEstancias,
  OcupacionTablero, PagoLinea, ResumenEstanciasDia, TarifaTemporada, UnidadTipo,
} from '../models';

/**
 * Estancias por noches (alojamiento, hotel y guardería de mascotas) y sus unidades.
 * Ver `admin_ws/app_reserva_api/services/estancia/`.
 */
@Injectable({ providedIn: 'root' })
export class EstanciaApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private neg(idNegocio: number) {
    return new HttpParams().set('id_negocio', String(idNegocio));
  }

  // ── Estancias ──
  disponibilidad(idNegocio: number, entrada: string, salida: string, huespedes = 1) {
    const p = this.neg(idNegocio).set('entrada', entrada).set('salida', salida).set('huespedes', String(huespedes));
    return this.http.get<ApiResponse<DisponibilidadEstancia[]>>(`${this.base}/estancias/disponibilidad`, { params: p });
  }
  ocupacion(idNegocio: number, desde: string, hasta: string) {
    const p = this.neg(idNegocio).set('desde', desde).set('hasta', hasta);
    return this.http.get<ApiResponse<OcupacionTablero>>(`${this.base}/estancias/ocupacion`, { params: p });
  }
  resumenDia(idNegocio: number) {
    return this.http.get<ApiResponse<ResumenEstanciasDia>>(`${this.base}/estancias/resumen-dia`, { params: this.neg(idNegocio) });
  }
  informe(idNegocio: number, desde: string, hasta: string) {
    const p = this.neg(idNegocio).set('desde', desde).set('hasta', hasta);
    return this.http.get<ApiResponse<InformeEstancias>>(`${this.base}/estancias/informe`, { params: p });
  }
  listar(idNegocio: number, filtro: { desde?: string; hasta?: string; estado?: EstadoEstancia | ''; q?: string } = {}) {
    let p = this.neg(idNegocio);
    for (const [k, v] of Object.entries(filtro)) if (v) p = p.set(k, String(v));
    return this.http.get<ApiResponse<Estancia[]>>(`${this.base}/estancias`, { params: p });
  }
  get(id: number, idNegocio: number) {
    return this.http.get<ApiResponse<Estancia>>(`${this.base}/estancias/${id}`, { params: this.neg(idNegocio) });
  }
  crear(idNegocio: number, datos: {
    id_unidad_tipo: number; id_unidad?: number | null; fecha_entrada: string; fecha_salida: string;
    huespedes: number; cliente_nombre: string; cliente_telefono?: string | null; cliente_email?: string | null;
    cliente_documento?: string | null; notas?: string | null; id_mascota?: string | null;
  }) {
    return this.http.post<ApiResponse<Estancia>>(`${this.base}/estancias`, { ...datos, id_negocio: idNegocio });
  }
  actualizar(id: number, idNegocio: number, datos: {
    fecha_entrada?: string; fecha_salida?: string; huespedes?: number; id_unidad?: number; notas?: string | null;
  }) {
    return this.http.put<ApiResponse<Estancia>>(`${this.base}/estancias/${id}`, { ...datos, id_negocio: idNegocio });
  }
  private accion(id: number, idNegocio: number, accion: string, cuerpo: Record<string, unknown> = {}) {
    return this.http.post<ApiResponse<Estancia>>(`${this.base}/estancias/${id}/${accion}`, { ...cuerpo, id_negocio: idNegocio });
  }
  confirmar(id: number, idNegocio: number) { return this.accion(id, idNegocio, 'confirmar'); }
  checkin(id: number, idNegocio: number) { return this.accion(id, idNegocio, 'checkin'); }
  noShow(id: number, idNegocio: number) { return this.accion(id, idNegocio, 'no-show'); }
  cancelar(id: number, idNegocio: number, motivo?: string) { return this.accion(id, idNegocio, 'cancelar', { motivo }); }
  checkout(id: number, idNegocio: number, pago: { idMetodoPago?: number | null; pagos?: PagoLinea[] }) {
    return this.accion(id, idNegocio, 'checkout', pago.pagos?.length ? { pagos: pago.pagos } : { id_metodo_pago: pago.idMetodoPago });
  }
  registrarPago(id: number, idNegocio: number, idMetodoPago: number, valor: number) {
    return this.accion(id, idNegocio, 'pagos', { id_metodo_pago: idMetodoPago, valor });
  }
  agregarCargo(id: number, idNegocio: number, concepto: string, valor: number) {
    return this.accion(id, idNegocio, 'cargos', { concepto, valor });
  }
  eliminarCargo(id: number, idCargo: number, idNegocio: number) {
    return this.http.delete<ApiResponse<Estancia>>(`${this.base}/estancias/${id}/cargos/${idCargo}`, { params: this.neg(idNegocio) });
  }
  aprobarPago(id: number, idNegocio: number, idMetodoPago: number | null) {
    return this.accion(id, idNegocio, 'pago/aprobar', { id_metodo_pago: idMetodoPago });
  }
  rechazarPago(id: number, idNegocio: number, motivo?: string) {
    return this.accion(id, idNegocio, 'pago/rechazar', { motivo });
  }
  devolver(id: number, idNegocio: number, valor: number, idMetodoPago?: number | null) {
    return this.accion(id, idNegocio, 'devolver', { valor, id_metodo_pago: idMetodoPago ?? null });
  }
  urlComprobante(id: number, idNegocio: number) {
    return `${this.base}/estancias/${id}/comprobante?id_negocio=${idNegocio}`;
  }

  // ── Unidades ──
  listarUnidades(idNegocio: number) {
    return this.http.get<ApiResponse<UnidadTipo[]>>(`${this.base}/unidades`, { params: this.neg(idNegocio) });
  }
  crearTipo(idNegocio: number, datos: Omit<Partial<UnidadTipo>, 'unidades' | 'temporadas'> & { cantidad?: number; unidades?: string[] }) {
    return this.http.post<ApiResponse<UnidadTipo>>(`${this.base}/unidades/tipos`, { ...datos, id_negocio: idNegocio });
  }
  actualizarTipo(id: number, idNegocio: number, datos: Partial<UnidadTipo>) {
    return this.http.put<ApiResponse<UnidadTipo>>(`${this.base}/unidades/tipos/${id}`, { ...datos, id_negocio: idNegocio });
  }
  inactivarTipo(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/unidades/tipos/${id}`, { params: this.neg(idNegocio) });
  }
  subirImagenTipo(id: number, idNegocio: number, blob: Blob) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    fd.append('imagen', blob, 'unidad.webp');
    return this.http.post<ApiResponse<UnidadTipo>>(`${this.base}/unidades/tipos/${id}/imagen`, fd);
  }
  eliminarImagenTipo(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<UnidadTipo>>(`${this.base}/unidades/tipos/${id}/imagen`, { params: this.neg(idNegocio) });
  }
  guardarTemporada(idTipo: number, idNegocio: number, t: TarifaTemporada) {
    const cuerpo = { ...t, id_negocio: idNegocio };
    return t.id_tarifa
      ? this.http.put<ApiResponse<TarifaTemporada>>(`${this.base}/unidades/tipos/${idTipo}/temporadas/${t.id_tarifa}`, cuerpo)
      : this.http.post<ApiResponse<TarifaTemporada>>(`${this.base}/unidades/tipos/${idTipo}/temporadas`, cuerpo);
  }
  eliminarTemporada(idTarifa: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/unidades/temporadas/${idTarifa}`, { params: this.neg(idNegocio) });
  }
  crearUnidad(idTipo: number, idNegocio: number, nombre: string) {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/unidades/tipos/${idTipo}/unidades`, { id_negocio: idNegocio, nombre });
  }
  actualizarUnidad(id: number, idNegocio: number, datos: { nombre?: string; notas?: string | null }) {
    return this.http.put<ApiResponse<unknown>>(`${this.base}/unidades/${id}`, { ...datos, id_negocio: idNegocio });
  }
  inactivarUnidad(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/unidades/${id}`, { params: this.neg(idNegocio) });
  }
  regenerarTokenIcal(id: number, idNegocio: number) {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/unidades/${id}/ical-token`, { id_negocio: idNegocio });
  }
  crearBloqueo(idUnidad: number, idNegocio: number, desde: string, hasta: string, motivo?: string | null) {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/unidades/${idUnidad}/bloqueos`, {
      id_negocio: idNegocio, fecha_desde: desde, fecha_hasta: hasta, motivo,
    });
  }
  eliminarBloqueo(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/unidades/bloqueos/${id}`, { params: this.neg(idNegocio) });
  }
  conectarCalendario(idUnidad: number, idNegocio: number, nombre: string, url: string) {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/unidades/${idUnidad}/calendarios`, {
      id_negocio: idNegocio, nombre, url_ical: url,
    });
  }
  desconectarCalendario(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/unidades/calendarios/${id}`, { params: this.neg(idNegocio) });
  }
  sincronizar(idNegocio: number, idUnidad?: number) {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/unidades/sincronizar`, { id_negocio: idNegocio, id_unidad: idUnidad });
  }
  /** URL pública del calendario de una unidad, para pegar en Airbnb/Booking. */
  urlIcal(token: string) {
    return `${this.base}/publico/ical/${token}.ics`;
  }

  // ── Portal ──
  publicoDisponibilidad(idNegocio: number, entrada: string, salida: string, huespedes: number) {
    const p = new HttpParams().set('entrada', entrada).set('salida', salida).set('huespedes', String(huespedes));
    return this.http.get<ApiResponse<DisponibilidadEstancia[]>>(
      `${this.base}/publico/${idNegocio}/estancias/disponibilidad`, { params: p });
  }
  publicoReservar(idNegocio: number, datos: {
    id_unidad_tipo: number; fecha_entrada: string; fecha_salida: string; huespedes: number;
    cliente_nombre: string; cliente_telefono: string; cliente_email?: string; cliente_documento?: string;
    notas?: string; mascota?: { nombre: string; especie?: string; raza?: string; tamano?: string } | null;
    comprobante?: File | null;
  }) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(datos)) {
      if (v == null || v === '' || k === 'comprobante' || k === 'mascota') continue;
      fd.append(k, String(v));
    }
    if (datos.mascota) fd.append('mascota', JSON.stringify(datos.mascota));
    if (datos.comprobante) fd.append('comprobante', datos.comprobante);
    return this.http.post<ApiResponse<EstanciaPublica>>(`${this.base}/publico/${idNegocio}/estancia`, fd);
  }
}
