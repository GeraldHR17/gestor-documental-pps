// src/composables/useNotificaciones.ts
//
// Mensajes de resultado (toasts) POSTERIORES a una acción. No confundir con
// los modales de confirmación PREVIA (ej. "¿Seguro que desea inactivar…?"):
// aquellos bloquean y preguntan antes; estos solo informan después, no
// bloquean y se descartan solos.
//
// El estado vive a nivel de módulo (mismo patrón singleton sin Pinia que
// useAutenticacion): cualquier vista publica y el único ToastContainer,
// montado en App.vue, es el que los pinta. Por eso un aviso publicado justo
// antes de navegar (ej. el cierre de sesión) sobrevive al cambio de ruta.

import { reactive, toRefs } from 'vue';

export type TipoNotificacion = 'exito' | 'error';

export interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  mensaje: string;
}

/** Tiempo en pantalla antes de descartarse solo. */
const DURACION_MS = 3500;

const estado = reactive<{ notificaciones: Notificacion[] }>({ notificaciones: [] });

let ultimoId = 0;

function descartar(id: number): void {
  const indice = estado.notificaciones.findIndex((notificacion) => notificacion.id === id);
  if (indice !== -1) {
    estado.notificaciones.splice(indice, 1);
  }
}

function publicar(tipo: TipoNotificacion, mensaje: string): number {
  const id = ++ultimoId;
  estado.notificaciones.push({ id, tipo, mensaje });
  setTimeout(() => descartar(id), DURACION_MS);
  return id;
}

/**
 * Texto real devuelto por el backend. El filtro global de excepciones
 * responde siempre con `{ mensaje }`, así que se prefiere ese texto
 * (ej. "El correo ya se encuentra registrado") sobre uno genérico; el
 * `mensajePorDefecto` solo aplica cuando no hubo respuesta del servidor
 * (caída de red o CORS), donde no hay nada más específico que decir.
 */
export function obtenerMensajeError(error: unknown, mensajePorDefecto: string): string {
  const conRespuesta = error as { response?: { data?: { mensaje?: string } } };
  return conRespuesta?.response?.data?.mensaje ?? mensajePorDefecto;
}

export function useNotificaciones() {
  function notificarExito(mensaje: string): void {
    publicar('exito', mensaje);
  }

  function notificarError(error: unknown, mensajePorDefecto: string): void {
    publicar('error', obtenerMensajeError(error, mensajePorDefecto));
  }

  return { ...toRefs(estado), notificarExito, notificarError, descartar };
}
