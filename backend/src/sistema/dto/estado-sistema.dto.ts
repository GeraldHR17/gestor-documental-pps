export class EstadoBaseDatosDto {
  conectada: boolean;
  latenciaMs: number | null;
}

export class EstadoAlmacenamientoDto {
  cantidadArchivos: number | null;
  tamanoTotalBytes: number | null;
  espacioLibreBytes: number | null;
}

export class EstadoBitacoraDto {
  retencionMeses: number | null;
  registroMasAntiguo: string | null;
  totalRegistros: number | null;
}

export class EstadoSistemaDto {
  versionBackend: string | null;
  tiempoEnLineaSegundos: number;
  baseDatos: EstadoBaseDatosDto;
  almacenamiento: EstadoAlmacenamientoDto;
  ultimoRespaldo: string | null;
  bitacora: EstadoBitacoraDto;
  generadoEn: string;

  constructor(datos: EstadoSistemaDto) {
    Object.assign(this, datos);
  }
}
