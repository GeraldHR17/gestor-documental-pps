// src/types/portalPublico.types.ts
//
// Tipos del portal público de transparencia. Se derivan del contrato REAL
// del backend (`backend/src/publico/dto/`), no del spec: si alguna vez se
// separan, manda el backend, que es lo que responde de verdad.
//
// Las fechas llegan como cadena ISO-8601 en UTC, no como Date: el DTO del
// backend las declara `Date` pero viajan serializadas en JSON. Formatearlas
// es cosa de la vista (ver `formatearFechaPublicacion` en
// `lib/portalPublico.config.ts`).

/** Subsección del índice ITSP: una hoja del árbol, sin hijos. */
export interface SubseccionPublicaDto {
  /** Código de la base en minúsculas, p. ej. `itsp-01-02`. Es lo que va en la URL. */
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  /** Documentos publicados que cuelgan de esta subsección. */
  cantidadDocumentos: number;
}

/** Sección: una de las cuatro raíces del índice ITSP. */
export interface SeccionPublicaDto {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  /**
   * Suma de los documentos de sus subsecciones MÁS los que cuelgan
   * directamente de la raíz. Que la suma de las subsecciones sea menor
   * significa que la sección tiene documentos propios, y entonces la vista
   * los pide a `GET /publico/secciones/:codigo/documentos`.
   */
  cantidadDocumentos: number;
  subsecciones: SubseccionPublicaDto[];
}

/** Un documento, tal como lo ve el público: sin estado, sin autor, sin rutas. */
export interface DocumentoPublicoDto {
  id: number;
  titulo: string;
  descripcion: string | null;
  anio: number;
  /** ISO-8601 en UTC. `null` solo si la fila se editó a mano. */
  fechaPublicacion: string | null;
  /** Nombre del tipo documental, no su identificador. */
  tipoDocumento: string;
  dependencia: string | null;
  /** De la versión vigente. `null` si el PDF no se pudo interpretar al cargarlo. */
  numeroPaginas: number | null;
  /** De la versión vigente. */
  tamanoBytes: number;
  /** Solo los nombres. */
  etiquetas: string[];
}

export interface ListaPaginadaDocumentosPublicosDto {
  datos: DocumentoPublicoDto[];
  total: number;
  pagina: number;
  limite: number;
}

/** Los dos únicos parámetros que acepta el backend en los listados. */
export interface FiltrosListadoPublico {
  pagina?: number;
  /** El backend lo limita a 50; pedir más devuelve 400. */
  limite?: number;
}
