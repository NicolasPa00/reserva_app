import { Pipe, PipeTransform, inject } from '@angular/core';

import { PaisesService } from '../core/services/paises.service';

/**
 * Pinta un teléfono guardado en E.164 de forma legible: `+57 318 888 7013`.
 *
 * En la base se guarda pegado (`+573188887013`) porque el destino del dato es un enlace `wa.me`
 * y ahí los espacios sobran. Pero pegado no se lee: nadie reconoce su propio número en trece
 * dígitos seguidos, y en una lista de diez profesionales eso convierte una columna de contacto
 * en una de ruido. El formato es cosa de quien lo pinta, no de quien lo guarda.
 *
 * Los grupos se calculan, no se tabulan por país: 3-3-4 para diez dígitos (Colombia, México),
 * 3-3-3 para nueve (Chile, Perú, Ecuador). Un número que no encaje se devuelve tal cual — es
 * mejor enseñarlo raro que esconderlo.
 */
/*
 * Impuro a propósito: el formato depende del catálogo de países, que llega por HTTP y puede
 * hacerlo **después** de la lista. Un pipe puro cachea por valor de entrada y no vuelve a
 * ejecutarse cuando el catálogo aparece, así que los teléfonos se quedarían pegados hasta la
 * siguiente recarga. Es una operación de cadena sobre listas de decenas de filas; el coste de
 * recalcularlo en cada ciclo es irrelevante al lado de ese fallo.
 */
@Pipe({ name: 'telefono', standalone: true, pure: false })
export class TelefonoPipe implements PipeTransform {
  private readonly paises = inject(PaisesService);

  transform(valor: string | null | undefined): string {
    const texto = String(valor ?? '').trim();
    if (!texto) return '';
    if (!texto.startsWith('+')) return texto;

    const { pais, numero } = this.paises.partir(texto, '');
    if (!pais || !numero) return texto;

    const indicativo = this.paises.porCodigo(pais)?.indicativo ?? '';
    const grupos = numero.length === 10
      ? [numero.slice(0, 3), numero.slice(3, 6), numero.slice(6)]
      : numero.match(/.{1,3}/g) ?? [numero];

    return `${indicativo} ${grupos.join(' ')}`.trim();
  }
}
