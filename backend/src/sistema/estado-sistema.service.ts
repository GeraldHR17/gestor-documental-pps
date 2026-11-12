import { readFileSync } from 'node:fs';
import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { BitacoraLimpiezaService } from '../bitacora/bitacora-limpieza.service';
import { AlmacenamientoDocumentosService } from '../documentos/almacenamiento-documentos.service';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';
import {
  EstadoAlmacenamientoDto,
  EstadoBaseDatosDto,
  EstadoBitacoraDto,
  EstadoSistemaDto,
} from './dto/estado-sistema.dto';

const NOMBRE_PAQUETE_BACKEND = 'backend';
const SUBCARPETA_DOCUMENTOS = 'documentos';
const ARCHIVO_VOLCADO = 'base-datos.sql.gz';
const PATRON_CARPETA_RESPALDO = /^\d{8}-\d{6}$/;
const PATRON_ARCHIVO_VOLCADO = /^[^.].*\.(sql|sql\.gz|gz)$/i;

function leerVersionBackend(): string | null {
  const candidatos = [
    join(__dirname, '..', '..', 'package.json'),
    join(process.cwd(), 'package.json'),
  ];

  for (const ruta of candidatos) {
    try {
      const paquete = JSON.parse(readFileSync(ruta, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (
        paquete.name === NOMBRE_PAQUETE_BACKEND &&
        typeof paquete.version === 'string'
      ) {
        return paquete.version;
      }
    } catch {
      continue;
    }
  }

  return null;
}

const VERSION_BACKEND = leerVersionBackend();

@Injectable()
export class EstadoSistemaService {
  constructor(
    @InjectDataSource()
    private readonly fuenteDatos: DataSource,
    @InjectRepository(BitacoraLog)
    private readonly repositorioBitacora: Repository<BitacoraLog>,
    private readonly bitacoraLimpieza: BitacoraLimpiezaService,
    private readonly almacenamiento: AlmacenamientoDocumentosService,
    private readonly configuracion: ConfigService,
  ) {}

  async obtenerEstado(): Promise<EstadoSistemaDto> {
    const [baseDatos, almacenamiento, ultimoRespaldo, bitacora] =
      await Promise.all([
        this.medirBaseDatos(),
        this.medirAlmacenamiento(),
        this.buscarUltimoRespaldo(),
        this.resumirBitacora(),
      ]);

    return new EstadoSistemaDto({
      versionBackend: VERSION_BACKEND,
      tiempoEnLineaSegundos: Math.floor(process.uptime()),
      baseDatos,
      almacenamiento,
      ultimoRespaldo,
      bitacora,
      generadoEn: new Date().toISOString(),
    });
  }

  private async medirBaseDatos(): Promise<EstadoBaseDatosDto> {
    try {
      const inicio = performance.now();
      await this.fuenteDatos.query('SELECT 1');
      return {
        conectada: true,
        latenciaMs: Math.round((performance.now() - inicio) * 10) / 10,
      };
    } catch {
      return { conectada: false, latenciaMs: null };
    }
  }

  private async medirAlmacenamiento(): Promise<EstadoAlmacenamientoDto> {
    const raiz = this.almacenamiento.raiz;
    const resultado: EstadoAlmacenamientoDto = {
      cantidadArchivos: null,
      tamanoTotalBytes: null,
      espacioLibreBytes: null,
    };

    try {
      const { cantidad, bytes } = await this.recorrerCarpeta(
        join(raiz, SUBCARPETA_DOCUMENTOS),
      );
      resultado.cantidadArchivos = cantidad;
      resultado.tamanoTotalBytes = bytes;
    } catch {
      resultado.cantidadArchivos = null;
      resultado.tamanoTotalBytes = null;
    }

    try {
      const volumen = await statfs(raiz);
      resultado.espacioLibreBytes =
        Number(volumen.bavail) * Number(volumen.bsize);
    } catch {
      resultado.espacioLibreBytes = null;
    }

    return resultado;
  }

  private async recorrerCarpeta(
    carpeta: string,
  ): Promise<{ cantidad: number; bytes: number }> {
    let cantidad = 0;
    let bytes = 0;
    const entradas = await readdir(carpeta, { withFileTypes: true });

    for (const entrada of entradas) {
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) {
        const parcial = await this.recorrerCarpeta(ruta);
        cantidad += parcial.cantidad;
        bytes += parcial.bytes;
      } else if (entrada.isFile()) {
        cantidad += 1;
        bytes += (await stat(ruta)).size;
      }
    }

    return { cantidad, bytes };
  }

  private async buscarUltimoRespaldo(): Promise<string | null> {
    const carpeta = this.configuracion.get<string>('RUTA_RESPALDOS')?.trim();
    if (!carpeta) return null;

    try {
      const entradas = await readdir(carpeta, { withFileTypes: true });
      let masReciente = 0;

      for (const entrada of entradas) {
        let ruta: string | null = null;
        if (entrada.isFile() && PATRON_ARCHIVO_VOLCADO.test(entrada.name)) {
          ruta = join(carpeta, entrada.name);
        } else if (
          entrada.isDirectory() &&
          PATRON_CARPETA_RESPALDO.test(entrada.name)
        ) {
          ruta = join(carpeta, entrada.name, ARCHIVO_VOLCADO);
        }
        if (!ruta) continue;

        try {
          const modificado = (await stat(ruta)).mtimeMs;
          if (modificado > masReciente) masReciente = modificado;
        } catch {
          continue;
        }
      }

      return masReciente > 0 ? new Date(masReciente).toISOString() : null;
    } catch {
      return null;
    }
  }

  private async resumirBitacora(): Promise<EstadoBitacoraDto> {
    let retencionMeses: number | null = null;
    try {
      retencionMeses = this.bitacoraLimpieza.mesesRetencion;
    } catch {
      retencionMeses = null;
    }

    try {
      const fila = await this.repositorioBitacora
        .createQueryBuilder('log')
        .select('MIN(log.fechaHora)', 'masAntiguo')
        .addSelect('COUNT(*)', 'total')
        .getRawOne<{
          masAntiguo: Date | string | null;
          total: string | number;
        }>();

      const masAntiguo = fila?.masAntiguo ? new Date(fila.masAntiguo) : null;

      return {
        retencionMeses,
        registroMasAntiguo:
          masAntiguo && !Number.isNaN(masAntiguo.getTime())
            ? masAntiguo.toISOString()
            : null,
        totalRegistros: fila ? Number(fila.total) : null,
      };
    } catch {
      return { retencionMeses, registroMasAntiguo: null, totalRegistros: null };
    }
  }
}
