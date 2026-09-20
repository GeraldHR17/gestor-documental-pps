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
