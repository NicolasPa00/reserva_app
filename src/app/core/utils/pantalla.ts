/** Ancho a partir del cual el modal deja de ser ventana y pasa a hoja inferior (ver modal.ts). */
const ANCHO_HOJA = 640;

/**
 * ¿El modal se está viendo como hoja de móvil?
 *
 * Decide quién puede cerrarse tocando fuera. En escritorio no: el fondo rodea una ventana por
 * la que el ratón pasa todo el rato, y un clic despistado —o soltar ahí una selección de
 * texto— borraba un formulario a medio llenar sin preguntar ni dejar deshacer. En móvil el
 * modal es una hoja que sube desde abajo y tocar la zona oscura de arriba es EL gesto para
 * descartarla; quitarlo se sentiría roto.
 *
 * Se consulta en el momento del clic y no en un `signal`: lo que importa es cómo se ve el
 * modal justo cuando lo tocan, y así un cambio de tamaño de ventana no deja el criterio viejo.
 *
 * Devuelve `false` sin `window` (SSR): en el servidor nadie hace clic.
 */
export function esHojaMovil(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(`(max-width: ${ANCHO_HOJA}px)`).matches;
}
