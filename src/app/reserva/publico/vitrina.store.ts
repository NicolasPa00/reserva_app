import { Injectable, computed, inject, signal } from '@angular/core';

import { ReservaApiService } from '../../core/services/reserva-api.service';
import { ThemeService } from '../../core/theme/theme.service';
import { MonedaService } from '../../core/services/moneda.service';
import { ProfesionalPublico, ServicioPublico, Vitrina } from '../../core/models';

/**
 * Estado de la página pública de un negocio.
 *
 * ## Por qué un store y no una carga por componente
 *
 * La portada, el asistente de reserva y la cabecera necesitan **los mismos datos**. Si cada uno
 * los pidiera, moverse de la portada a «Reservar» volvería a descargar los trece servicios y
 * repintaría el tema, con el parpadeo de color que eso implica. Se carga una vez por negocio y
 * los tres leen de aquí.
 *
 * No hay caducidad ni recarga en segundo plano a propósito: la visita de un cliente dura unos
 * minutos y el catálogo de un salón no cambia mientras alguien elige un corte. Lo que sí es
 * volátil —qué horas quedan libres— no vive aquí; se pide por día al abrir el calendario.
 */
@Injectable({ providedIn: 'root' })
export class VitrinaStore {
  private readonly api = inject(ReservaApiService);
  private readonly theme = inject(ThemeService);
  private readonly monedas = inject(MonedaService);

  private readonly _vitrina = signal<Vitrina | null>(null);
  private readonly _cargando = signal(false);
  private readonly _error = signal<string | null>(null);
  private idCargado: number | null = null;

  readonly vitrina = this._vitrina.asReadonly();
  readonly cargando = this._cargando.asReadonly();
  readonly error = this._error.asReadonly();

  readonly negocio = computed(() => this._vitrina()?.negocio ?? null);
  readonly servicios = computed(() => this._vitrina()?.servicios ?? []);
  readonly secciones = computed(() => this._vitrina()?.secciones ?? []);
  readonly profesionales = computed(() => this._vitrina()?.profesionales ?? []);
  readonly reglas = computed(() => this._vitrina()?.reglas ?? null);

  /** Días en los que atiende alguien. Es lo que la portada resume como «horario». */
  readonly diasAbiertos = computed(() => {
    const abiertos = new Set<number>();
    for (const p of this.profesionales()) {
      for (const d of p.horario) if (d.abierto) abiertos.add(d.dia_semana);
    }
    return abiertos;
  });

  /** Carga la vitrina de un negocio. Repetir el mismo id no vuelve a pedirla. */
  cargar(idNegocio: number, forzar = false): void {
    if (!idNegocio) { this._error.set('La dirección no indica ningún negocio.'); return; }
    if (this.idCargado === idNegocio && !forzar && this._vitrina()) return;

    this.idCargado = idNegocio;
    this._cargando.set(true);
    this._error.set(null);

    this.api.publicoVitrina(idNegocio).subscribe({
      next: r => {
        if (r?.success && r.data) {
          this._vitrina.set(r.data);
          this.theme.aplicar(r.data.negocio.colores, r.data.negocio.paleta);
          // La moneda va con el tema y por lo mismo: aquí no hay sesión de la que sacarla, y
          // el catálogo se pinta con precios en cuanto llega esta respuesta.
          this.monedas.usarLaDelPortal(r.data.negocio.moneda);
        } else {
          this._error.set(r?.message || 'Esta página no está disponible.');
        }
        this._cargando.set(false);
      },
      error: err => {
        // 404 es el caso normal —enlace viejo o página despublicada— y merece su propio texto:
        // «error de conexión» mandaría al cliente a revisar su wifi por nada.
        this._error.set(err?.status === 404
          ? 'Esta página no está disponible.'
          : 'No pudimos cargar la página. Inténtalo de nuevo en un momento.');
        this._cargando.set(false);
      },
    });
  }

  servicioPorId(id: number): ServicioPublico | undefined {
    return this.servicios().find(s => s.id_servicio === id);
  }

  profesionalPorId(id: number): ProfesionalPublico | undefined {
    return this.profesionales().find(p => p.id_profesional === id);
  }

  /**
   * Profesionales que pueden hacer **todos** los servicios elegidos.
   *
   * Es una intersección, no una unión: una cita con dos servicios la atiende una sola persona
   * de principio a fin, así que quien no sepa hacer uno de los dos no sirve. Ofrecerlo y que la
   * reserva fallara al confirmar es exactamente el error que esto evita.
   */
  profesionalesPara(idServicios: number[]): ProfesionalPublico[] {
    if (!idServicios.length) return this.profesionales();
    return this.profesionales().filter(p =>
      idServicios.every(id => p.id_servicios.includes(id)),
    );
  }
}
