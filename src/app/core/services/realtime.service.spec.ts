import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { RealtimeService, parsearAvisoSse } from './realtime.service';
import { AuthService } from './auth.service';

/**
 * Avisos en vivo de la Agenda. Mismo servicio que en negocio_app (allí está la batería
 * completa); aquí lo que protege a reserva: leer el flujo sin romperse y que una ráfaga de
 * citas no se convierta en una consulta por cita.
 */
describe('parsearAvisoSse', () => {
  it('saca los temas de un aviso de cambio', () => {
    expect(parsearAvisoSse('event: cambio\ndata: {"temas":["agenda"]}')).toEqual(['agenda']);
  });

  it('ignora el latido y la confirmación de conexión', () => {
    expect(parsearAvisoSse(': latido')).toBeNull();
    expect(parsearAvisoSse('event: listo\ndata: {"canal":"reserva","id_negocio":10}')).toBeNull();
  });

  it('aguanta lo que venga mal sin lanzar', () => {
    expect(parsearAvisoSse('event: cambio\ndata: {roto')).toBeNull();
    expect(parsearAvisoSse('event: cambio')).toBeNull();
  });
});

describe('RealtimeService — reparto de recargas', () => {
  let rt: RealtimeService;

  const authStub = {
    // En falso para que no abra conexión: aquí se prueba el reparto.
    isAuthenticated: signal(false),
    negocio: signal<{ id_negocio: number } | null>(null),
    getAccessToken: () => null,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: authStub }] });
    rt = TestBed.inject(RealtimeService);
  });

  afterEach(() => vi.useRealTimers());

  const dejarPasarLaEspera = () => vi.advanceTimersByTime(1_000);

  it('junta una ráfaga de avisos en una sola recarga', () => {
    const recargar = vi.fn();
    rt.alCambiar(['agenda'], recargar);

    for (let i = 0; i < 5; i += 1) rt.refrescar(['agenda']);
    dejarPasarLaEspera();

    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('sin avisos no recarga nada (la Agenda no se toca si no llega nada)', () => {
    const recargar = vi.fn();
    rt.alCambiar(['agenda'], recargar);
    vi.advanceTimersByTime(60_000);
    expect(recargar).not.toHaveBeenCalled();
  });

  it('darse de baja deja de recibir', () => {
    const recargar = vi.fn();
    const baja = rt.alCambiar(['agenda'], recargar);
    baja();
    rt.refrescar(['agenda']);
    dejarPasarLaEspera();
    expect(recargar).not.toHaveBeenCalled();
  });
});
