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

/**
 * Permiso de una **acción concreta** dentro de una vista.
 *
 * El `codigo` sale de la url del subnivel (`/citas/cancelar` → `citas_cancelar`) y es lo que se
 * consulta con `auth.puedeAccion(...)`. Existe porque «ve la vista o no la ve» no alcanza: la
 * recepcionista debe poder agendar y no cancelar, y con un solo interruptor hay que elegir entre
 * darle Citas entera o quitársela.
 */
export interface PermisoSubnivel {
  id_nivel: number;
  codigo: string;
  accion: string;
  id_nivel_padre: number | null;
  puede_ver: boolean;
}

/** Los dos colores que definen la identidad del negocio. El resto se deriva en el tema. */
export interface ColoresNegocio {
  primario: string;
  acento: string;
}

/** Identidad visual completa + catálogo de paletas para elegir. */
export interface MarcaNegocio {
  id_negocio: number;
  nombre: string;
  logo_url: string | null;
  banner_url: string | null;
  colores: ColoresNegocio | null;
  id_paleta: number | null;
  paletas: { id_paleta: number; nombre: string; colores: Record<string, string> }[];
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
  /** Identidad visual: viaja con la sesión para pintar el tema en el primer render. */
  logo_url?: string | null;
  colores?: ColoresNegocio | null;
  roles: { id_rol: number; descripcion: string }[];
  permisos_vista: PermisoVista[];
  permisos_subnivel: PermisoSubnivel[];
  /** Opcional: las sesiones guardadas antes de que el backend lo enviara no lo traen. */
  plan_activo?: boolean;
}

export interface SesionReserva {
  usuario: UsuarioReserva;
  permisos_cargados: boolean;
  negocios: NegocioReserva[];
  negocio: NegocioReserva | null;
  roles: { id_rol: number; descripcion: string }[];
  permisos_vista?: PermisoVista[];
  /** Respaldo de la raíz; la fuente buena es el `permisos_subnivel` del negocio activo. */
  permisos_subnivel?: PermisoSubnivel[];
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
  id_categoria: number | null;
  categoria?: { id_categoria: number; nombre: string; orden: number } | null;
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
  /** Cobro en mostrador. En multipago queda null y el detalle vive en `pagos`. */
  id_metodo_pago?: number | null;
  id_caja?: number | null;
  metodoPago?: { id_metodo_pago: number; nombre: string } | null;
  pagos?: { id_pago: number; id_metodo_pago: number; valor: number | string; metodoPago?: { nombre: string } }[];
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
  /** Liga cada cobro al profesional que prestó el servicio, para liquidarle al cerrar caja. */
  permite_cobro_profesional: boolean;
  /** Permite saldar una cita con varias formas de pago a la vez. */
  permite_multipago: boolean;
  /**
   * @deprecated Ya no decide nada: cobrar exige caja abierta siempre. La columna sigue en la
   * tabla, pero ni la UI la ofrece ni el backend la mira. Ver `cobroService`.
   */
  exige_caja_abierta?: boolean;
}

// ────────────────────── Usuarios y permisos ──────────────────────

export interface RolReserva {
  id_rol: number;
  descripcion: string;
  id_tipo_negocio: number | null;
}

export interface UsuarioNegocio {
  id_usuario: number;
  nombre_completo: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  num_identificacion: string;
  /** Opcional: quien inicia sesión es el documento, no el correo. */
  email: string | null;
  telefono: string | null;
  estado: 'A' | 'I';
  fecha_creacion: string;
  es_admin_principal: boolean;
  debe_cambiar_password: boolean;
  rol: { id_usuario_rol: number; id_rol: number; descripcion: string | null } | null;
  /** Ficha de agenda, cuando el usuario es un profesional que atiende citas. */
  profesional: { id_profesional: number; nombre: string; estado: 'A' | 'I' } | null;
}

/**
 * Una vista dentro de la matriz de permisos de un rol.
 *
 * `plantilla` es lo que el rol permite a nivel de plataforma (solo informativo: cambiarlo
 * afectaría a todos los negocios del vertical) y `puede_ver` es lo que este negocio concede,
 * que es lo único editable desde aquí.
 */
export interface AccionRol {
  id_nivel: number;
  codigo: string;
  accion: string;
  url: string;
  /** La plantilla del rol es el techo: si es `false`, la acción no se puede conceder aquí. */
  en_plantilla: boolean;
  puede_ver: boolean;
}

