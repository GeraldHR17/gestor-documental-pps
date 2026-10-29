// src/comun/constantes/categorias-itsp.ts
//
// Reglas de la taxonomía ITSP que aplican fuera del catálogo mismo.
//
// "Participación ciudadana" es una sección informativa del índice de
// transparencia: existe y se administra con normalidad en el catálogo
// (Fase 5), pero NO clasifica documentos. Hasta ahora esa exclusión vivía
// sólo en el formulario del frontend; desde el pulido de Fase 6 la impone
// también DocumentosService, porque una regla que sólo vive en el
// navegador la salta cualquiera que llame a la API directamente.
//
// Se identifica por `codigo` y no por nombre porque el nombre es editable
// desde el catálogo y una corrección de redacción rompería el filtro. El
// frontend mantiene el mismo valor en `src/lib/documentos.config.ts`
// (CODIGO_CATEGORIA_RAIZ_EXCLUIDA): si cambia aquí, cambia allá.

export const CODIGO_CATEGORIA_RAIZ_EXCLUIDA = 'ITSP-03';

export const MENSAJE_CATEGORIA_EXCLUIDA =
  "La categoría 'Participación ciudadana' no es válida para clasificar documentos.";

/**
 * Niveles que admite la jerarquía de categorías ITSP, contando la raíz
 * (spec-ajustes-niveles-y-estados, C-6). Es un tope técnico, no una regla
 * de negocio: con 10 niveles el código más largo (ITSP-01 más nueve
 * "-MM") mide 34 caracteres y cabe con holgura en VARCHAR(50). El
 * frontend mantiene el mismo valor en `src/lib/documentos.config.ts`.
 */
export const PROFUNDIDAD_MAXIMA_CATEGORIAS = 10;

/** Largo de la columna `categorias_itsp.codigo`. */
export const LONGITUD_MAXIMA_CODIGO_CATEGORIA = 50;

/**
 * Cuántos cambios de código de descendientes se detallan en la bitácora al
 * mover un subárbol. `detalles` es una columna JSON: su límite real es
 * max_allowed_packet, pero una sola fila con miles de pares la vuelve
 * pesada de leer y de mostrar. Más allá de este tope se guarda solo la
 * cuenta (`cambiosDescendientesOmitidos`); `cantidadUrlCambiadas` siempre
 * lleva el total exacto.
 */
export const MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA = 100;
