/**
 * Adivina el país de quien mira la pantalla a partir de metadatos del navegador (zona horaria,
 * idioma), sin pedir permiso ni llamar a ningún servicio de geolocalización.
 *
 * ## Por qué no es exacto y no hace falta que lo sea
 *
 * Es solo el valor inicial de un selector que el usuario puede cambiar con un clic. Adivinar
 * bien el 90% de las veces y dejar el resto a un clic es mejor que forzar a todo el mundo a
 * elegir su país desde cero. Por eso primero se prueba con la zona horaria (más fiable: un
 * `Intl.DateTimeFormat` no miente sobre en qué huso está el reloj del sistema) y solo si no
 * reconoce ninguna se cae al idioma del navegador (`es-CL`, `en-MX`…).
 */
const ZONA_A_PAIS: Record<string, string> = {
  'America/Bogota': 'CO',
  'America/Santiago': 'CL',
  'America/Punta_Arenas': 'CL',
  'America/Lima': 'PE',
  'America/Guayaquil': 'EC',
  'America/Mexico_City': 'MX',
  'America/Tijuana': 'MX',
  'America/Cancun': 'MX',
  'America/Monterrey': 'MX',
  'America/Merida': 'MX',
  'America/Chihuahua': 'MX',
  'America/Hermosillo': 'MX',
  'America/Mazatlan': 'MX',
  'America/Matamoros': 'MX',
  'America/Ojinaga': 'MX',
  'America/Bahia_Banderas': 'MX',
};

/**
 * @param soportados Los códigos que la plataforma sabe atender (del catálogo del backend). Un
 *   país detectado que la plataforma no soporta no sirve de nada: mejor `null` y que decida el
 *   que llama (el país del negocio, o 'CO').
 */
export function paisPorMetadatos(soportados: readonly string[]): string | null {
  try {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const porZona = zona ? ZONA_A_PAIS[zona] : undefined;
    if (porZona && soportados.includes(porZona)) return porZona;
  } catch {
    // Intl sin zona fiable: se sigue con el idioma.
  }

  try {
    const idioma = typeof navigator !== 'undefined' ? navigator.language : '';
    const region = idioma.split('-')[1]?.toUpperCase();
    if (region && soportados.includes(region)) return region;
  } catch {
    // Sin `navigator` (no debería llegar aquí: quien llama ya comprobó que es browser).
  }

  return null;
}
