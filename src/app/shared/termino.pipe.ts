import { Pipe, PipeTransform, inject } from '@angular/core';

import { AuthService } from '../core/services/auth.service';
import { ClaveTermino } from '../core/models';

/**
 * Cómo llama el negocio a una cosa: `{{ 'profesionales' | termino }}` → «Estilistas» en un
 * salón, «Artistas» en un estudio de tatuajes, «Profesionales» en una barbería.
 *
 * Solo cinco palabras cambian por rubro, y solo donde la de siempre sería incorrecta (ver
 * `perfiles/definiciones.js`). No es una traducción de la app: la mayoría de textos ya son
 * genéricos y se quedan como están.
 *
 * Impuro porque lee el perfil de la sesión, que cambia al alternar de negocio o al encender una
 * función; el cálculo es una búsqueda en un objeto de ocho claves.
 */
@Pipe({ name: 'termino', standalone: true, pure: false })
export class TerminoPipe implements PipeTransform {
  private readonly auth = inject(AuthService);

  transform(clave: ClaveTermino, modo: 'min' | '' = ''): string {
    return this.auth.termino(clave, modo === 'min');
  }
}
