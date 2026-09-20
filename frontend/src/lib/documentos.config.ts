// src/lib/documentos.config.ts
//
// Constantes de la gestión documental que comparten el formulario, el
// detalle y el listado.

/** 40 MB — el mismo tope que aplica la API y el CHECK de la base (VP-07). */
export const TAMANO_MAXIMO_ARCHIVO_BYTES = 41_943_040;
export const TAMANO_MAXIMO_ARCHIVO_MB = TAMANO_MAXIMO_ARCHIVO_BYTES / (1024 * 1024);

/**
 * Categoría raíz que NO clasifica documentos: es una sección informativa
 * del índice de transparencia, así que se excluye del select en cascada del
 * formulario. Sigue existiendo y administrándose con normalidad en el
 * catálogo de categorías ITSP (Fase 5): la exclusión es de este formulario,
 * no del catálogo.
 *
 * Se identifica por `codigo` y no por nombre porque el nombre es editable
 * desde el catálogo y una corrección de redacción rompería el filtro.
 */
export const CODIGO_CATEGORIA_RAIZ_EXCLUIDA = 'ITSP-03';

export const ETIQUETAS_ESTADO_DOCUMENTO = {
  BORRADOR: 'Borrador',
  PUBLICADO: 'Publicado',
  INACTIVO: 'Inactivo',
} as const;

/**
 * Validación del archivo en el navegador. Cubre los dos casos que se pueden
 * ver sin leer el contenido —extensión y tamaño— para avisar de inmediato
 * en vez de esperar el 400 del servidor. La comprobación real (firma
 * `%PDF-` incluida) la sigue haciendo la API: esto es comodidad, no
 * seguridad.
 */
export function validarArchivoPdf(archivo: File | null): string | null {
  if (!archivo) return 'Debe adjuntar un archivo PDF.';

  if (!archivo.name.toLowerCase().endsWith('.pdf')) {
    return 'El archivo debe tener extensión .pdf';
  }

  if (archivo.size === 0) return 'El archivo está vacío.';

  if (archivo.size > TAMANO_MAXIMO_ARCHIVO_BYTES) {
    return `El archivo supera el tamaño máximo permitido de ${TAMANO_MAXIMO_ARCHIVO_MB} MB.`;
  }

  return null;
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatearFecha(valor: string | null): string {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-CR');
}

// ---------------------------------------------------------------------
// Inspección del archivo (pulido de Fase 6, secciones C y D)
// ---------------------------------------------------------------------

/** Todo PDF válido empieza con estos 5 bytes. Misma regla que aplica la API. */
const FIRMA_PDF = '%PDF-';

export interface ArchivoPdfInspeccionado {
  archivo: File;
  /** `null` si pdf-lib no pudo interpretar la estructura (dato informativo). */
  numeroPaginas: number | null;
}

/**
 * Único punto de validación del PDF en el navegador: lo usan por igual la
 * carga por clic y el arrastrar-y-soltar, así que no puede haber dos
 * criterios. Aplica las mismas cuatro comprobaciones que la API —
 * extensión, mime declarado, tamaño y firma `%PDF-` — y de paso cuenta
 * las páginas para mostrarlas en la tarjeta del archivo.
 *
 * Es comodidad, no seguridad: la API vuelve a comprobar todo al recibir el
 * archivo. Lo que se gana es avisar al instante sin esperar el 400.
 *
 * Devuelve `{ error }` con el motivo concreto, o `{ resultado }` si pasó.
 */
export async function inspeccionarArchivoPdf(
  archivo: File | null,
): Promise<{ error: string; resultado?: undefined } | { error?: undefined; resultado: ArchivoPdfInspeccionado }> {
  const errorBasico = validarArchivoPdf(archivo);
  if (errorBasico) return { error: errorBasico };
  const valido = archivo as File;

  // El navegador deduce el mime por la extensión; un mime distinto con
  // extensión .pdf es raro pero posible (archivo renombrado a mano en
  // algunos sistemas) y la API lo rechazaría.
  if (valido.type && valido.type !== 'application/pdf') {
    return { error: 'El archivo debe ser de tipo application/pdf.' };
  }

  const cabecera = new Uint8Array(await valido.slice(0, FIRMA_PDF.length).arrayBuffer());
  const firma = String.fromCharCode(...cabecera);
  if (firma !== FIRMA_PDF) {
    return { error: 'El contenido del archivo no corresponde a un PDF válido.' };
  }

  return { resultado: { archivo: valido, numeroPaginas: await contarPaginasPdf(valido) } };
}

/**
 * pdf-lib se importa bajo demanda: pesa lo suyo y sólo hace falta en el
 * asistente de registro y al cargar una versión, no en el resto de la app.
 */
async function contarPaginasPdf(archivo: File): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const documento = await PDFDocument.load(await archivo.arrayBuffer(), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return documento.getPageCount();
  } catch {
    return null;
  }
}