export interface PermisoModuloRol {
  id_nivel: number;
  modulo: string;
  url: string | null;
  icono: string | null;
  plantilla: {
    puede_ver: boolean;
    puede_crear: boolean;
    puede_editar: boolean;
    puede_eliminar: boolean;
  };
  puede_ver: boolean;
  /** Operaciones que se pueden conceder o quitar dentro de esta vista. */
  acciones: AccionRol[];
}

export interface PermisosRol {
  id_rol: number;
  descripcion: string;
  /** Sin ajustes propios el negocio hereda la plantilla; se avisa para que se entienda. */
  hereda_plantilla: boolean;
  modulos: PermisoModuloRol[];
}

export interface UsuarioPayload {
  primer_nombre: string;
  segundo_nombre?: string | null;
  primer_apellido: string;
  segundo_apellido?: string | null;
  num_identificacion: string;
  /** Dato de contacto, no credencial. `null` = sin correo. */
  email: string | null;
  telefono?: string | null;
  id_rol: number;
  password?: string | null;
  /** Al crear un PROFESIONAL: enlazar una ficha existente en vez de crear otra. */
  id_profesional?: number | null;
  especialidad?: string | null;
}

// ────────────────────── Caja y formas de pago ──────────────────────

export interface MetodoPago {
  id_metodo_pago: number;
  id_negocio: number;
  nombre: string;
  orden: number;
  estado: 'A' | 'I';
}

/** Una línea del desglose multipago. En pago simple no se usa. */
export interface PagoLinea {
  id_metodo_pago: number;
  valor: number;
}

export interface MovimientoCaja {
  id_movimiento: number;
  id_caja: number;
  tipo: 'INGRESO' | 'EGRESO';
  monto: number | string;
  concepto: string | null;
  fecha: string;
  cita?: { id_cita: number; cliente_nombre: string } | null;
  profesional?: { id_profesional: number; nombre: string; color_hex: string | null } | null;
  metodoPago?: { id_metodo_pago: number; nombre: string } | null;
  usuario?: { id_usuario: number; primer_nombre: string; primer_apellido: string } | null;
}

export interface CajaTotales {
  apertura: number;
  ingresos: number;
  egresos: number;
  esperado: number;
  movimientos: number;
}

export interface DesgloseMetodo {
  id_metodo_pago: number | null;
  nombre: string;
  total: number;
  movimientos: number;
}

/** Lo que hay que liquidarle a cada profesional al cerrar el turno. */
export interface DesgloseProfesional {
  id_profesional: number;
  nombre: string;
  color_hex: string | null;
  especialidad: string | null;
  total: number;
  citas: number;
  efectivo: number;
  otros: number;
}

export interface EstadoCaja {
  abierta: boolean;
  caja: {
    id_caja: number;
    monto_apertura: number;
    fecha_apertura: string;
    observaciones: string | null;
    usuario: { id_usuario: number; nombre: string } | null;
  } | null;
  totales?: CajaTotales;
  permite_cobro_profesional?: boolean;
  por_metodo?: DesgloseMetodo[];
  por_profesional?: DesgloseProfesional[];
  movimientos?: MovimientoCaja[];
}

