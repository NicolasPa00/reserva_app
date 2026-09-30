import { aHora12, horaBogota } from './hora';

describe('horaBogota', () => {
  it('convierte el instante UTC de la API a la hora de pared del negocio', () => {
    // Caso real: cita QWDA-BA3S agendada a las 3:30 p. m.; «Mi cita» mostraba 8:30 PM.
    expect(horaBogota('2026-09-30T20:30:00.000Z')).toBe('15:30');
    expect(aHora12(horaBogota('2026-09-30T20:30:00.000Z'))).toBe('3:30 PM');
  });

  it('respeta un instante que ya trae -05:00', () => {
    expect(horaBogota('2026-09-30T15:30:00-05:00')).toBe('15:30');
  });

  it('a medianoche da 00, no 24', () => {
    expect(horaBogota('2026-10-01T05:00:00.000Z')).toBe('00:00');
  });
});
