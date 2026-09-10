import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { Moneda } from '../models';

/**
 * Peso colombiano: lo que había cuando todos los negocios eran de aquí.
 *
 * Sigue siendo el respaldo —y no una moneda «neutra»— porque una sesión guardada antes de que
 * el backend enviara este dato no trae ninguna, y en ese caso lo correcto es seguir pintando
 * exactamente lo que se pintaba ayer.
 */
export const MONEDA_POR_DEFECTO: Moneda = {
  codigo: 'COP',
  simbolo: '$',
  decimales: 0,
  locale: 'es-CO',
};

/**
 * Con qué moneda se pintan los precios.
 *
 * ## De dónde sale
 *
 * Del **país del negocio**, que el backend resuelve y manda ya masticado (código ISO, símbolo,
 * decimales y locale). Aquí no hay catálogo de países ni tabla de símbolos: duplicarla sería la
 * quinta copia de la misma decisión y la primera en quedarse vieja.
 *
 * Hay dos fuentes porque hay dos contextos y solo uno tiene sesión:
 *
 * - La **consola**: la moneda viaja dentro del negocio activo de la sesión, junto a los colores
 *   y por el mismo motivo —los precios se pintan en el primer render, y pedirla aparte los
 *   mostraría un instante en pesos colombianos antes de corregirse.
 * - El **portal público**: no hay sesión ninguna, así que la fija `VitrinaStore` al cargar la
 *   página del negocio, igual que aplica su tema.
 *
 * La del portal manda mientras está puesta, y `publico-shell` la retira al salir: sin eso, un
 * administrador colombiano que echara un vistazo al portal de otro negocio volvería a su propia
 * consola viendo sus precios en la moneda ajena.
 */
@Injectable({ providedIn: 'root' })
export class MonedaService {
  private readonly auth = inject(AuthService);

  /** La que fija el portal público. `null` = no estamos en el portal. */
  private readonly _portal = signal<Moneda | null>(null);

  readonly moneda = computed<Moneda>(
    () => this._portal() ?? this.auth.negocio()?.moneda ?? MONEDA_POR_DEFECTO,
  );

  /**
   * Formateadores ya construidos, por moneda.
   *
   * `Intl.NumberFormat` es caro de crear y barato de reutilizar, y aquí se llama una vez por
   * precio en pantalla: una lista de caja con cincuenta filas construiría cincuenta.
   */
  private readonly formateadores = new Map<string, Intl.NumberFormat>();

  usarLaDelPortal(moneda: Moneda | null | undefined) { this._portal.set(moneda ?? null); }

  olvidarLaDelPortal() { this._portal.set(null); }

  /** `25000` → `$ 25.000` en Colombia, `S/ 25.00` en Perú. */
  formatear(valor: number | string | null | undefined, moneda: Moneda = this.moneda()): string {
    const numero = typeof valor === 'string' ? Number(valor) : valor;
    if (numero == null || !Number.isFinite(numero)) return '';
    return this.formateador(moneda).format(numero);
  }

  private formateador(moneda: Moneda): Intl.NumberFormat {
    const clave = `${moneda.locale}|${moneda.codigo}|${moneda.decimales}`;
    const guardado = this.formateadores.get(clave);
    if (guardado) return guardado;

    const opciones: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: moneda.codigo,
      minimumFractionDigits: moneda.decimales,
      maximumFractionDigits: moneda.decimales,
    };

    let formateador: Intl.NumberFormat;
    try {
      // `narrowSymbol` es lo que evita que el dólar ecuatoriano se lea «US$ 20,00» en una
      // pantalla donde no hay ninguna otra moneda con la que confundirlo.
      formateador = new Intl.NumberFormat(moneda.locale, { ...opciones, currencyDisplay: 'narrowSymbol' });
    } catch {
      // Un entorno sin `narrowSymbol` o con un locale que no conoce: mejor el símbolo largo
      // que una pantalla sin precios.
      formateador = new Intl.NumberFormat(moneda.locale, opciones);
    }

    this.formateadores.set(clave, formateador);
    return formateador;
  }
}
