/**
 * Color estable para distinguir entidades en la interfaz (columnas de la agenda, puntos de
 * profesional, avatares sin foto).
 *
 * ## Por qué se deriva y no se guarda
 *
 * Antes cada profesional tenía un `color_hex` que se editaba a mano. En la práctica nadie lo
 * cambiaba: todos acababan con el verde por defecto, así que las columnas de la agenda salían
 * del mismo color y no distinguían nada — justo lo contrario de para lo que estaba. Y sumaba
 * un campo más al formulario que competía con la paleta de marca del negocio.
 *
 * Derivándolo del id se obtiene lo que de verdad se buscaba: colores **distintos entre sí** y
 * **estables** (el mismo profesional sale siempre igual, en la agenda y en los informes), sin
 * que nadie tenga que decidir nada.
 *
 * ## Por qué esta paleta
 *
 * Doce tonos bien separados en la rueda, todos oscuros y saturados por igual para que ninguno
 * destaque más que los demás por accidente y todos aguanten texto blanco encima. No salen de
 * `--color-primary`: aquí el color **identifica**, no decora, y teñirlos con la marca los
 * volvería variaciones del mismo tono, que es exactamente lo que hay que evitar.
 */
const PALETA = [
  '#4F46E5', // índigo
  '#0F766E', // teal
  '#B45309', // ámbar oscuro
  '#BE123C', // rosa
  '#15803D', // verde
  '#1D4ED8', // azul
  '#7E22CE', // violeta
  '#C2410C', // naranja
  '#0E7490', // cian
  '#A21CAF', // fucsia
  '#4D7C0F', // lima oscuro
  '#9F1239', // vino
];

/**
 * @param id  identificador de la entidad. `null`/`undefined` devuelve el primero, que es un
 *   color válido: nunca se devuelve vacío para no dejar un punto o una barra sin pintar.
 */
export function colorDeEntidad(id: number | null | undefined): string {
  if (id == null) return PALETA[0];
  // `Math.abs` por si algún id llegara negativo; el módulo de un negativo daría índice inválido.
  return PALETA[Math.abs(Math.trunc(id)) % PALETA.length];
}
