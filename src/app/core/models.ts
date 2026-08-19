// ────────────────────── Tipos compartidos ──────────────────────
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: { code?: string; [k: string]: unknown }[] | unknown;
}

export interface UsuarioReserva {
  id_usuario: number;
  nombre_completo: string;
  primer_nombre: string;
  primer_apellido: string;
  email: string;
}

export interface PermisoVista {
  id_nivel: number;
  vista: string;
  url: string;
  roles: string[];
  puede_ver: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

export interface PaletaColor {
  id_paleta: number;
  nombre: string;
  colores: Record<string, string>;
}

export interface NegocioReserva {
  id_negocio: number;
  nombre: string;
  tipo_negocio: string | null;
  paleta: PaletaColor | null;
  roles: { id_rol: number; descripcion: string }[];
  permisos_vista: PermisoVista[];
  permisos_subnivel: unknown[];
}

export interface SesionReserva {
  usuario: UsuarioReserva;
  permisos_cargados: boolean;
  negocios: NegocioReserva[];
  negocio: NegocioReserva | null;
  roles: { id_rol: number; descripcion: string }[];
  permisos_vista?: PermisoVista[];
  roles_globales: { id_rol: number; descripcion: string }[];
  plan_activo?: boolean;
}

// ────────────────────── Entidades del dominio reserva ──────────────────────

export type EstadoCita = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show';
export type PagoEstado = 'no_aplica' | 'pendiente_validacion' | 'aprobado' | 'rechazado';

export interface Servicio {
  id_servicio: number;
  id_negocio: number;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  precio: number;
  color_hex: string | null;
  imagen_url: string | null;
  estado: 'A' | 'I';
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export interface Profesional {
  id_profesional: number;
  id_negocio: number;
  id_usuario: number | null;
  nombre: string;
  especialidad: string | null;
  telefono: string | null;
  email: string | null;
  foto_url: string | null;
  color_hex: string | null;
  estado: 'A' | 'I';
  servicios?: Servicio[];
}

export interface Horario {
  id_horario?: number;
  id_negocio: number;
  id_profesional: number | null;
  dia_semana: number; // 0=Dom..6=Sab
  hora_inicio: string;
  hora_fin: string;
}

export interface Bloqueo {
  id_bloqueo: number;
  id_negocio: number;
  id_profesional: number | null;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
}

/**
 * Un servicio dentro de una cita, tal y como lo devuelve el backend.
 *
 * Antes esta interfaz declaraba `{ nombre, precio, duracion_min }` — la forma del *catálogo* de
 * servicios, no la de una cita— y las plantillas pintaban esos campos: el nombre salía vacío y la
 * duración era un «min» suelto sin número. TypeScript no lo vio porque la respuesta HTTP se
 * declara con un tipo, no se valida contra él.
 *
 * Los nombres con `_snapshot` no son un capricho del backend: son el precio y la duración **del
 * momento en que se reservó**, congelados a propósito para que subir la tarifa mañana no reescriba
 * lo que ya se cobró. Por eso se refleja la forma real aquí en vez de aplanarla en el servidor.
 */
export interface CitaServicioDetalle {
  id_servicio: number;
  precio_snapshot: number | string;
  duracion_snapshot_min: number;
  servicio?: { id_servicio: number; nombre: string };
}

export interface Cita {
  id_cita: number;
  id_negocio: number;
  id_profesional: number;
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
  estado: EstadoCita;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  notas: string | null;
  codigo_publico: string;
  requiere_pago: boolean;
  monto_total: number;
  pago_estado: PagoEstado;
  comprobante_pago_url?: string | null;
  pago_rechazo_motivo?: string | null;
  cancelado_por?: 'cliente' | 'negocio' | null;
  cancelado_motivo?: string | null;
  profesional?: Pick<Profesional, 'id_profesional' | 'nombre' | 'foto_url' | 'color_hex' | 'especialidad'>;
  servicios?: CitaServicioDetalle[];
  negocio?: { id_negocio: number; nombre: string };
}

export interface ConfigReserva {
  id_negocio: number;
  anticipacion_min_horas: number;
  buffer_limpieza_min: number;
  ventana_cancelacion_horas: number;
  paso_slot_min: number;
  cobro_adelantado: boolean;
  instrucciones_pago: string | null;
}

export interface Slot {
  hora: string;       // "HH:MM"
  disponible: boolean;
  motivo?: string;
}

export interface DisponibilidadResponse {
  fecha: string;
  duracion_servicio_min: number;
  buffer_min: number;
  paso_slot_min: number;
  slots: Slot[];
}

export interface InfoNegocioPublico {
  id_negocio: number;
  nombre: string;
  email_contacto: string | null;
  paleta: PaletaColor | null;
  cobro_adelantado: boolean;
  instrucciones_pago: string | null;
  anticipacion_min_horas: number;
  ventana_cancelacion_horas: number;
}

export interface ResumenDashboard {
  citas_hoy: number;
  citas_confirmadas: number;
  citas_pendientes: number;
  ingresos_hoy: number;
  total_servicios: number;
  total_profesionales: number;
  pagos_pendientes_validacion: number;
}
