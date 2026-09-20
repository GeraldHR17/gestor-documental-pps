// src/lib/catalogos.config.ts
//
// Tipos de documento, dependencias y etiquetas se administran con la misma
// vista y el mismo formulario; lo único que cambia entre ellos son los
// textos, el segmento de la API, el límite de la columna `nombre` y si
// llevan descripción. Todo eso se declara aquí, en un solo lugar, para que
// agregar un cuarto catálogo plano en el futuro no obligue a duplicar
// componentes.

export type ClaveCatalogoSimple = 'tipos-documentos' | 'dependencias' | 'etiquetas';

export interface ConfiguracionCatalogo {
  /** Segmento de la API y de la ruta del navegador. */
  recurso: ClaveCatalogoSimple;
  titulo: string;
  descripcionPagina: string;
  /** Cómo se nombra un registro en botones y modales, ej. 'tipo de documento'. */
  singular: string;
  /** Artículo que le corresponde, para redactar los mensajes en su género. */
  articulo: 'el' | 'la';
  icono: string;
  etiquetaColumnaNombre: string;
  /** Límite real de la columna en la base: se valida antes de enviar. */
  longitudMaximaNombre: number;
  /** `false` en etiquetas: la tabla no tiene columna de descripción. */
  admiteDescripcion: boolean;
  nombreRutaLista: string;
  nombreRutaNueva: string;
  nombreRutaEdicion: string;
}

export const CATALOGOS_SIMPLES: Record<ClaveCatalogoSimple, ConfiguracionCatalogo> = {
  'tipos-documentos': {
    recurso: 'tipos-documentos',
    titulo: 'Tipos de Documento',
    descripcionPagina:
      'Administre los tipos con los que se clasifican los documentos institucionales.',
    singular: 'tipo de documento',
    articulo: 'el',
    icono: 'description',
    etiquetaColumnaNombre: 'Tipo de documento',
    longitudMaximaNombre: 100,
    admiteDescripcion: true,
    nombreRutaLista: 'tipos-documentos',
    nombreRutaNueva: 'tipo-documento-nuevo',
    nombreRutaEdicion: 'tipo-documento-editar',
  },
  dependencias: {
    recurso: 'dependencias',
    titulo: 'Dependencias',
    descripcionPagina:
      'Administre las áreas o departamentos que originan los documentos municipales.',
    singular: 'dependencia',
    articulo: 'la',
    icono: 'apartment',
    etiquetaColumnaNombre: 'Dependencia',
    longitudMaximaNombre: 150,
    admiteDescripcion: true,
    nombreRutaLista: 'dependencias',
    nombreRutaNueva: 'dependencia-nueva',
    nombreRutaEdicion: 'dependencia-editar',
  },
  etiquetas: {
    recurso: 'etiquetas',
    titulo: 'Etiquetas',
    descripcionPagina: 'Administre las etiquetas con las que se marcan los documentos publicados.',
    singular: 'etiqueta',
    articulo: 'la',
    icono: 'sell',
    etiquetaColumnaNombre: 'Etiqueta',
    longitudMaximaNombre: 100,
    // La tabla `etiquetas` sólo tiene nombre y estado (01-esquema.sql).
    admiteDescripcion: false,
    nombreRutaLista: 'etiquetas',
    nombreRutaNueva: 'etiqueta-nueva',
    nombreRutaEdicion: 'etiqueta-editar',
  },
};

export function obtenerConfiguracionCatalogo(clave: string): ConfiguracionCatalogo {
  const configuracion = CATALOGOS_SIMPLES[clave as ClaveCatalogoSimple];
  if (!configuracion) {
    throw new Error(`Catálogo no configurado: ${clave}`);
  }
  return configuracion;
}
