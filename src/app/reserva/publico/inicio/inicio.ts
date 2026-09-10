import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector,
  afterNextRender, computed, effect, inject, signal, viewChild,
} from '@angular/core';

import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { VitrinaStore } from '../vitrina.store';
import { UrlArchivoPipe } from '../../../shared/url-archivo.pipe';
import { ProfesionalPublico } from '../../../core/models';
import { rangoHora12 } from '../../../core/utils/hora';
import { ProfesionalModalComponent } from '../profesional-modal/profesional-modal';
import { colorDeEntidad } from '../../../core/utils/color-entidad';
import { MonedaPipe } from '../../../shared/moneda.pipe';

/**
 * Portada pública del negocio.
 *
 * ## El orden responde a lo que trae el cliente
 *
 * Quien abre el enlace trae tres preguntas: **quiénes sois**, **qué hacéis y cuánto cuesta**, y
 * **cuándo podéis atenderme**. La cabecera responde la primera de un vistazo; el catálogo por
 * categorías, la segunda; y el equipo con su horario, la tercera.
 *
 * ## Por qué el catálogo va por categorías
 *
 * Trece servicios en una sola rejilla ya se leen como una lista de la compra, y un salón real
 * tiene cuarenta. Las secciones —«Barbería», «Color», «Uñas»— son cómo el negocio piensa su
 * carta y cómo el cliente busca. La tira de categorías de arriba salta a cada sección sin
 * recargar: es un índice, no un filtro, porque esconder las demás obliga a volver atrás para
 * comparar precios entre secciones.
 *
 * ## Por qué el horario va dentro de cada profesional
 *
 * Un salón no tiene un horario: tiene el de cada persona. Publicar un «Lunes a sábado 9-18» que
 * es la unión de todos lleva a pedir el lunes con alguien que solo trabaja los jueves.
 */
@Component({
  selector: 'reserva-publico-inicio',
  standalone: true,
  imports: [LucideAngularModule, MonedaPipe, UrlArchivoPipe, ProfesionalModalComponent],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicoInicioComponent {
  private readonly router = inject(Router);
  readonly store = inject(VitrinaStore);

  readonly negocio = this.store.negocio;
  readonly servicios = this.store.servicios;
  readonly profesionales = this.store.profesionales;
  readonly secciones = this.store.secciones;

  readonly raiz = computed(() => `/p/${this.negocio()?.id_negocio ?? ''}`);

  /** Sección visible en la tira de categorías. Solo resalta; no filtra el contenido. */
  readonly seccionActiva = signal<string | null>(null);

  private readonly tira = viewChild<ElementRef<HTMLElement>>('tira');

  /**
   * ¿La tira de categorías no cabe en su ancho?
   *
   * Las flechas solo aparecen cuando hay algo a lo que desplazarse. Con cuatro categorías que
   * caben de sobra, dos flechas muertas a los lados hacen creer que hay más contenido oculto.
   * Se mide en el DOM y no por número de categorías porque depende del ancho de los nombres y
   * de la pantalla, no de cuántas haya.
   */
  readonly desbordada = signal(false);

  private readonly injector = inject(Injector);

  constructor() {
    // Se remide cuando cambian las secciones (llega la vitrina) y al cambiar el tamaño de la
    // ventana. `afterNextRender` garantiza que el elemento ya existe y solo corre en navegador.
    effect(() => {
      this.secciones();
      afterNextRender(() => this.medirTira(), { injector: this.injector });
    });
  }

  @HostListener('window:resize')
  medirTira(): void {
    const el = this.tira()?.nativeElement;
    if (!el) return;
    // +2 px de holgura: el redondeo subpíxel marca desborde en tiras que caben justas.
    this.desbordada.set(el.scrollWidth > el.clientWidth + 2);
  }

  readonly diasCortos = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  readonly diasAbiertos = this.store.diasAbiertos;

  /** Rango de precios del catálogo: da una idea sin leer las trece tarjetas. */
  readonly rangoPrecios = computed(() => {
    const precios = this.servicios().map(s => s.precio).filter(p => p > 0);
    if (!precios.length) return null;
    return { min: Math.min(...precios), max: Math.max(...precios) };
  });

  readonly duracionMinima = computed(() => {
    const d = this.servicios().map(s => s.duracion_min);
    return d.length ? Math.min(...d) : null;
  });

  /** Enlace `tel:` limpio: los espacios y paréntesis del teléfono no valen en un href. */
  readonly telefonoLlamada = computed(() => {
    const t = this.negocio()?.telefono;
    return t ? `tel:${t.replace(/[^\d+]/g, '')}` : null;
  });

  readonly enlaceMapa = computed(() => {
    const d = this.negocio()?.direccion;
    return d ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d)}` : null;
  });

  /** `id_categoria` puede ser null (grupo «Otros»); el ancla necesita una clave estable. */
  anclaDe(idCategoria: number | null): string {
    return `sec-${idCategoria ?? 'otros'}`;
  }

  irASeccion(idCategoria: number | null): void {
    const ancla = this.anclaDe(idCategoria);
    this.seccionActiva.set(ancla);
    document.getElementById(ancla)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Flechas de la tira: la lista de categorías puede no caber en un móvil. */
  desplazarTira(direccion: -1 | 1): void {
    this.tira()?.nativeElement.scrollBy({ left: direccion * 220, behavior: 'smooth' });
  }

  nombreProfesional(id: number): string {
    return this.store.profesionalPorId(id)?.nombre ?? '';
  }

  /** Solo los días que trabaja: siete filas con cuatro «Cerrado» ocupan sin informar. */
  diasDe(p: ProfesionalPublico) {
    return p.horario.filter(d => d.abierto);
  }

  franjas(dia: { franjas: { hora_inicio: string; hora_fin: string }[] }): string {
    return dia.franjas.map(f => rangoHora12(f.hora_inicio, f.hora_fin)).join(' · ');
  }

  abrirServicio(idServicio: number): void {
    this.router.navigate([this.raiz(), 'servicio', idServicio]);
  }

  /** Ficha del profesional. `null` cierra el modal. */
  readonly profesionalAbierto = signal<number | null>(null);

  verProfesional(id: number): void {
    this.profesionalAbierto.set(id);
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
