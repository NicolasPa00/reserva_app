import { describe, expect, it } from 'vitest';
import { formatearMontoEditable, parsearMonto } from './monto';

const COP = { decimales: 0, locale: 'es-CO' };
const PEN = { decimales: 2, locale: 'es-PE' };
const USD = { decimales: 2, locale: 'en-US' };

describe('parsearMonto', () => {
  it('entiende los miles con punto o coma en pesos', () => {
    expect(parsearMonto('100.000', COP)).toBe(100000);
    expect(parsearMonto('1.500.000', COP)).toBe(1500000);
    expect(parsearMonto('50,000', COP)).toBe(50000);
    expect(parsearMonto('$ 80.000', COP)).toBe(80000);
    expect(parsearMonto('0', COP)).toBe(0);
    expect(parsearMonto('25000', COP)).toBe(25000);
  });

  it('redondea los céntimos que no existen en pesos', () => {
    expect(parsearMonto('1.500,50', COP)).toBe(1501);
  });

  it('respeta los decimales donde la moneda los tiene', () => {
    expect(parsearMonto('12,5', PEN)).toBe(12.5);
    expect(parsearMonto('1.234,56', PEN)).toBe(1234.56);
    expect(parsearMonto('1,234.56', USD)).toBe(1234.56);
    expect(parsearMonto('1,500', USD)).toBe(1500);
  });

  it('vacío o sin dígitos es null', () => {
    expect(parsearMonto('', COP)).toBeNull();
    expect(parsearMonto('abc', COP)).toBeNull();
    expect(parsearMonto(null, COP)).toBeNull();
  });
});

describe('formatearMontoEditable', () => {
  it('reescribe con separadores del locale', () => {
    expect(formatearMontoEditable(1500000, COP)).toBe('1.500.000');
    expect(formatearMontoEditable(null, COP)).toBe('');
  });
});
