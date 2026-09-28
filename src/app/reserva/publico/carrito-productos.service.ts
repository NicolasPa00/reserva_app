import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ProductoPublico } from '../../core/models';

/** Una línea del carrito: una foto del producto en el momento de agregarlo, no una referencia. */
export interface ItemCarritoProducto {
  id_producto: number;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  cantidad: number;
}

export interface DatosClienteProducto {
  nombre: string;
  telefono: string;
  nota: string;
}

export const CLIENTE_VACIO: DatosClienteProducto = { nombre: '', telefono: '', nota: '' };

/** Cuánto se recuerdan el carrito y los datos del cliente que repite: 90 días. */
const VIGENCIA_MS = 1000 * 60 * 60 * 24 * 90;

/**
 * El carrito de productos del portal público, por negocio.
 *
 * Hermano del carrito de restaurante, pero más simple: aquí no hay WhatsApp de por medio — el
 * pedido se manda directo por API (`crearVentaProductoPublica`) y queda PENDIENTE hasta que el
 * negocio lo cobra al entregarlo. Por eso las líneas guardan una foto del producto (nombre,
 * precio) tomada al agregarlo: si el negocio cambia el precio mientras el cliente compra, el
 * carrito no se entera a medias, y de todas formas el servidor **relee el precio del catálogo**
 * al crear la venta — lo que viaja aquí es solo para pintar el resumen.
 *
 * Solo «recoger en el local» por ahora (domicilio queda para más adelante, ver
 * `docs/productos-en-reserva.md`), así que no hay modalidad que elegir.
 */
