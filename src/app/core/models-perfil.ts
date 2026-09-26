/**
 * Tipos de los perfiles de rubro (salón, spa, estética, tatuaje, mascotas, alojamiento).
 *
 * Viven aparte de `models.ts` porque son una capa encima del módulo de siempre: una barbería
 * (perfil BASE) no usa ninguno y su sesión puede no traerlos. Ver
 * `admin_ws/docs/perfiles-de-reserva.md`.
 */

export type ClavePerfil = 'BASE' | 'SALON' | 'SPA' | 'ESTETICA' | 'TATUAJE' | 'MASCOTAS' | 'ALOJAMIENTO';

export type Funcion =
  | 'tiempo_proceso'
  | 'variantes'
  | 'a_cotizar'
  | 'deposito'
  | 'ficha'
  | 'consentimiento'
  | 'recursos'
  | 'mascotas'
  | 'portafolio'
  | 'estancias';

export type ModoReserva = 'CITA' | 'ESTANCIA';

export interface Terminos {
  profesional: string;
  profesionales: string;
  servicio: string;
  servicios: string;
  cita: string;
  citas: string;
  cliente: string;
  clientes: string;
}

export type ClaveTermino = keyof Terminos;

/** El perfil del negocio tal como viaja en la sesión (ver `perfiles/definiciones.js`). */
export interface PerfilReserva {
  clave: ClavePerfil;
  rubro: { nombre: string; etiqueta: string; icono: string | null } | null;
  modos: ModoReserva[];
  funciones: Funcion[];
  terminos: Terminos;
  icono_servicios: string;
  portal: { titulo: string; subtitulo: string };
  vistas: string[];
}

/** Una función en Configuración → Funciones. */
export interface FuncionConfig {
  clave: Funcion;
  etiqueta: string;
  descripcion: string;
  activa: boolean;
  fija: boolean;
  de_fabrica: boolean;
}

export const TERMINOS_BASE: Terminos = {
  profesional: 'Profesional',
  profesionales: 'Profesionales',
  servicio: 'Servicio',
  servicios: 'Servicios',
  cita: 'Cita',
  citas: 'Citas',
  cliente: 'Cliente',
  clientes: 'Clientes',
};

/**
 * El perfil que se usa cuando la sesión no trae ninguno: la barbería de siempre. Las sesiones
 * guardadas en el navegador antes de los perfiles llegan así, y no deben cambiar nada.
 */
export const PERFIL_BASE: PerfilReserva = {
  clave: 'BASE',
  rubro: null,
  modos: ['CITA'],
  funciones: [],
  terminos: TERMINOS_BASE,
  icono_servicios: 'scissors',
  portal: { titulo: 'Reserva tu cita', subtitulo: 'Elige el servicio y la hora que mejor te queden.' },
  vistas: [],
};

// ── Servicios ──

export interface VarianteServicio {
  id_variante?: number;
  nombre: string;
  clave?: string | null;
  duracion_min: number;
  precio: number | string;
  orden?: number;
}

export interface TipoRecurso {
  id_tipo_recurso: number;
  nombre: string;
  descripcion: string | null;
  recursos: { id_recurso: number; nombre: string }[];
  servicios?: { id_servicio: number; nombre: string }[];
}

// ── Mascotas y ficha ──

export type Especie = 'PERRO' | 'GATO' | 'OTRO';
export type Tamano = 'PEQUENO' | 'MEDIANO' | 'GRANDE' | 'GIGANTE';

export const TAMANOS: { clave: Tamano; etiqueta: string }[] = [
  { clave: 'PEQUENO', etiqueta: 'Pequeño' },
  { clave: 'MEDIANO', etiqueta: 'Mediano' },
  { clave: 'GRANDE', etiqueta: 'Grande' },
  { clave: 'GIGANTE', etiqueta: 'Gigante' },
];

export const ESPECIES: { clave: Especie; etiqueta: string }[] = [
  { clave: 'PERRO', etiqueta: 'Perro' },
  { clave: 'GATO', etiqueta: 'Gato' },
  { clave: 'OTRO', etiqueta: 'Otro' },
];

