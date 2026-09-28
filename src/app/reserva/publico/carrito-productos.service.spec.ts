import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CarritoProductosService } from './carrito-productos.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ProductoPublico } from '../../core/models';

/**
 * El carrito de productos del portal (docs/productos-en-reserva.md).
 *
 * Lo que más importa sostener: el precio que viaja al servidor es el del `id_producto` y la
 * `cantidad`, nunca uno calculado en el cliente — el servidor lo relee del catálogo, y si aquí se
 * mandara un precio, sería una invitación a manipularlo. Lo segundo es que el carrito es por
 * negocio: cambiar de negocio no debe mezclar el carrito de uno con el del otro.
 */
describe('CarritoProductosService', () => {
  let carrito: CarritoProductosService;
  let apiCrearVenta: ReturnType<typeof vi.fn>;

  const shampoo: ProductoPublico = { id_producto: 10, nombre: 'Shampoo', descripcion: null, precio: 25000, imagen_url: null, id_categoria: 1 };
  const cera: ProductoPublico = { id_producto: 11, nombre: 'Cera', descripcion: null, precio: 18000, imagen_url: null, id_categoria: 1 };

  beforeEach(() => {
    apiCrearVenta = vi.fn(() => of({ success: true, message: 'ok', data: { id_venta: 1, total: 25000, estado: 'PENDIENTE' } }));
    TestBed.configureTestingModule({
      providers: [{ provide: ReservaApiService, useValue: { publicoCrearVentaProducto: apiCrearVenta } }],
    });
    carrito = TestBed.inject(CarritoProductosService);
    try { localStorage.clear(); } catch { /* sin almacenamiento, el carrito dura la pestaña */ }
    carrito.iniciar(30);
  });

  describe('sumar y restar', () => {
    it('agregar dos veces el mismo producto sube la cantidad, no duplica la línea', () => {
      carrito.agregar(shampoo);
      carrito.agregar(shampoo);

      expect(carrito.items().length).toBe(1);
      expect(carrito.items()[0].cantidad).toBe(2);
      expect(carrito.cantidadTotal()).toBe(2);
    });

    it('quitar la última unidad saca el producto del carrito', () => {
      carrito.agregar(shampoo);
      carrito.quitarUno(shampoo.id_producto);

      expect(carrito.items()).toEqual([]);
      expect(carrito.vacio()).toBe(true);
    });

    it('eliminar quita la línea sin importar la cantidad', () => {
      carrito.agregar(shampoo);
      carrito.agregar(shampoo);
      carrito.eliminar(shampoo.id_producto);

      expect(carrito.vacio()).toBe(true);
    });

    it('el total suma precio por cantidad de cada línea', () => {
      carrito.agregar(shampoo);
      carrito.agregar(shampoo);
      carrito.agregar(cera);

      expect(carrito.total()).toBe(25000 * 2 + 18000);
      expect(carrito.cantidadTotal()).toBe(3);
    });

    it('agregarUno suma a una línea que ya está, y no hace nada si el producto no está en el carrito', () => {
      carrito.agregar(shampoo);
      carrito.agregarUno(shampoo.id_producto);
      expect(carrito.cantidadDe(shampoo.id_producto)).toBe(2);

      carrito.agregarUno(999);
      expect(carrito.cantidadDe(999)).toBe(0);
    });
  });

  describe('persistencia por negocio', () => {
    it('cambiar de negocio no mezcla carritos', () => {
      carrito.agregar(shampoo);
      carrito.iniciar(31);

      expect(carrito.vacio()).toBe(true);

      carrito.iniciar(30);
      expect(carrito.cantidadDe(shampoo.id_producto)).toBe(1);
    });

    it('se recuerda el nombre y el teléfono del cliente, no la nota (es de este pedido)', () => {
      carrito.guardarCliente({ nombre: 'Ana', telefono: '3001234567', nota: 'sin envoltura' });
      carrito.iniciar(32);
      carrito.iniciar(30);

      expect(carrito.cliente().nombre).toBe('Ana');
      expect(carrito.cliente().telefono).toBe('3001234567');
      expect(carrito.cliente().nota).toBe('');
    });

    it('un carrito vencido (más de 90 días) se descarta al restaurar', () => {
      const vencido = { v: 1, guardado: Date.now() - 1000 * 60 * 60 * 24 * 91, items: [{ id_producto: 1, nombre: 'x', precio: 1, imagen_url: null, cantidad: 1 }] };
      localStorage.setItem('escalapp.carritoProductos.33', JSON.stringify(vencido));
      carrito.iniciar(33);
      expect(carrito.vacio()).toBe(true);
    });

    it('JSON corrupto en localStorage no rompe: el carrito empieza vacío', () => {
      localStorage.setItem('escalapp.carritoProductos.34', '{esto no es json');
      expect(() => carrito.iniciar(34)).not.toThrow();
      expect(carrito.vacio()).toBe(true);
    });
  });

  describe('enviar el pedido: nunca manda un precio, siempre relee el servidor', () => {
    it('manda solo id_producto y cantidad, más los datos del cliente saneados', () => {
      carrito.agregar(shampoo, 2);
      carrito.guardarCliente({ nombre: '  Ana Pérez  ', telefono: '  ', nota: '' });

      carrito.enviar();

      expect(apiCrearVenta).toHaveBeenCalledWith(30, {
        items: [{ id_producto: shampoo.id_producto, cantidad: 2 }],
        cliente_nombre: 'Ana Pérez',
        cliente_telefono: null,
        notas: null,
      });
    });

    it('terminarEnvio(true) vacía el carrito; terminarEnvio(false) lo conserva', () => {
      carrito.agregar(shampoo);
      carrito.terminarEnvio(false);
      expect(carrito.vacio()).toBe(false);

      carrito.terminarEnvio(true);
      expect(carrito.vacio()).toBe(true);
    });

    it('mientras se envía, `enviando` está en true', () => {
      carrito.agregar(shampoo);
      expect(carrito.enviando()).toBe(false);
      carrito.enviar();
      expect(carrito.enviando()).toBe(true);
    });
  });
});
