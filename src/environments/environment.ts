export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/reserva',
  adminUrl: 'http://localhost:4002',
  /**
   * El botón «?» del encabezado, que abre el Centro de ayuda.
   *
   * Apagado en producción mientras el catálogo de tutoriales esté a medio grabar: un centro de
   * ayuda con tres videos y treinta y nueve módulos vacíos enseña que no hay nada, y eso es peor
   * que no enseñar nada. Se enciende aquí y se redespliega; del lado del servidor hace falta
   * además `AYUDA_PUBLICA=true` (ver `admin_ws/docs/centro-de-ayuda.md`).
   */
  ayudaHabilitada: true,
};
