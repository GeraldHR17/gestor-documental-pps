// src/lib/portalPublico.config.ts
//
// Textos y formateadores del portal público. Viven aquí y no sueltos en
// las vistas para que el día que el PO quiera cambiar una palabra haya un
// solo sitio donde buscarla.

import { CODIGO_CATEGORIA_RAIZ_EXCLUIDA } from './documentos.config';

/** Título que el portal pone en `document.title`; se le antepone el de la vista. */
export const NOMBRE_DEL_PORTAL = 'Transparencia — Municipalidad de Palmares';

/** Mismo límite que trae el backend por defecto. */
export const LIMITE_POR_PAGINA = 20;

export const TEXTOS = {
  cargando: 'Cargando la información...',
  reintentar: 'Reintentar',
  volverALaPortada: 'Ver todas las secciones',
  sinDocumentos: 'Sin documentos publicados',
  sinDocumentosDetalle:
    'Esta subsección todavía no tiene documentos publicados. Vuelva a consultarla más adelante.',
  sinSubsecciones: 'Esta sección todavía no tiene contenido publicado.',
  errorGenerico: 'No se pudo cargar la información. Intente de nuevo.',
  errorNoDisponible: 'Esta sección no está disponible',
  errorDemasiadasSolicitudes: 'Demasiadas solicitudes, espere un momento',
  documentosDeLaSeccion: 'Documentos de esta sección',
} as const;

/**
 * Participación ciudadana (ITSP-03) no clasifica documentos, así que su
 * página muestra solo este marcador: ni recuadros de subsección ni lista.
 *
 * Es la ÚNICA excepción del portal a la regla de que los recuadros los
 * dicta la base, y está acotada a esta sección. Un recuadro que lleva a
 * una página que siempre dirá "Sin documentos publicados" hace perder el
 * tiempo a quien lo abre, dos veces seguidas.
 */
export const MARCADOR_PARTICIPACION = {
  titulo: 'Contenido próximamente',
  texto:
    'Esta sección está en preparación. Próximamente encontrará aquí información y formularios de participación ciudadana.',
} as const;

/**
 * ¿Es la sección informativa que no lleva documentos?
 *
 * Reutiliza la constante que ya existe en vez de escribir "ITSP-03" en un
 * segundo sitio: el día que ese código cambie, cambia en uno solo. La
 * comparación ignora mayúsculas porque la constante está en mayúsculas y
 * la API devuelve los códigos en minúsculas.
 */
export function esSeccionSinDocumentos(codigo: string | null | undefined): boolean {
  if (!codigo) return false;
  return codigo.toLowerCase() === CODIGO_CATEGORIA_RAIZ_EXCLUIDA.toLowerCase();
}

/**
 * Fecha de publicación en español de Costa Rica.
 *
 * La API devuelve UTC; sin fijar la zona, un documento publicado a las
 * 20:00 del día 5 se vería como del día 6 para quien tenga el reloj en
 * otra parte, y en un portal de transparencia la fecha de publicación es
 * justo el dato que a nadie le da igual.
 */
export function formatearFechaPublicacion(iso: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';

  return new Intl.DateTimeFormat('es-CR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  }).format(fecha);
}

/** Tamaño del PDF en una unidad que se lea de un vistazo. */
export function formatearTamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

/** "1 documento" / "7 documentos" / "Sin documentos". */
export function describirCantidad(cantidad: number): string {
  if (cantidad <= 0) return 'Sin documentos';
  return cantidad === 1 ? '1 documento' : `${cantidad} documentos`;
}

/**
 * Traduce el error de axios al mensaje que ve el ciudadano.
 *
 * Nunca se muestran `statusCode`, `ruta` ni `timestamp`: eso va a la
 * consola. Lo que la persona necesita saber es si puede reintentar.
 */
export function mensajeDeError(error: unknown): string {
  const estado = (error as { response?: { status?: number } })?.response?.status;
  if (estado === 404) return TEXTOS.errorNoDisponible;
  if (estado === 429) return TEXTOS.errorDemasiadasSolicitudes;
  return TEXTOS.errorGenerico;
}

/** Un 404 se presenta distinto: no hay nada que reintentar. */
export function esNoDisponible(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404;
}
