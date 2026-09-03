import { Pipe, PipeTransform, inject } from '@angular/core';

import { ReservaApiService } from '../core/services/reserva-api.service';

/**
 * Antepone el origen de la API a una ruta de `/uploads`.
 *
 * El backend guarda rutas relativas a su propia raíz (`/uploads/reserva/servicios/10/x.png`),
 * pero la app se sirve desde otro dominio, así que tal cual no cargan. Se deja pasar sin tocar
 * lo que ya sea absoluto (`http…`, `data:`, `blob:`) para que una vista previa de un archivo
 * recién elegido funcione con el mismo binding que la imagen ya guardada.
 */
@Pipe({ name: 'urlArchivo', standalone: true })
export class UrlArchivoPipe implements PipeTransform {
  private readonly api = inject(ReservaApiService);

  transform(ruta: string | null | undefined): string | null {
    if (!ruta) return null;
    return /^(https?:|data:|blob:)/i.test(ruta) ? ruta : this.api.origenArchivos + ruta;
  }
}
