/**
 * Conversión de hora de 24 h a 12 h **solo para mostrar**.
 *
 * El backend habla siempre en `"HH:MM"` de 24 h —los slots, los rangos del horario laboral y el
 * `fecha_hora_inicio` que se envía al crear la cita— y así debe seguir: es un formato que se
 * ordena alfabéticamente, no depende del idioma y no tiene el caso ambiguo de las 12. Aquí se
 * traduce únicamente en el borde de la interfaz, que es donde el usuario lee.
 *
 * Por eso los componentes conservan el valor crudo en sus signals y llaman a esto en la
 * plantilla: si se guardara ya convertido, cualquier comparación (`slotElegido() === s.hora`) o
 * cualquier corte por franja (`hora.slice(0, 2) < 12`) dejaría de funcionar.
 */

/**
 * `"13:30"` → `"1:30 PM"`. Devuelve la entrada sin tocar si no tiene la forma esperada, para
 * que un dato raro se vea tal cual en vez de convertirse en `"NaN:NaN AM"`.
 */
export function aHora12(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return hhmm;

  const h = Number(m[1]);
  const min = m[2];
  if (!Number.isInteger(h) || h < 0 || h > 23) return hhmm;

  // Las 00:xx son 12:xx AM y las 12:xx son 12:xx PM: el 0 y el 12 son los dos casos que
  // siempre se escapan de un `h % 12` a secas.
  const sufijo = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${sufijo}`;
}

/** `"09:00"`, `"13:00"` → `"9:00 AM – 1:00 PM"`. */
export function rangoHora12(inicio: string, fin: string): string {
  return `${aHora12(inicio)} – ${aHora12(fin)}`;
}

/**
 * Parte una fecha-hora del backend en el día y la hora de pared de **Bogotá**.
 *
 * Hace falta para prellenar el formulario de edición: sus controles hablan en `YYYY-MM-DD` y
 * `"HH:MM"` locales del negocio, mientras que la cita llega como instante ISO. Se fija la zona
 * explícitamente en vez de usar la del navegador porque un equipo con el reloj en otro huso
 * —o un usuario mirando desde fuera del país— colocaría la cita en el día equivocado.
 */
function partesBogota(iso: string): Record<string, string> {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));

  return Object.fromEntries(partes.map(p => [p.type, p.value]));
}

/** Instante ISO → `"YYYY-MM-DD"` en hora de Bogotá. */
export function fechaBogota(iso: string): string {
  const p = partesBogota(iso);
  return `${p['year']}-${p['month']}-${p['day']}`;
}

/** Instante ISO → `"HH:MM"` de 24 h en hora de Bogotá, el formato que usan los slots. */
export function horaBogota(iso: string): string {
  const p = partesBogota(iso);
  // A medianoche `hour12: false` puede dar "24": se normaliza a "00".
  const h = p['hour'] === '24' ? '00' : p['hour'];
  return `${h}:${p['minute']}`;
}
