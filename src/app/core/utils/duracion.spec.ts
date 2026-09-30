import { describe, expect, it } from 'vitest';
import { duracionLegible, ventanaEnMinutos } from './duracion';

describe('duracionLegible', () => {
  it('escribe minutos y horas como una persona', () => {
    expect(duracionLegible(15)).toBe('15 minutos');
    expect(duracionLegible(60)).toBe('1 hora');
    expect(duracionLegible(4320)).toBe('72 horas');
    expect(duracionLegible(90)).toBe('1 h 30 min');
  });
});

describe('ventanaEnMinutos', () => {
  it('prefiere los minutos y traduce las horas de un backend anterior', () => {
    expect(ventanaEnMinutos({ ventana_cancelacion_min: 30, ventana_cancelacion_horas: 1 })).toBe(30);
    expect(ventanaEnMinutos({ ventana_cancelacion_horas: 4 })).toBe(240);
    expect(ventanaEnMinutos(null)).toBeNull();
  });
});