export interface CajaHistorial {
  id_caja: number;
  monto_apertura: number;
  monto_cierre: number | null;
  monto_reportado: number | null;
  diferencia: number | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  observaciones: string | null;
  usuario: string | null;
  ingresos: number;
  egresos: number;
  movimientos: number;
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

// ────────────────────── Informes ──────────────────────

/**
 * Dos criterios distintos conviven a propósito y conviene no confundirlos al pintarlos:
 * `ingresos` cuenta citas confirmadas **y** completadas (dinero comprometido, el mismo criterio
 * del dashboard), mientras que todo lo «realizado» cuenta solo las completadas.
 */
export interface InformeTotales {
  citas_totales: number;
  citas_activas: number;
  completadas: number;
  confirmadas: number;
  pendientes: number;
  canceladas: number;
  no_show: number;
  pagos_por_validar: number;
  ingresos: number;
  ingresos_completados: number;
  servicios_realizados: number;
  minutos_realizados: number;
  clientes_unicos: number;
  ticket_promedio: number;
  tasa_cancelacion: number;
  tasa_no_show: number;
}

export interface InformeDia {
  fecha: string;
  citas: number;
  completadas: number;
  canceladas: number;
  ingresos: number;
}

export interface InformeProfesional {
  id_profesional: number;
  nombre: string;
  especialidad: string | null;
  color_hex: string | null;
  citas: number;
  completadas: number;
  canceladas: number;
  no_show: number;
  servicios: number;
  ingresos: number;
  minutos: number;
  ticket_promedio: number;
}

export interface InformeServicio {
  id_servicio: number;
  nombre: string;
  veces: number;
  completados: number;
  ingresos: number;
  minutos: number;
}

export interface Informe {
  rango: { desde: string; hasta: string; dias: number };
  totales: InformeTotales;
  serie_dia: InformeDia[];
  por_profesional: InformeProfesional[];
  por_servicio: InformeServicio[];
  por_estado: { estado: EstadoCita; citas: number; monto: number }[];
  por_hora: { hora: number; citas: number }[];
  top_clientes: { nombre: string; telefono: string | null; citas: number; ingresos: number; ultima: string }[];
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

/**
 * Un día del calendario y si el negocio (o un profesional) atiende en él.
 *
 * Lo calcula el backend con la misma primitiva que decide qué se puede reservar
 * (`reglasAgenda.intervalosLaborales`), así que «abierto» aquí significa exactamente lo mismo
 * que al crear la cita. Reimplementar la regla en el cliente a partir de `Horario[]` habría
 * sido una tercera copia de algo que ya divergió dos veces.
 */
export interface DiaDisponible {
  fecha: string;                 // YYYY-MM-DD
  abierto: boolean;
  minutos: number;
  rangos: { inicio: string; fin: string }[];
}

/** Cita de hoy tal y como la resume el dashboard: lo justo para reconocerla de un vistazo. */
export interface CitaResumen {
  id_cita: number;
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
  estado: EstadoCita;
  cliente_nombre: string;
  cliente_telefono: string | null;
  monto_total: number;
  pago_estado: PagoEstado;
  requiere_pago: boolean;
  profesional: { id_profesional: number; nombre: string; color_hex: string | null } | null;
  servicios: string[];
}

export interface ResumenDashboard {
  fecha: string;

  citas_hoy: number;
  citas_confirmadas: number;
  citas_pendientes: number;
  ingresos_hoy: number;
  total_servicios: number;
  total_profesionales: number;
  pagos_pendientes_validacion: number;

  citas_completadas_hoy: number;
  citas_canceladas_hoy: number;

  /** `porcentaje` es `null` cuando no hay horario configurado: «no sé» ≠ «vacío». */
  ocupacion_hoy: {
    minutos_disponibles: number;
    minutos_ocupados: number;
    porcentaje: number | null;
  };

  semana: {
    citas: number;
    completadas: number;
    canceladas: number;
    no_show: number;
    ingresos: number;
  };

