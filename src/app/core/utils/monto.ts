import { Moneda } from '../models';

/**
 * Montos escritos a mano, como los escribe la gente: «1.500.000», «50,000», «$ 80.000», «12,5».
 *
 * Existe porque `<input type="number">` no sirve para dinero aquí. En Colombia y Chile el punto
 * es separador de miles, y el campo numérico del navegador lo toma por decimal: «100.000» llegaba
 * como 100, y «1.500.000» o «50,000» son inválidos para él, así que `value` venía vacío. El botón
 * de guardar se quedaba apagado con el campo a la vista lleno, sin decir por qué.
 *
 * Reglas, en orden:
 * - Se quita todo lo que no sea dígito, punto, coma o signo.
 * - Con punto **y** coma, el último que aparece es el decimal y el otro, de miles.
 * - Con un solo tipo repetido («1.500.000»), es de miles.
 * - Con uno solo, una vez: si le siguen 3 dígitos y la moneda no usa decimales (COP, CLP), es
 *   de miles; si no, manda el separador decimal del locale de la moneda.
 *
 * Devuelve `null` si no queda un número.
 */
export function parsearMonto(raw: string | null | undefined, moneda: Pick<Moneda, 'decimales' | 'locale'>): number | null {
  let s = String(raw ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');
  let decimal: string | null = null;

  if (tienePunto && tieneComa) {
    decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  } else if (tienePunto || tieneComa) {
    const sep = tienePunto ? '.' : ',';
    const veces = s.split(sep).length - 1;
    const tras = s.length - s.lastIndexOf(sep) - 1;
    if (veces === 1) {
      if (tras === 3 && moneda.decimales === 0) decimal = null;
      else if (tras !== 3) decimal = sep;
      else decimal = sep === separadorDecimal(moneda.locale) ? sep : null;
    }
  }

  if (decimal) {
    const miles = decimal === '.' ? ',' : '.';
    s = s.split(miles).join('').replace(decimal, '.');
  } else {
    s = s.replace(/[.,]/g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** Math.max(0, moneda.decimales);
  return Math.round(n * factor) / factor;
}

/** El monto con separadores del locale y sin símbolo: lo que se deja escrito en el campo. */
export function formatearMontoEditable(n: number | null, moneda: Pick<Moneda, 'decimales' | 'locale'>): string {
  if (n == null || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat(moneda.locale || 'es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(0, moneda.decimales),
  }).format(n);
}

function separadorDecimal(locale: string): string {
  try {
    return new Intl.NumberFormat(locale || 'es-CO')
      .formatToParts(1.1).find(p => p.type === 'decimal')?.value ?? ',';
  } catch {
    return ',';
  }
}
