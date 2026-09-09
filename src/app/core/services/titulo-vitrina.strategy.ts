import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { VitrinaStore } from '../../reserva/publico/vitrina.store';

/** Lo que se ve mientras no hay ni ruta con título ni negocio cargado. */
const BASE = 'EscalApp · Reservas';

/**
 * Antepone el nombre del negocio al título de la pestaña en el portal público.
 *
 * La estrategia por defecto de Angular pinta el `title` de la ruta y se acabó: todos los
 * portales quedaban como «Reserva tu cita», sin decir de quién. Con varias pestañas abiertas
 * —que es justo lo que hace quien compara dos salones— no se distinguen.
 *
 * Se resuelve aquí y no en el shell porque el título depende de **dos** cosas que cambian por
 * su cuenta: la ruta activa (portada, ficha de servicio, «Mi cita») y el nombre del negocio,
 * que llega después con la vitrina. Un `effect` sobre ambas señales recompone el título cuando
 * cualquiera de las dos se mueve, sin que cada vista tenga que acordarse de hacerlo.
 *
 * La consola interna no lleva prefijo: ahí el negocio es el propio, no hace falta repetirlo.
 */
@Injectable({ providedIn: 'root' })
export class TituloVitrinaStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly store = inject(VitrinaStore);

  /** Título declarado por la ruta activa («Reserva tu cita», «Mi cita»…). */
  private readonly deRuta = signal<string | null>(null);
  /** Si la navegación actual es del portal público (`/p/:id_negocio`). */
  private readonly enPortal = signal(false);

  constructor() {
    super();
    effect(() => {
      const ruta = this.deRuta();
      const nombre = this.enPortal() ? this.store.negocio()?.nombre?.trim() : null;
      this.title.setTitle([nombre, ruta].filter(Boolean).join(' | ') || BASE);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.deRuta.set(this.buildTitle(snapshot) ?? null);
    this.enPortal.set(snapshot.url.startsWith('/p/'));
  }
}
