import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { map, of, tap } from 'rxjs';

import { ReservaApiService } from './reserva-api.service';
import { PaisDisponible } from '../models';

/**
 * El catálogo de países de la plataforma: código, nombre, indicativo y moneda.
 *
 * ## Por qué un servicio y no una constante
 *
 * La tentación es escribir `[{ codigo: 'CO', indicativo: '+57' }, …]` en el frontend y acabar
 * antes. El backend tiene esa misma tabla en `app_core/helpers/paises.js`, y ahí está además la
 * regla de **qué es un móvil válido** en cada país, que es la que decide si un teléfono se
 * guarda o se rechaza. Con dos listas, añadir un país al backend deja el selector sin él —y el
 * formulario ofrecería países cuyos números el servidor no sabe normalizar—. Se pide una vez.
 *
 * ## Una sola petición por sesión
 *
 * Es catálogo de plataforma: no cambia mientras alguien rellena un formulario. Se guarda la
 * respuesta y las siguientes llamadas devuelven lo que ya hay, sin tocar la red. Un fallo no se
 * cachea: si la primera petición se cae, la próxima vez que se abra el formulario se reintenta.
 */
@Injectable({ providedIn: 'root' })
export class PaisesService {
  private readonly api = inject(ReservaApiService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _paises = signal<PaisDisponible[]>([]);
  readonly paises = this._paises.asReadonly();

  private cargado = false;

  /**
   * Carga el catálogo si aún no está. Devuelve siempre la lista, venga de la red o de memoria.
   *
   * En el servidor no se pide: el endpoint exige token y durante el prerender no hay sesión, así
   * que la llamada solo servía para dejar cuatro 401 en el log del build. La lista se necesita
   * para pintar un desplegable y partir un número al abrir un formulario, y ninguna de las dos
   * cosas pasa antes de que la página esté en el navegador.
   */
  cargar() {
    if (!isPlatformBrowser(this.platformId)) return of(this._paises());
    if (this.cargado && this._paises().length) return of(this._paises());
    return this.api.listarPaises().pipe(
      tap(r => {
        if (r?.success && r.data?.length) {
          this._paises.set(r.data);
          this.cargado = true;
        }
      }),
      // El componente solo quiere la lista; el sobre de la respuesta se queda aquí.
      map(() => this._paises()),
    );
  }

  porCodigo(codigo: string | null | undefined): PaisDisponible | null {
    if (!codigo) return null;
    return this._paises().find(p => p.codigo === codigo) ?? null;
  }

  /**
   * Parte un número guardado en país + número nacional, para repintar el formulario al editar.
   *
   * Espejo de `partirE164` del backend, y por el mismo motivo: lo que hay en la base es
   * `+573188887013` y el formulario necesita «CO» en el selector y «3188887013» en la casilla.
   * Se busca el indicativo **más largo** que encaje —un `+1` no debe ganarle a un `+56`— y se
   * comprueba además el largo del número nacional, que es lo que separa a dos países cuyo
   * prefijo empieza igual.
   *
   * Lo que no empiece por `+` es un teléfono guardado antes de que existiera el selector: se
   * devuelve entero, con el país por defecto, y se normaliza la próxima vez que se guarde.
   */
  partir(valor: string | null | undefined, paisPorDefecto = 'CO'): { pais: string; numero: string } {
    const texto = String(valor ?? '').trim();
    if (!texto) return { pais: paisPorDefecto, numero: '' };

    const digitos = texto.replace(/[^0-9]/g, '');
    if (texto.startsWith('+')) {
      const candidatos = this._paises()
        .filter(p => {
          const cc = p.indicativo.replace('+', '');
          return digitos.startsWith(cc) && digitos.length === cc.length + p.largo;
        })
        .sort((a, b) => b.indicativo.length - a.indicativo.length);

      if (candidatos.length) {
        const elegido = candidatos[0];
        return { pais: elegido.codigo, numero: digitos.slice(elegido.indicativo.length - 1) };
      }
    }
    return { pais: paisPorDefecto, numero: digitos };
  }
}
