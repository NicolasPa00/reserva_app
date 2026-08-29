import { Injectable } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';

/**
 * Bus de eventos in-app. Pensado para que features se enteren de cambios entre
 * sí sin acoplarse (ej: AgendaComponent escucha 'cita_creada' y se refresca).
 *
 * En el futuro se puede swap a WebSocket sin tocar consumidores.
 */
export type ReservaEventName =
  | 'cita_creada'
  | 'cita_actualizada'
  | 'cita_cancelada'
  // Una cita completada mueve dinero: la vista de Caja escucha esto para refrescar el turno
  // cuando el cobro se hizo desde Citas o desde la Agenda.
  | 'cita_cobrada'
  | 'cita_pago_aprobado'
  | 'cita_pago_rechazado'
  | 'servicio_actualizado'
  | 'profesional_actualizado'
  | 'horario_actualizado';

interface BusEvent<T = unknown> { type: ReservaEventName; payload: T; }

@Injectable({ providedIn: 'root' })
export class EventBusService {
  private readonly subject = new Subject<BusEvent>();

  publish<T>(type: ReservaEventName, payload: T): void {
    this.subject.next({ type, payload });
  }

  on<T>(type: ReservaEventName): Observable<T> {
    return this.subject.asObservable().pipe(
      filter((e): e is BusEvent<T> => e.type === type),
      map(e => e.payload as T),
    );
  }
}