  agenda_hoy: CitaResumen[];
  top_servicios: { id_servicio: number; nombre: string; citas: number; ingresos: number }[];
}

// ────────────────────── Página pública del negocio ──────────────────────

export interface FranjaHoraria {
  hora_inicio: string;  // "HH:MM"
  hora_fin: string;
}

/**
 * Un día de la semana en el horario de atención.
 *
 * `abierto` lo decide el backend con la misma regla que la agenda (horario propio del
 * profesional para ese día y, si no tiene, el general del negocio), así que lo que se publica
 * aquí y lo que acepta la reserva no pueden divergir.
 */
export interface DiaHorario {
  dia_semana: number;   // 0=Dom..6=Sáb
  dia: string;
  franjas: FranjaHoraria[];
  abierto: boolean;
}

export interface ServicioPublico {
  id_servicio: number;
  nombre: string;
  descripcion: string | null;
  duracion_min: number;
  precio: number;
  color_hex: string | null;
  imagen_url: string | null;
  id_categoria: number | null;
  id_profesionales: number[];
}

export interface ProfesionalPublico {
  id_profesional: number;
  nombre: string;
  especialidad: string | null;
  foto_url: string | null;
  color_hex: string | null;
  /** Sin asignaciones en la base: ofrece el catálogo entero. */
  ofrece_todo: boolean;
  id_servicios: number[];
  horario: DiaHorario[];
}

export interface NegocioPublico {
  id_negocio: number;
  nombre: string;
  descripcion: string | null;
  logo_url: string | null;
  banner_url: string | null;
  colores: ColoresNegocio | null;
  paleta: PaletaColor | null;
  email_contacto: string | null;
  telefono: string | null;
  direccion: string | null;
  redes: {
    whatsapp: string | null;
    facebook: string | null;
    instagram: string | null;
  };
}

/** Todo lo que la portada pública necesita, en una sola respuesta. */
export interface Vitrina {
  negocio: NegocioPublico;
  reglas: {
    anticipacion_min_horas: number;
    ventana_cancelacion_horas: number;
    paso_slot_min: number;
    cobro_adelantado: boolean;
    instrucciones_pago: string | null;
  };
  horario_negocio: DiaHorario[];
  /** Plano, para buscar un servicio por id sin recorrer las secciones. */
  servicios: ServicioPublico[];
  /** El mismo catálogo agrupado por categoría, en el orden que fijó el negocio. */
  secciones: SeccionPublica[];
  profesionales: ProfesionalPublico[];
}

/** Lo que el dueño edita en Configuración → Página pública. */
export interface VitrinaEdicion {
  id_negocio: number;
  nombre: string;
  email_contacto: string | null;
  telefono: string | null;
  direccion: string | null;
  url_whatsapp: string | null;
  url_facebook: string | null;
  url_instagram: string | null;
  descripcion_publica: string | null;
  publico_activo: boolean;
}

/**
 * Cita tal y como la devuelven los endpoints públicos.
 *
 * **No es `Cita`.** `formatearCitaPublica` aplana el detalle (`precio_snapshot` →
 * `precio`, `duracion_snapshot_min` → `duracion_min`, `servicio.nombre` → `nombre`) y omite
 * todo lo interno: caja, método de pago, motivo de rechazo, quién canceló. Tipar la respuesta
 * pública como `Cita` haría creer que esos campos llegan, y llegan como `undefined`.
 */
export interface CitaPublica {
  id_cita: number;
  codigo_publico: string;
  estado: EstadoCita;
  pago_estado: PagoEstado;
  requiere_pago: boolean;
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  notas: string | null;
  monto_total: number;
  profesional?: { id_profesional: number; nombre: string; color_hex?: string | null } | null;
  servicios: { id_servicio: number; nombre: string; precio: number; duracion_min: number }[];
  negocio?: { id_negocio: number; nombre: string };
}

/** Categoría del catálogo: la sección en la que el portal agrupa los servicios. */
export interface CategoriaReserva {
  id_categoria: number;
  id_negocio: number;
  nombre: string;
  descripcion: string | null;
  orden: number;
  estado: 'A' | 'I';
  /** Solo lo devuelve el listado, para avisar de cuántos servicios quedarían sin categoría. */
  total_servicios?: number;
}

/**
 * Una sección del portal público: la categoría con sus servicios ya dentro.
 *
 * `id_categoria` es `null` en el grupo de servicios sin clasificar, que el backend añade al
 * final para que ninguno desaparezca por no tener categoría.
 */
export interface SeccionPublica {
  id_categoria: number | null;
  nombre: string;
  descripcion: string | null;
  servicios: ServicioPublico[];
}

/** Un día del calendario de un servicio: `id_profesionales` son los que atienden ese día. */
export interface DiaServicio {
  fecha: string;
  abierto: boolean;
  id_profesionales: number[];
}

/** Huecos de un día para un servicio, agrupados por quien lo presta. */
export interface SlotsServicio {
  fecha: string;
  duracion_min: number;
  profesionales: {
    id_profesional: number;
    nombre: string;
    especialidad: string | null;
    foto_url: string | null;
    color_hex: string | null;
    /** Solo horas libres, en "HH:MM" de 24 h. Vacío = ese día no atiende. */
    slots: string[];
  }[];
}

/**
 * Un cliente del negocio.
 *
 * No es una tabla del vertical: son `platform.persona_negocio`, la entidad de identidad
 * compartida cuya llave es `(negocio, teléfono)` y que nunca cruza inquilinos. El teléfono
 * llega siempre normalizado a E.164 ("+573001112233"), pase como pase por el formulario.
 */
export interface ClienteNegocio {
  id_persona_negocio: string;
  nombre: string | null;
  telefono: string;
  /** No vive con el cliente: es el de su cita más reciente que traía uno. */
  email: string | null;
  notas: string | null;
  etiquetas: string[];
  total_citas: number;
  citas_completadas: number;
  citas_canceladas: number;
  inasistencias: number;
  total_gastado: number;
  primera_cita: string | null;
  ultima_cita: string | null;
  creado_en: string;
}

export interface ClienteCita {
  id_cita: number;
  fecha_hora_inicio: string;
  fecha_hora_fin: string;
  estado: EstadoCita;
  monto_total: number | string;
  notas: string | null;
  profesional: string | null;
  servicios: string;
}

export interface ClientesPagina {
  total: number;
  clientes: ClienteNegocio[];
  puede_editar: boolean;
}