export interface Mascota {
  id_mascota: string;
  id_negocio: number;
  id_persona_negocio: string;
  nombre: string;
  especie: Especie;
  raza: string | null;
  tamano: Tamano | null;
  peso_kg: number | string | null;
  fecha_nacimiento: string | null;
  sexo: 'M' | 'H' | null;
  comportamiento: string | null;
  notas: string | null;
  foto_url: string | null;
  /** Solo en el listado de la vista Mascotas. */
  dueno_nombre?: string | null;
  dueno_telefono?: string | null;
  ultima_visita?: string | null;
  visitas?: number;
}

export type TipoFicha = 'NOTA' | 'FORMULA' | 'CONTRAINDICACION' | 'CONSENTIMIENTO' | 'VACUNA' | 'REFERENCIA';

export const TIPOS_FICHA: { clave: TipoFicha; etiqueta: string; icono: string }[] = [
  { clave: 'NOTA', etiqueta: 'Nota', icono: 'notebook-pen' },
  { clave: 'FORMULA', etiqueta: 'Fórmula', icono: 'palette' },
  { clave: 'CONTRAINDICACION', etiqueta: 'Contraindicación', icono: 'triangle-alert' },
  { clave: 'CONSENTIMIENTO', etiqueta: 'Consentimiento', icono: 'shield-check' },
  { clave: 'VACUNA', etiqueta: 'Vacuna', icono: 'syringe' },
  { clave: 'REFERENCIA', etiqueta: 'Referencia', icono: 'image' },
];

export interface FichaEntrada {
  id_ficha: number;
  id_persona_negocio: string;
  id_mascota: string | null;
  id_cita: number | null;
  tipo: TipoFicha;
  titulo: string | null;
  contenido: string | null;
  tiene_archivo: boolean;
  vence_en: string | null;
  autor: string | null;
  mascota: string | null;
  fecha_creacion: string;
}

export interface PortafolioImagen {
  id_imagen: number;
  url: string;
  descripcion: string | null;
  orden: number;
}

export interface CatalogoVistaPrevia {
  perfil: ClavePerfil;
  categorias: { categoria: string; servicios: string[] }[];
  total_servicios: number;
  unidades: { nombre: string; unidades: number }[];
}

export interface PoliticaPago {
  modo: 'ninguno' | 'abono' | 'total';
  porcentaje: number;
  reembolsable: boolean;
}

// ── Estancias ──

export type EstadoEstancia = 'pendiente' | 'confirmada' | 'en_curso' | 'finalizada' | 'cancelada' | 'no_show';

export interface TarifaTemporada {
  id_tarifa?: number;
  nombre: string;
  desde: string;
  hasta: string;
  precio_noche: number | string;
  min_noches: number | null;
}

export interface CalendarioExterno {
  id_calendario: number;
  nombre: string;
  url_ical: string;
  ultima_sincronizacion: string | null;
  ultimo_error: string | null;
}

export interface Unidad {
  id_unidad: number;
  id_unidad_tipo: number;
  nombre: string;
  notas: string | null;
  ical_token: string;
  orden: number;
  calendarios?: CalendarioExterno[];
}

export interface UnidadTipo {
  id_unidad_tipo: number;
  nombre: string;
  descripcion: string | null;
  ocupacion_base: number;
  capacidad_max: number;
  tarifa_base: number | string;
  tarifa_fin_semana: number | string | null;
  tarifa_persona_extra: number | string;
  min_noches: number;
  comodidades: string[];
  imagen_url: string | null;
  orden: number;
  unidades?: Unidad[];
  temporadas?: TarifaTemporada[];
}

export interface NocheCotizada {
  fecha: string;
  precio: number;
  temporada?: string | null;
}

export interface DisponibilidadEstancia {
  id_unidad_tipo: number;
  nombre: string;
  descripcion: string | null;
  capacidad_max: number;
  ocupacion_base: number;
  imagen_url: string | null;
  comodidades: string[];
  libres: number;
  unidades_libres?: { id_unidad: number; nombre: string }[];
  disponible: boolean;
  motivo: string | null;
  total: number | null;
  noches: NocheCotizada[];
  min_noches: number;
}

