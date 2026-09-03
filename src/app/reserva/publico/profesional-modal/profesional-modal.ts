import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

import { VitrinaStore } from '../vitrina.store';
import { UrlArchivoPipe } from '../../../shared/url-archivo.pipe';
import { ModalComponent } from '../../../shared/modal/modal';
import { rangoHora12 } from '../../../core/utils/hora';
import { colorDeEntidad } from '../../../core/utils/color-entidad';

/**
 * Ficha de un profesional: qué hace y cuándo atiende.
 *
 * ## Por qué es un componente y no dos bloques parecidos
 *
 * Se abre desde dos sitios —la tarjeta del equipo en la portada y el botón de información
 * junto a cada nombre en la agenda de un servicio— y en ambos responde a la misma pregunta:
 * «¿quién es esta persona y cuándo puedo verla?». Duplicar la plantilla habría garantizado que
 * una de las dos se quedara atrás en el primer cambio.
 *
 * Recibe solo el **id**: los datos salen del store, que ya tiene la vitrina cargada. Así el
 * llamante no tiene que arrastrar el objeto completo, y en la agenda —donde los profesionales
 * llegan recortados, sin horario ni servicios— basta con el id que sí trae.
 */
@Component({
  selector: 'reserva-profesional-modal',
  standalone: true,
  imports: [LucideAngularModule, CurrencyPipe, ModalComponent, UrlArchivoPipe],
  templateUrl: './profesional-modal.html',
  styleUrl: './profesional-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfesionalModalComponent {
  private readonly store = inject(VitrinaStore);

  /** `null` cierra el modal. Evita un segundo input de «abierto» que pudiera desincronizarse. */
  readonly idProfesional = input<number | null>(null);
  readonly cerrar = output<void>();

  readonly profesional = computed(() => {
    const id = this.idProfesional();
    return id == null ? null : this.store.profesionalPorId(id) ?? null;
  });

  readonly servicios = computed(() => {
    const p = this.profesional();
    if (!p) return [];
    return p.id_servicios
      .map(id => this.store.servicioPorId(id))
      .filter(s => !!s)
      .sort((a, b) => a!.nombre.localeCompare(b!.nombre));
  });

  /** Solo los días que trabaja: cuatro filas de «Cerrado» ocupan sin informar. */
  readonly dias = computed(() => this.profesional()?.horario.filter(d => d.abierto) ?? []);

  /** Horas semanales, para dar una idea de la disponibilidad sin sumar las franjas a ojo. */
  readonly horasSemana = computed(() => {
    const minutos = this.dias().reduce((total, d) =>
      total + d.franjas.reduce((acc, f) => {
        const [hi, mi] = f.hora_inicio.split(':').map(Number);
        const [hf, mf] = f.hora_fin.split(':').map(Number);
        return acc + ((hf * 60 + mf) - (hi * 60 + mi));
      }, 0), 0);
    return Math.round(minutos / 60);
  });

  franjas(dia: { franjas: { hora_inicio: string; hora_fin: string }[] }): string {
    return dia.franjas.map(f => rangoHora12(f.hora_inicio, f.hora_fin)).join(' · ');
  }

  /** Color estable del profesional, derivado de su id. Ver `colorDeEntidad`. */
  colorPro(id: number | null | undefined): string {
    return colorDeEntidad(id);
  }

}
