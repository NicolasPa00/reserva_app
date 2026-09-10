import { Pipe, PipeTransform, inject } from '@angular/core';

import { MonedaService } from '../core/services/moneda.service';

/**
 * `{{ precio | moneda }}` — el precio en la moneda del negocio.
 *
 * Sustituye al `currency` con la moneda escrita a mano que había en medio centenar de
 * plantillas. El problema de aquello no era la repetición: era que la moneda del país
 * estaba clavada en la plantilla, así que un negocio chileno publicaba sus precios en pesos
 * colombianos y no había un solo sitio donde arreglarlo.
 *
 * ## Por qué es impuro
 *
 * Un pipe puro guarda en caché su resultado y solo lo recalcula si cambia el **argumento**. La
 * moneda no es un argumento: se lee del servicio. Al cambiarla en Configuración, cada precio ya
 * pintado se quedaría con la anterior hasta que su valor cambiara —es decir, hasta recargar—, y
 * el usuario vería una pantalla a medio convertir preguntándose qué guardó.
 *
 * El coste de ser impuro está acotado a propósito: se recuerda la última entrada y su salida,
 * así que en la práctica cada ciclo de detección se resuelve con dos comparaciones. El formateo
 * de verdad solo ocurre cuando el precio o la moneda cambian.
 */
@Pipe({ name: 'moneda', standalone: true, pure: false })
export class MonedaPipe implements PipeTransform {
  private readonly monedas = inject(MonedaService);

  private ultimoValor: number | string | null | undefined;
  private ultimaClave = '';
  private ultimaSalida = '';

  transform(valor: number | string | null | undefined): string {
    const moneda = this.monedas.moneda();
    const clave = `${moneda.locale}|${moneda.codigo}|${moneda.decimales}`;
    if (valor === this.ultimoValor && clave === this.ultimaClave) return this.ultimaSalida;

    this.ultimoValor = valor;
    this.ultimaClave = clave;
    this.ultimaSalida = this.monedas.formatear(valor, moneda);
    return this.ultimaSalida;
  }
}
