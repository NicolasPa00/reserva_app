import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/services/auth.service';
import { PerfilApiService } from '../../core/services/perfil-api.service';
import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ToastService } from '../../core/services/toast.service';
import { MonedaPipe } from '../../shared/moneda.pipe';
import { MetodoPago, Producto, ProductoCategoria, VentaProducto } from '../../core/models';

type Pestana = 'catalogo' | 'vender' | 'pedidos';

interface LineaVenta {
  producto: Producto;
  cantidad: number;
}

interface FormularioProducto {
  id_producto?: number;
  nombre: string;
  descripcion: string;
  precio: number | null;
  id_categoria: number | null;
  controla_stock: boolean;
  stock_actual: number | null;
  publico_activo: boolean;
}

const FORM_VACIO: FormularioProducto = {
  nombre: '', descripcion: '', precio: null, id_categoria: null,
  controla_stock: false, stock_actual: null, publico_activo: true,
};

/**
 * Venta de productos (función «Venta de productos», disponible en los siete perfiles y apagada
 * de fábrica — ver `docs/productos-en-reserva.md`). Cualquier negocio del vertical puede vender
 * un producto físico junto a sus servicios: pomada en una barbería, alimento en un cuidado de
 * mascotas, souvenirs en un hospedaje.
 *
 * Tres pestañas:
 * - **Catálogo**: categorías y productos.
 * - **Vender**: el mostrador — arma la venta y la cobra en un solo paso.
 * - **Pedidos**: lo que llegó del portal (para recoger) y espera que lo cobren al entregarlo.
 */
