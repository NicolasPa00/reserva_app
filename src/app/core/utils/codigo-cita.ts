/** Los 8 caracteres del código nuevo, en el alfabeto Base32 de Crockford (sin I, L, O ni U). */
const RE_CODIGO = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

/**
 * Presenta el código de una cita: `K3M79QXP` → `K3M7-9QXP`.
 *
 * El guion no se guarda ni viaja a la API; es solo para el ojo, porque cuatro y cuatro se leen
 * y se dictan de un tirón y ocho seguidos no. Un código antiguo (UUID) se devuelve tal cual:
 * partirlo no lo haría más legible y sí lo haría irreconocible frente al que el cliente tiene
 * guardado en su enlace.
 *
 * El backend normaliza lo que reciba —mayúsculas, guiones, espacios— así que devolver esto
 * mismo en una consulta es válido; ver `app_reserva_api/services/codigoCita.js`.
 */
export function formatearCodigoCita(codigo: string | null | undefined): string {
  const c = String(codigo ?? '').trim().toUpperCase();
  if (!RE_CODIGO.test(c)) return String(codigo ?? '');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Un código antiguo, tal y como se pegaba desde el enlace de confirmación. */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo que el cliente teclea en «Mi cita», puesto en limpio mientras escribe.
 *
 * Sube a mayúsculas, tira lo que no sea alfanumérico y coloca el guion en su sitio, de forma
 * que escribir `k3m79qxp` o `k3m7 9qxp` acabe igual en los dos casos. El corte a 8 evita que
 * un pegado con basura alrededor arrastre caracteres de más.
 *
 * Un UUID completo se deja intacto: quitarle los guiones lo convertiría en otra cosa y esos
 * códigos siguen siendo válidos.
 */
export function normalizarEntradaCodigo(valor: string): string {
  const v = String(valor ?? '').trim();
  if (RE_UUID.test(v)) return v;

  const limpio = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  return limpio.length > 4 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio;
}
