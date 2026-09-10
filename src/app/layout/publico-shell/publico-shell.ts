import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit,
  computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { FaviconService } from '../../core/services/favicon.service';
import { VitrinaStore } from '../../reserva/publico/vitrina.store';
import { UrlArchivoPipe } from '../../shared/url-archivo.pipe';
import { ServicioPublico } from '../../core/models';
import { MonedaPipe } from '../../shared/moneda.pipe';
import { MonedaService } from '../../core/services/moneda.service';

/**
 * Marco del portal público: la página que ve un cliente que llega por un enlace o un QR.
 *
 * Es un layout aparte del de la consola y no comparte nada con él por una razón concreta: aquí
 * no hay barra lateral, ni permisos, ni negocio «activo». Hay un negocio, el de la URL, y un
 * visitante que solo quiere saber qué ofrecen y a qué hora.
 *
 * La carga y el error se resuelven **aquí**, no en cada hijo: si el negocio no existe o escondió
 * su página, no tiene sentido pintar la cabecera con su nombre y debajo un error.
 */
@Component({
  selector: 'reserva-publico-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, UrlArchivoPipe, MonedaPipe],
  // El pipe se provee además de importarse: la clase se inyecta abajo para resolver la URL del
  // logo con la MISMA regla que usa la plantilla, sin duplicar el prefijo de la API.
  providers: [UrlArchivoPipe],
  templateUrl: './publico-shell.html',
  styleUrl: './publico-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoShellComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly favicon = inject(FaviconService);
  private readonly urlArchivo = inject(UrlArchivoPipe);
  readonly store = inject(VitrinaStore);
  private readonly monedas = inject(MonedaService);

  readonly negocio = this.store.negocio;
  readonly idNegocio = computed(() => this.negocio()?.id_negocio ?? null);

  /** Base de las rutas hijas. Todas cuelgan de `/p/:id`, así se arma una sola vez. */
  readonly raiz = computed(() => `/p/${this.idNegocio() ?? ''}`);

  readonly anio = new Date().getFullYear();

  // ── Datos de EscalApp para el pie ──
  readonly escalappSitio = 'https://escalapp.cloud/admin/';

  // ── Buscador ──
  readonly termino = signal('');
  readonly abierto = signal(false);
  readonly indiceActivo = signal(0);
  private readonly caja = viewChild<ElementRef<HTMLInputElement>>('caja');
  private readonly cabecera = viewChild<ElementRef<HTMLElement>>('cabecera');

  /**
   * Búsqueda insensible a mayúsculas **y a tildes**.
   *
   * `normalize('NFD')` separa cada letra de su acento y el rango de combinantes los borra, así
   * que «Diseño de cejas» se encuentra escribiendo «diseno» y «Barbería» escribiendo «barberia».
   * Sin esto, quien escribe sin tildes —la mayoría en un móvil— no encontraría media carta.
   */
  private static plano(texto: string): string {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Coincidencias por nombre, descripción o categoría.
   *
   * Se busca por **cada palabra** del término, no por la cadena entera: «corte barba» encuentra
   * «Corte y barba» aunque la «y» esté en medio. Se ordena poniendo delante lo que empieza por
   * el término, que es casi siempre lo que se busca.
   */
  readonly resultados = computed<ServicioPublico[]>(() => {
    const q = PublicoShellComponent.plano(this.termino());
    if (q.length < 2) return [];

    const palabras = q.split(/\s+/).filter(Boolean);
    const seccionPorServicio = new Map<number, string>();
    for (const sec of this.store.secciones()) {
      for (const s of sec.servicios) seccionPorServicio.set(s.id_servicio, sec.nombre);
    }

    const coincide = this.store.servicios().filter(s => {
      const heno = PublicoShellComponent.plano(
        `${s.nombre} ${s.descripcion ?? ''} ${seccionPorServicio.get(s.id_servicio) ?? ''}`);
      return palabras.every(p => heno.includes(p));
    });

    return coincide
      .sort((a, b) => {
        const ea = PublicoShellComponent.plano(a.nombre).startsWith(palabras[0]) ? 0 : 1;
        const eb = PublicoShellComponent.plano(b.nombre).startsWith(palabras[0]) ? 0 : 1;
        return ea - eb || a.nombre.localeCompare(b.nombre);
      })
      .slice(0, 8);
  });

  readonly sinResultados = computed(() =>
    this.abierto() && this.termino().trim().length >= 2 && this.resultados().length === 0);

  ngOnInit(): void {
    // El `:id_negocio` está en **esta** ruta, no en la hija: `firstChild.paramMap` llega vacío.
    this.route.paramMap.subscribe(params => {
      this.store.cargar(Number(params.get('id_negocio')));
    });
  }

  /**
   * Publica la altura real de la cabecera en `--alto-cabecera`.
   *
   * Todo lo que se queda pegado bajo el header —la tira de categorías de la portada, las migas
   * y la ficha del servicio— necesita saber cuánto mide. Estaba escrito a mano como 56 px, y en
   * pantallas estrechas la cabecera pasa a dos filas (el buscador baja a la suya) y mide casi
   * el doble: la tira quedaba escondida detrás.
   *
   * Se mide en vez de calcularse con un `@media` porque la altura depende también de lo largo
   * que sea el nombre del negocio, que es dato del inquilino.
   */
  private observador?: ResizeObserver;

  constructor() {
    // Icono de la pestaña = logo del inquilino. La URL es la misma que pinta el <img> de la
    // cabecera, así que sale de la caché del navegador: ni petición extra ni trabajo de CPU.
    effect(() => this.favicon.aplicar(this.urlArchivo.transform(this.negocio()?.logo_url)));

    // Va en un `effect` sobre la señal del `viewChild`, no en `ngAfterViewInit`: la cabecera
    // vive dentro de un `@if` que espera a la vitrina, así que cuando ese gancho se dispara el
    // elemento todavía no existe y no se llegaría a medir nunca.
    effect(onCleanup => {
      const el = this.cabecera()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;

      const publicar = () => this.document.documentElement.style
        .setProperty('--alto-cabecera', `${Math.round(el.getBoundingClientRect().height)}px`);

      publicar();
      this.observador = new ResizeObserver(publicar);
      this.observador.observe(el);

      onCleanup(() => this.observador?.disconnect());
    });
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    // Fuera del portal el icono vuelve a ser el de EscalApp (la consola vive en la misma app).
    this.favicon.restaurar();
    // La variable es global: dejarla puesta descuadraría cualquier otra pantalla.
    this.document.documentElement.style.removeProperty('--alto-cabecera');
    // Y la moneda, igual: la consola y el portal viven en la misma aplicación, así que un
    // administrador que se asome al portal de otro negocio volvería a su caja viendo la moneda
    // ajena. Al salir, manda otra vez la del negocio de su sesión.
    this.monedas.olvidarLaDelPortal();
  }

  escribir(valor: string): void {
    this.termino.set(valor);
    this.indiceActivo.set(0);
    this.abierto.set(valor.trim().length >= 2);
  }

  /** El blur se retrasa: sin esto, el clic en un resultado cierra la lista antes de registrarse. */
  cerrarConRetraso(): void {
    setTimeout(() => this.abierto.set(false), 150);
  }

  mover(delta: 1 | -1): void {
    const total = this.resultados().length;
    if (!total) return;
    this.indiceActivo.update(i => (i + delta + total) % total);
  }

  aceptar(): void {
    const elegido = this.resultados()[this.indiceActivo()];
    if (elegido) this.abrir(elegido);
  }

  abrir(servicio: ServicioPublico): void {
    this.termino.set('');
    this.abierto.set(false);
    this.caja()?.nativeElement.blur();
    this.router.navigate([this.raiz(), 'servicio', servicio.id_servicio]);
  }

  limpiar(): void {
    this.termino.set('');
    this.abierto.set(false);
    this.caja()?.nativeElement.focus();
  }
}
