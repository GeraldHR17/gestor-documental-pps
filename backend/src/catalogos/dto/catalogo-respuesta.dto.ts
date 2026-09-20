// src/catalogos/dto/catalogo-respuesta.dto.ts
//
// Respuesta común de los tres catálogos planos (tipos de documento,
// dependencias y etiquetas). Se expone `id` a secas, y no `idTipoDocumento`
// / `idDependencia` / `idEtiqueta`, porque el frontend los consume con una
// sola vista y un solo formulario reutilizables: si cada catálogo trajera
// su propio nombre de llave, esa vista tendría que saber a cuál está
// atendiendo sólo para leer un identificador.

export class CatalogoRespuestaDto {
  id: number;
  nombre: string;
  /** `null` en etiquetas: esa tabla no tiene columna de descripción. */
  descripcion: string | null;
  estado: 'ACTIVO' | 'INACTIVO';

  constructor(datos: CatalogoRespuestaDto) {
    Object.assign(this, datos);
  }
}
