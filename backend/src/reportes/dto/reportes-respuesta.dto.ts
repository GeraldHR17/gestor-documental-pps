// src/reportes/dto/reportes-respuesta.dto.ts
//
// Forma de salida de los indicadores de gestión documental (MF-08,
// RF-055 a RF-058). Se muestran embebidos en la pantalla de Inicio.

export class ResumenReportesDto {
  /** Todas las filas de `documentos`, sin importar estado: nunca se borran. */
  documentosRegistrados: number;
  /** Creados dentro del mes calendario en curso. */
  documentosEsteMes: number;
  publicados: number;
  /** Publicados sobre el total, redondeado; 0 cuando no hay documentos. */
  porcentajePublicados: number;
  pendientes: number;
  /** En BORRADOR con más de 15 días desde su creación. */
  pendientesMasDe15Dias: number;
  operacionesBitacora90Dias: number;

  constructor(datos: ResumenReportesDto) {
    Object.assign(this, datos);
  }
}

/** Fila de los desgloses por categoría ITSP y por dependencia. */
export class ConteoPorGrupoDto {
  /** `null` en el grupo "Sin dependencia asignada". */
  id: number | null;
  nombre: string;
  cantidad: number;

  constructor(datos: ConteoPorGrupoDto) {
    Object.assign(this, datos);
  }
}