@Component({
  selector: 'reserva-productos',
  standalone: true,
  imports: [LucideAngularModule, MonedaPipe],
  templateUrl: './productos.html',
  styleUrl: './productos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductosComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(PerfilApiService);
  private readonly reservaApi = inject(ReservaApiService);
  private readonly toast = inject(ToastService);

  readonly idNegocio = computed(() => this.auth.negocio()?.id_negocio ?? 0);
  private readonly permiso = computed(() => this.auth.permisosVistaActivos().find((p) => p.url === '/productos') ?? null);
  readonly puedeEditar = computed(() => this.permiso()?.puede_editar ?? true);

  readonly pestana = signal<Pestana>('catalogo');
  readonly cargando = signal(false);
  readonly ocupado = signal(false);

  readonly categorias = signal<ProductoCategoria[]>([]);
  readonly productos = signal<Producto[]>([]);
  readonly metodosPago = signal<MetodoPago[]>([]);
  readonly pedidos = signal<VentaProducto[]>([]);

  readonly productosPorCategoria = computed(() => {
    const mapa = new Map<number | null, Producto[]>();
    for (const p of this.productos()) {
      const clave = p.id_categoria ?? null;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(p);
    }
    return mapa;
  });

  // ── Catálogo: formularios ──
  readonly nuevaCategoria = signal('');
  readonly renombrandoCategoria = signal<{ id: number; nombre: string } | null>(null);
  readonly formulario = signal<FormularioProducto | null>(null);
  readonly editandoId = signal<number | null>(null);
  readonly confirmarBaja = signal<number | null>(null);

  // ── Vender (mostrador) ──
  readonly carrito = signal<LineaVenta[]>([]);
  readonly idMetodoPagoVenta = signal<number | null>(null);
  readonly totalVenta = computed(() =>
    this.carrito().reduce((s, l) => s + Number(l.producto.precio) * l.cantidad, 0),
  );

  ngOnInit() {
    this.cargarCatalogo();
    // Sin negocio (prerender en el servidor, sin sesión) no hay nada que pedir: la petición
    // salía con id_negocio=0 y rompía el build con un 401.
    if (!this.idNegocio()) return;
    this.reservaApi.listarMetodosPago(this.idNegocio()).subscribe((r) => {
      if (r?.success && r.data) this.metodosPago.set(r.data);
    });
  }

  cambiarPestana(p: Pestana) {
    this.pestana.set(p);
    if (p === 'pedidos') this.cargarPedidos();
  }

  cargarCatalogo() {
    if (!this.idNegocio()) return;
    this.cargando.set(true);
    this.api.listarCategoriasProducto(this.idNegocio()).subscribe((r) => {
      if (r?.success && r.data) this.categorias.set(r.data);
    });
    this.api.listarProductos(this.idNegocio()).subscribe({
      next: (r) => { this.productos.set(r?.success && r.data ? r.data : []); this.cargando.set(false); },
      error: (e) => { this.cargando.set(false); this.toast.error(e?.error?.message || 'No se pudo cargar el catálogo.'); },
    });
  }

  cargarPedidos() {
    this.api.listarVentasProductos(this.idNegocio(), { estado: 'PENDIENTE', canal: 'PORTAL' }).subscribe({
      next: (r) => this.pedidos.set(r?.success && r.data ? r.data : []),
      error: (e) => this.toast.error(e?.error?.message || 'No se pudieron cargar los pedidos.'),
    });
  }

  private tras<T>(obs: { subscribe: (o: { next: (r: { success: boolean; message?: string; data?: T }) => void; error: (e: unknown) => void }) => void }, ok: string, luego?: () => void) {
    this.ocupado.set(true);
    obs.subscribe({
      next: (r) => {
        this.ocupado.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo guardar.'); return; }
        this.toast.success(ok);
        luego?.();
      },
      error: (e: unknown) => {
        this.ocupado.set(false);
        this.toast.error((e as { error?: { message?: string } })?.error?.message || 'No se pudo guardar.');
      },
    });
  }

  // ── Categorías ──

  crearCategoria() {
    const nombre = this.nuevaCategoria().trim();
    if (!nombre) return;
    this.tras(this.api.crearCategoriaProducto(this.idNegocio(), nombre), 'Categoría creada', () => this.cargarCatalogo());
    this.nuevaCategoria.set('');
  }

  guardarNombreCategoria() {
    const r = this.renombrandoCategoria();
    if (!r || !r.nombre.trim()) return;
    this.tras(this.api.actualizarCategoriaProducto(r.id, this.idNegocio(), { nombre: r.nombre.trim() }),
      'Categoría actualizada', () => this.cargarCatalogo());
    this.renombrandoCategoria.set(null);
  }

  quitarCategoria(id: number) {
    this.tras(this.api.inactivarCategoriaProducto(id, this.idNegocio()),
      'Categoría eliminada. Sus productos quedaron sin categoría.', () => this.cargarCatalogo());
  }

  // ── Productos ──

  abrirNuevo() {
    this.editandoId.set(null);
    this.formulario.set({ ...FORM_VACIO });
  }

  editar(p: Producto) {
    this.editandoId.set(p.id_producto);
    this.formulario.set({
      id_producto: p.id_producto,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: Number(p.precio),
      id_categoria: p.id_categoria,
      controla_stock: p.controla_stock,
      stock_actual: Number(p.stock_actual),
      publico_activo: p.publico_activo,
    });
  }

  cerrarFormulario() {
    this.formulario.set(null);
    this.editandoId.set(null);
  }

  guardarProducto() {
    const f = this.formulario();
    if (!f || !f.nombre.trim() || f.precio == null || f.precio < 0) return;

    const payload = {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || null,
      precio: f.precio,
      id_categoria: f.id_categoria,
      controla_stock: f.controla_stock,
      stock_actual: f.controla_stock ? (f.stock_actual ?? 0) : undefined,
      publico_activo: f.publico_activo,
    };

    const obs = f.id_producto
      ? this.api.actualizarProducto(f.id_producto, this.idNegocio(), payload)
      : this.api.crearProducto(this.idNegocio(), payload);

    this.tras(obs, f.id_producto ? 'Producto actualizado' : 'Producto creado', () => {
      this.cargarCatalogo();
      this.cerrarFormulario();
    });
  }

  quitarProducto(id: number) {
    this.confirmarBaja.set(null);
    this.tras(this.api.inactivarProducto(id, this.idNegocio()), 'Producto eliminado', () => this.cargarCatalogo());
  }

  subirImagen(p: Producto, archivo: File | null) {
    if (!archivo) return;
    this.tras(this.api.subirImagenProducto(p.id_producto, this.idNegocio(), archivo), 'Imagen guardada', () => this.cargarCatalogo());
  }

  // ── Vender (mostrador) ──

  agregarAlCarrito(p: Producto) {
    const linea = this.carrito();
    const i = linea.findIndex((l) => l.producto.id_producto === p.id_producto);
    if (i >= 0) {
      const copia = [...linea];
      copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
      this.carrito.set(copia);
    } else {
      this.carrito.set([...linea, { producto: p, cantidad: 1 }]);
    }
  }

  quitarDelCarrito(idProducto: number) {
    this.carrito.set(this.carrito().filter((l) => l.producto.id_producto !== idProducto));
  }

  cambiarCantidad(idProducto: number, cantidad: number) {
    if (cantidad <= 0) { this.quitarDelCarrito(idProducto); return; }
    this.carrito.set(this.carrito().map((l) => l.producto.id_producto === idProducto ? { ...l, cantidad } : l));
  }

  vaciarCarrito() {
    this.carrito.set([]);
    this.idMetodoPagoVenta.set(null);
  }

  cobrarVenta() {
    const items = this.carrito().map((l) => ({ id_producto: l.producto.id_producto, cantidad: l.cantidad }));
    const idMetodoPago = this.idMetodoPagoVenta();
    if (items.length === 0 || !idMetodoPago) return;

    this.ocupado.set(true);
    this.api.venderProductos(this.idNegocio(), items, { id_metodo_pago: idMetodoPago }).subscribe({
      next: (r) => {
        this.ocupado.set(false);
        if (!r?.success) { this.toast.error(r?.message || 'No se pudo vender.'); return; }
        this.toast.success('Venta cobrada');
        this.vaciarCarrito();
      },
      error: (e) => { this.ocupado.set(false); this.toast.error(e?.error?.message || 'No se pudo vender.'); },
    });
  }

  // ── Pedidos del portal ──

  cobrarPedido(venta: VentaProducto, idMetodoPago: number | null) {
    if (!idMetodoPago) { this.toast.error('Elige con qué forma de pago se cobró.'); return; }
    this.tras(this.api.cobrarVentaProducto(venta.id_venta, this.idNegocio(), { id_metodo_pago: idMetodoPago }),
      'Pedido cobrado', () => this.cargarPedidos());
  }

  cancelarPedido(venta: VentaProducto) {
    this.tras(this.api.cancelarVentaProducto(venta.id_venta, this.idNegocio()), 'Pedido cancelado', () => this.cargarPedidos());
  }
}
