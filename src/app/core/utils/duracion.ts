/**
 * Minutos como los dice una persona: «15 minutos», «1 hora», «24 horas», «1 h 30 min».
 *
 * La ventana de cancelación pasó a minutos (2026-09-29). Mismo criterio que
 * `admin_ws/app_reserva_api/services/duracionTexto.js`, para que el portal y los mensajes del
 * backend digan lo mismo.
 */
export function duracionLegible(minutos: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutos) || 0));
  if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  if (resto === 0) return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  return `${h} h ${resto} min`;
}

/**
 * La ventana de cancelación del portal, en minutos. Un backend anterior solo manda las horas:
 * se traducen para que la nota siga saliendo bien durante el despliegue.
 */
export function ventanaEnMinutos(
  reglas: { ventana_cancelacion_min?: number | null; ventana_cancelacion_horas?: number | null } | null | undefined,
): number | null {
  if (!reglas) return null;
  if (reglas.ventana_cancelacion_min != null) return Number(reglas.ventana_cancelacion_min);
  if (reglas.ventana_cancelacion_horas != null) return Number(reglas.ventana_cancelacion_horas) * 60;
  return null;
}