@Injectable({ providedIn: 'root' })
export class CarritoProductosService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly api = inject(ReservaApiService);

  private readonly _idNegocio = signal<number | null>(null);
  private readonly _items = signal<ItemCarritoProducto[]>([]);
  private readonly _cliente = signal<DatosClienteProducto>({ ...CLIENTE_VACIO });
  private readonly _enviando = signal(false);

  readonly items = this._items.asReadonly();
  readonly cliente = this._cliente.asReadonly();
  readonly enviando = this._enviando.asReadonly();

  readonly cantidadTotal = computed(() => this._items().reduce((n, i) => n + i.cantidad, 0));
  readonly total = computed(() => this._items().reduce((s, i) => s + i.precio * i.cantidad, 0));
  readonly vacio = computed(() => this._items().length === 0);

  /** Cambiar de negocio (otra pestaña, otro QR) no debe mezclar carritos. */
  iniciar(idNegocio: number): void {
    if (this._idNegocio() === idNegocio) return;
    this._idNegocio.set(idNegocio);
    this.restaurarCarrito(idNegocio);
    this.restaurarCliente(idNegocio);
  }

  agregar(producto: ProductoPublico, cantidad = 1): void {
    const items = [...this._items()];
    const i = items.findIndex((x) => x.id_producto === producto.id_producto);
    if (i >= 0) {
      items[i] = { ...items[i], cantidad: items[i].cantidad + cantidad };
    } else {
      items.push({
        id_producto: producto.id_producto, nombre: producto.nombre,
        precio: producto.precio, imagen_url: producto.imagen_url, cantidad,
      });
    }
    this._items.set(items);
    this.guardarCarrito();
  }

  /** Suma uno a una línea que ya está en el carrito (el «+» del panel, que no tiene el producto a mano). */
  agregarUno(idProducto: number): void {
    const items = this._items();
    const i = items.findIndex((x) => x.id_producto === idProducto);
    if (i < 0) return;
    const copia = [...items];
    copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
    this._items.set(copia);
    this.guardarCarrito();
  }

  quitarUno(idProducto: number): void {
    const items = [...this._items()];
    const i = items.findIndex((x) => x.id_producto === idProducto);
    if (i < 0) return;
    if (items[i].cantidad <= 1) items.splice(i, 1);
    else items[i] = { ...items[i], cantidad: items[i].cantidad - 1 };
    this._items.set(items);
    this.guardarCarrito();
  }

  eliminar(idProducto: number): void {
    this._items.set(this._items().filter((x) => x.id_producto !== idProducto));
    this.guardarCarrito();
  }

  cantidadDe(idProducto: number): number {
    return this._items().find((x) => x.id_producto === idProducto)?.cantidad ?? 0;
  }

  guardarCliente(cambios: Partial<DatosClienteProducto>): void {
    this._cliente.update((c) => ({ ...c, ...cambios }));
    this.guardarClienteEnNavegador();
  }

  vaciar(): void {
    this._items.set([]);
    this.guardarCarrito();
  }

  /**
   * Envía el pedido. El servidor vuelve a leer los precios del catálogo — lo que se manda aquí
   * es solo `id_producto` y `cantidad`, nunca un precio.
   */
  enviar() {
    const idNegocio = this._idNegocio();
    const { nombre, telefono, nota } = this._cliente();
    this._enviando.set(true);
    return this.api.publicoCrearVentaProducto(idNegocio!, {
      items: this._items().map((i) => ({ id_producto: i.id_producto, cantidad: i.cantidad })),
      cliente_nombre: nombre.trim(),
      cliente_telefono: telefono.trim() || null,
      notas: nota.trim() || null,
    });
  }

  terminarEnvio(exito: boolean): void {
    this._enviando.set(false);
    if (exito) this.vaciar();
  }

  // ── Persistencia por negocio, solo en el navegador ──

  private claveCarrito(id: number) { return `escalapp.carritoProductos.${id}`; }
  private claveCliente(id: number) { return `escalapp.clienteProductos.${id}`; }

  private guardarCarrito(): void {
    const id = this._idNegocio();
    if (id == null || !isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this.claveCarrito(id), JSON.stringify({
        v: 1, guardado: Date.now(), items: this._items(),
      }));
    } catch {
      // Sin almacenamiento el carrito dura lo que dure la pestaña.
    }
  }

  private restaurarCarrito(idNegocio: number): void {
    this._items.set([]);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const crudo = localStorage.getItem(this.claveCarrito(idNegocio));
      if (!crudo) return;
      const s = JSON.parse(crudo);
      const vale = s && s.v === 1 && Number.isFinite(s.guardado) && Date.now() - s.guardado <= VIGENCIA_MS;
      if (!vale) { localStorage.removeItem(this.claveCarrito(idNegocio)); return; }
      const items = Array.isArray(s.items) ? s.items.filter((i: unknown): i is ItemCarritoProducto =>
        !!i && typeof i === 'object'
        && Number.isInteger((i as ItemCarritoProducto).id_producto)
        && typeof (i as ItemCarritoProducto).nombre === 'string'
        && Number.isFinite((i as ItemCarritoProducto).precio)
        && Number.isFinite((i as ItemCarritoProducto).cantidad) && (i as ItemCarritoProducto).cantidad > 0,
      ) : [];
      this._items.set(items);
    } catch {
      // JSON corrupto o sin acceso: se empieza con el carrito vacío.
    }
  }

  private guardarClienteEnNavegador(): void {
    const id = this._idNegocio();
    if (id == null || !isPlatformBrowser(this.platformId)) return;
    try {
      const { nombre, telefono } = this._cliente();
      localStorage.setItem(this.claveCliente(id), JSON.stringify({ v: 1, guardado: Date.now(), nombre, telefono }));
    } catch {
      // noop
    }
  }

  private restaurarCliente(idNegocio: number): void {
    this._cliente.set({ ...CLIENTE_VACIO });
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const crudo = localStorage.getItem(this.claveCliente(idNegocio));
      if (!crudo) return;
      const s = JSON.parse(crudo);
      const vale = s && s.v === 1 && Number.isFinite(s.guardado) && Date.now() - s.guardado <= VIGENCIA_MS;
      if (!vale) { localStorage.removeItem(this.claveCliente(idNegocio)); return; }
      this._cliente.set({
        nombre: typeof s.nombre === 'string' ? s.nombre.slice(0, 150) : '',
        telefono: typeof s.telefono === 'string' ? s.telefono.slice(0, 30) : '',
        nota: '',
      });
    } catch {
      // JSON corrupto o sin acceso: se empieza con el formulario vacío.
    }
  }
}