export interface CargoEstancia {
  id_cargo: number;
  concepto: string;
  valor: number | string;
  fecha: string;
}

export interface PagoEstancia {
  id_movimiento: number;
  tipo: 'INGRESO' | 'EGRESO';
  monto: number;
  concepto: string;
  fecha: string;
  metodo: string | null;
}

export interface Estancia {
  id_estancia: number;
  id_negocio: number;
  id_unidad: number;
  id_unidad_tipo: number;
  fecha_entrada: string;
  fecha_salida: string;
  estado: EstadoEstancia;
  huespedes: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_documento: string | null;
  id_persona_negocio: string | null;
  id_mascota: string | null;
  notas: string | null;
  codigo_publico: string;
  detalle_noches: NocheCotizada[];
  monto_total: number | string;
  monto_abono: number | string | null;
  requiere_pago: boolean;
  pago_estado: 'no_aplica' | 'pendiente_validacion' | 'aprobado' | 'rechazado';
  comprobante_pago_url: string | null;
  checkin_en: string | null;
  checkout_en: string | null;
  cancelado_por: string | null;
  cancelado_motivo: string | null;
  origen: string;
  noches: number;
  unidad?: { id_unidad: number; nombre: string };
  tipo?: { id_unidad_tipo: number; nombre: string; capacidad_max: number };
  mascota?: { id_mascota: string; nombre: string; especie: string; raza: string | null; tamano: string | null } | null;
  // Solo en el detalle:
  cargos?: CargoEstancia[];
  pagos?: PagoEstancia[];
  total_cargos?: number;
  total?: number;
  pagado?: number;
  saldo?: number;
}

export interface OcupacionTablero {
  desde: string;
  hasta: string;
  unidades: { id_unidad: number; nombre: string; id_unidad_tipo: number; tipo: string }[];
  estancias: {
    id_estancia: number; id_unidad: number; fecha_entrada: string; fecha_salida: string;
    estado: EstadoEstancia; cliente_nombre: string; huespedes: number; pago_estado: string; codigo_publico: string;
  }[];
  bloqueos: {
    id_bloqueo: number; id_unidad: number; fecha_desde: string; fecha_hasta: string;
    motivo: string | null; origen: 'manual' | 'ical'; calendario: string | null;
  }[];
}

export interface ResumenEstanciasDia {
  fecha: string;
  llegadas: Estancia[];
  salidas: Estancia[];
  en_casa: number;
  unidades: number;
  ocupadas: number;
  ocupacion_pct: number;
  pendientes_pago: number;
}

export interface InformeEstancias {
  desde: string;
  hasta: string;
  estancias: number;
  noches_vendidas: number;
  noches_disponibles: number;
  ocupacion_pct: number;
  tarifa_media: number;
  venta_noches: number;
  ingresos_caja: number;
}

/** Tipo de unidad tal como lo muestra el portal. */
export interface UnidadTipoPublica {
  id_unidad_tipo: number;
  nombre: string;
  descripcion: string | null;
  ocupacion_base: number;
  capacidad_max: number;
  tarifa_base: number;
  tarifa_fin_semana: number | null;
  tarifa_persona_extra: number;
  min_noches: number;
  comodidades: string[];
  imagen_url: string | null;
}

/** Una estancia tal como la ve el huésped en «Mi reserva». */
export interface EstanciaPublica {
  tipo: 'estancia';
  id_estancia: number;
  codigo_publico: string;
  estado: EstadoEstancia;
  pago_estado: string;
  requiere_pago: boolean;
  fecha_entrada: string;
  fecha_salida: string;
  huespedes: number;
  cliente_nombre: string;
  unidad_tipo: string | null;
  noches: number;
  detalle_noches: NocheCotizada[];
  monto_total: number;
  monto_abono: number | null;
  mascota: { nombre: string } | null;
  negocio?: { id_negocio: number; nombre: string };
}
