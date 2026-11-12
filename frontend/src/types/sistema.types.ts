export interface EstadoBaseDatos {
  conectada: boolean;
  latenciaMs: number | null;
}

export interface EstadoAlmacenamiento {
  cantidadArchivos: number | null;
  tamanoTotalBytes: number | null;
  espacioLibreBytes: number | null;
}

export interface EstadoBitacora {
  retencionMeses: number | null;
  registroMasAntiguo: string | null;
  totalRegistros: number | null;
}

export interface EstadoSistema {
  versionBackend: string | null;
  tiempoEnLineaSegundos: number;
  baseDatos: EstadoBaseDatos;
  almacenamiento: EstadoAlmacenamiento;
  ultimoRespaldo: string | null;
  bitacora: EstadoBitacora;
  generadoEn: string;
}
