import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import {
  ApiResponse, CatalogoVistaPrevia, FichaEntrada, Mascota, PerfilReserva, PortafolioImagen,
  Producto, ProductoCategoria, TipoFicha, TipoRecurso, VentaProducto,
} from '../models';

/** Lo que llega al crear/editar un producto. `id_categoria: null` lo deja sin categoría. */
export interface ProductoPayload {
  nombre?: string;
  descripcion?: string | null;
  precio?: number;
  id_categoria?: number | null;
  controla_stock?: boolean;
  stock_actual?: number;
  publico_activo?: boolean;
}

/** Una línea del carrito de venta: solo lo que el servidor necesita, nunca el precio. */
export interface ItemVenta {
  id_producto: number;
  cantidad: number;
}

/** Lo mismo que paga una cita: una forma de pago, o un desglose si el negocio admite multipago. */
export interface PagoVenta {
  id_metodo_pago?: number;
  pagos?: { id_metodo_pago: number; valor: number }[];
}

/**
 * Endpoints de las funciones de los perfiles de rubro: catálogo de arranque, cabinas, mascotas,
 * ficha del cliente y portafolio. Todos responden 403 si el negocio no tiene la función.
 */
@Injectable({ providedIn: 'root' })
export class PerfilApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private neg(idNegocio: number) {
    return new HttpParams().set('id_negocio', String(idNegocio));
  }

  getPerfil(idNegocio: number) {
    return this.http.get<ApiResponse<PerfilReserva>>(`${this.base}/perfil-negocio`, { params: this.neg(idNegocio) });
  }

  // ── Catálogo de arranque ──
  catalogoVistaPrevia(idNegocio: number) {
    return this.http.get<ApiResponse<CatalogoVistaPrevia>>(`${this.base}/catalogo/vista-previa`, { params: this.neg(idNegocio) });
  }
  sembrarServicios(idNegocio: number) {
    return this.http.post<ApiResponse<{ categorias: number; servicios: number }>>(
      `${this.base}/catalogo/servicios`, { id_negocio: idNegocio });
  }
  sembrarUnidades(idNegocio: number) {
    return this.http.post<ApiResponse<{ tipos: number; unidades: number }>>(
      `${this.base}/catalogo/unidades`, { id_negocio: idNegocio });
  }

  // ── Cabinas y equipos ──
  listarRecursos(idNegocio: number) {
    return this.http.get<ApiResponse<TipoRecurso[]>>(`${this.base}/recursos`, { params: this.neg(idNegocio) });
  }
  crearTipoRecurso(idNegocio: number, datos: { nombre: string; descripcion?: string | null; cantidad?: number }) {
    return this.http.post<ApiResponse<TipoRecurso>>(`${this.base}/recursos`, { id_negocio: idNegocio, ...datos });
  }
  actualizarTipoRecurso(id: number, idNegocio: number, datos: { nombre?: string; descripcion?: string | null }) {
    return this.http.put<ApiResponse<TipoRecurso>>(`${this.base}/recursos/${id}`, { id_negocio: idNegocio, ...datos });
  }
  inactivarTipoRecurso(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/recursos/${id}`, { params: this.neg(idNegocio) });
  }
  crearRecurso(idTipo: number, idNegocio: number, nombre: string) {
    return this.http.post<ApiResponse<unknown>>(`${this.base}/recursos/${idTipo}/unidades`, { id_negocio: idNegocio, nombre });
  }
  actualizarRecurso(id: number, idNegocio: number, nombre: string) {
    return this.http.put<ApiResponse<unknown>>(`${this.base}/recursos/unidades/${id}`, { id_negocio: idNegocio, nombre });
  }
  inactivarRecurso(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/recursos/unidades/${id}`, { params: this.neg(idNegocio) });
  }

  // ── Mascotas ──
  listarMascotas(idNegocio: number, opts: { q?: string; pagina?: number; limite?: number } = {}) {
    let p = this.neg(idNegocio);
    if (opts.q) p = p.set('q', opts.q);
    if (opts.pagina) p = p.set('pagina', String(opts.pagina));
    if (opts.limite) p = p.set('limite', String(opts.limite));
    return this.http.get<ApiResponse<{ items: Mascota[]; total: number; pagina: number; limite: number }>>(
      `${this.base}/mascotas`, { params: p });
  }
  mascotasDeCliente(idNegocio: number, idPersona: string) {
    return this.http.get<ApiResponse<Mascota[]>>(`${this.base}/clientes/${idPersona}/mascotas`, { params: this.neg(idNegocio) });
  }
  crearMascota(idNegocio: number, idPersona: string, datos: Partial<Mascota>) {
    return this.http.post<ApiResponse<Mascota>>(`${this.base}/mascotas`, {
      ...datos, id_negocio: idNegocio, id_persona_negocio: idPersona,
    });
  }
  actualizarMascota(id: string, idNegocio: number, datos: Partial<Mascota>) {
    return this.http.put<ApiResponse<Mascota>>(`${this.base}/mascotas/${id}`, { ...datos, id_negocio: idNegocio });
  }
  inactivarMascota(id: string, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/mascotas/${id}`, { params: this.neg(idNegocio) });
  }

  // ── Ficha ──
  listarFicha(idNegocio: number, filtro: { idPersona?: string | null; idMascota?: string | null; idCita?: number | null }) {
    let p = this.neg(idNegocio);
    if (filtro.idPersona) p = p.set('id_persona_negocio', filtro.idPersona);
    if (filtro.idMascota) p = p.set('id_mascota', filtro.idMascota);
    if (filtro.idCita) p = p.set('id_cita', String(filtro.idCita));
    return this.http.get<ApiResponse<FichaEntrada[]>>(`${this.base}/ficha`, { params: p });
  }
  anotarFicha(idNegocio: number, datos: {
    tipo: TipoFicha; id_persona_negocio?: string | null; id_mascota?: string | null; id_cita?: number | null;
    titulo?: string | null; contenido?: string | null; vence_en?: string | null;
  }, archivo?: File | null) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    for (const [k, v] of Object.entries(datos)) if (v != null && v !== '') fd.append(k, String(v));
    if (archivo) fd.append('archivo', archivo);
    return this.http.post<ApiResponse<FichaEntrada>>(`${this.base}/ficha`, fd);
  }
  eliminarFicha(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/ficha/${id}`, { params: this.neg(idNegocio) });
  }
  /** El archivo de una anotación (consentimiento, carné). Se pide con token: no es público. */
  descargarArchivoFicha(id: number, idNegocio: number) {
    return this.http.get(`${this.base}/ficha/${id}/archivo`, { params: this.neg(idNegocio), responseType: 'blob' });
  }

  // ── Portafolio ──
  listarPortafolio(idProfesional: number, idNegocio: number) {
    return this.http.get<ApiResponse<PortafolioImagen[]>>(
      `${this.base}/profesionales/${idProfesional}/portafolio`, { params: this.neg(idNegocio) });
  }
  agregarPortafolio(idProfesional: number, idNegocio: number, imagen: Blob, descripcion?: string | null) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    fd.append('imagen', imagen, 'trabajo.webp');
    if (descripcion) fd.append('descripcion', descripcion);
    return this.http.post<ApiResponse<PortafolioImagen>>(`${this.base}/profesionales/${idProfesional}/portafolio`, fd);
  }
  eliminarPortafolio(idImagen: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/portafolio/${idImagen}`, { params: this.neg(idNegocio) });
  }

  // ── Venta de productos ──

  listarCategoriasProducto(idNegocio: number) {
    return this.http.get<ApiResponse<ProductoCategoria[]>>(`${this.base}/productos/categorias`, { params: this.neg(idNegocio) });
  }
  crearCategoriaProducto(idNegocio: number, nombre: string, descripcion?: string | null) {
    return this.http.post<ApiResponse<ProductoCategoria>>(
      `${this.base}/productos/categorias`, { id_negocio: idNegocio, nombre, descripcion });
  }
  actualizarCategoriaProducto(id: number, idNegocio: number, datos: { nombre?: string; descripcion?: string | null }) {
    return this.http.put<ApiResponse<ProductoCategoria>>(`${this.base}/productos/categorias/${id}`, { id_negocio: idNegocio, ...datos });
  }
  inactivarCategoriaProducto(id: number, idNegocio: number) {
    return this.http.patch<ApiResponse<ProductoCategoria>>(
      `${this.base}/productos/categorias/${id}/inactivar`, {}, { params: this.neg(idNegocio) });
  }

  listarProductos(idNegocio: number, opts: { incluirInactivos?: boolean } = {}) {
    let p = this.neg(idNegocio);
    if (opts.incluirInactivos) p = p.set('incluir_inactivas', 'true');
    return this.http.get<ApiResponse<Producto[]>>(`${this.base}/productos`, { params: p });
  }
  crearProducto(idNegocio: number, datos: ProductoPayload) {
    return this.http.post<ApiResponse<Producto>>(`${this.base}/productos`, { id_negocio: idNegocio, ...datos });
  }
  actualizarProducto(id: number, idNegocio: number, datos: ProductoPayload) {
    return this.http.put<ApiResponse<Producto>>(`${this.base}/productos/${id}`, { id_negocio: idNegocio, ...datos });
  }
  inactivarProducto(id: number, idNegocio: number) {
    return this.http.patch<ApiResponse<Producto>>(`${this.base}/productos/${id}/inactivar`, {}, { params: this.neg(idNegocio) });
  }
  subirImagenProducto(id: number, idNegocio: number, imagen: Blob) {
    const fd = new FormData();
    fd.append('id_negocio', String(idNegocio));
    fd.append('imagen', imagen, 'producto.webp');
    return this.http.post<ApiResponse<{ imagen_url: string }>>(`${this.base}/productos/${id}/imagen`, fd);
  }
  eliminarImagenProducto(id: number, idNegocio: number) {
    return this.http.delete<ApiResponse<unknown>>(`${this.base}/productos/${id}/imagen`, { params: this.neg(idNegocio) });
  }

  listarVentasProductos(idNegocio: number, filtro: { estado?: string; canal?: string } = {}) {
    let p = this.neg(idNegocio);
    if (filtro.estado) p = p.set('estado', filtro.estado);
    if (filtro.canal) p = p.set('canal', filtro.canal);
    return this.http.get<ApiResponse<VentaProducto[]>>(`${this.base}/ventas-productos`, { params: p });
  }
  /** Vender y cobrar en un solo paso: el «un clic» del mostrador. */
  venderProductos(idNegocio: number, items: ItemVenta[], pago: PagoVenta, extra: {
    id_profesional?: number | null; notas?: string | null; id_cita?: number | null;
  } = {}) {
    return this.http.post<ApiResponse<VentaProducto>>(`${this.base}/ventas-productos/vender`, {
      id_negocio: idNegocio, items, ...pago, ...extra,
    });
  }
  /** Cobra un pedido PENDIENTE (típicamente del portal, al entregarlo). */
  cobrarVentaProducto(idVenta: number, idNegocio: number, pago: PagoVenta) {
    return this.http.post<ApiResponse<VentaProducto>>(
      `${this.base}/ventas-productos/${idVenta}/cobrar`, { id_negocio: idNegocio, ...pago });
  }
  cancelarVentaProducto(idVenta: number, idNegocio: number) {
    return this.http.post<ApiResponse<VentaProducto>>(
      `${this.base}/ventas-productos/${idVenta}/cancelar`, { id_negocio: idNegocio });
  }
}
