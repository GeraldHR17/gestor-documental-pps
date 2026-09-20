// src/documentos/versiones-documentos.service.ts
//
// Versionamiento (RF-022, RF-023, CU-013) y entrega del archivo (RF-027,
// RF-028, CU-017, CU-018).
//
// Decisiones de la Sección 0 que se materializan aquí:
//  - VP-05: `numero_version` es secuencial y lo asigna el servidor; la de
//    mayor número es la vigente, y TODAS las anteriores siguen siendo
//    consultables (visualizar y descargar aceptan `?version=`).
//  - RNF-004: el archivo nunca se expone por URL directa. Se transmite por
//    streaming desde estos métodos, después de validar JWT, permiso y
//    estado del documento.

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { ReadStream } from 'node:fs';

import { Documento } from '../entidades/documento.entidad';
import { VersionDocumento } from '../entidades/version-documento.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import { DocumentosService } from './documentos.service';
import {
  AlmacenamientoDocumentosService,
  MIME_TYPE_PDF,
  type ArchivoCargado,
} from './almacenamiento-documentos.service';
import { CrearVersionDto } from './dto/crear-version.dto';
import {
  DocumentoRespuestaDto,
  VersionDocumentoRespuestaDto,
} from './dto/documento-respuesta.dto';
import {
  TransicionEstadoInvalidaException,
  VersionNoEncontradaException,
} from '../comun/excepciones/excepciones-documentos';

const ENTIDAD_BITACORA = 'documentos';

export interface ArchivoParaTransmitir {
  contenido: ReadStream;
  nombreArchivoOriginal: string;
  tamanoBytes: number;
  mimeType: string;
  numeroVersion: number;
}

@Injectable()
export class VersionesDocumentosService {
  constructor(
    @InjectRepository(VersionDocumento)
    private readonly repositorioVersiones: Repository<VersionDocumento>,
    @InjectDataSource()
    private readonly fuenteDatos: DataSource,
    private readonly documentosService: DocumentosService,
    private readonly almacenamiento: AlmacenamientoDocumentosService,
    private readonly bitacoraService: BitacoraService,
  ) {}

  /** Historial completo, de la más reciente a la más antigua (RF-023). */
  async listarHistorial(
    idDocumento: number,
    usuario: PayloadJwt,
  ): Promise<VersionDocumentoRespuestaDto[]> {
    await this.documentosService.buscarEntidadAccesible(idDocumento, usuario);
    const versiones = await this.documentosService.cargarVersionesDe([idDocumento]);
    return versiones.get(idDocumento) ?? [];
  }

  /**
   * Nueva versión (RF-022). No sustituye a la anterior: la agrega al
   * historial, que se conserva íntegro. La numeración se calcula dentro de
   * la transacción y la restricción única (id_documento, numero_version)
   * queda como garantía final ante dos cargas simultáneas.
   */
  async crear(
    idDocumento: number,
    dto: CrearVersionDto,
    archivo: ArchivoCargado | undefined,
    usuario: PayloadJwt,
  ): Promise<DocumentoRespuestaDto> {
    const documento = await this.documentosService.buscarEntidadAccesible(idDocumento, usuario);

    if (documento.estado === 'INACTIVO') {
      throw new TransicionEstadoInvalidaException(
        'No se pueden cargar versiones de un documento inactivo',
      );
    }

    const almacenado = await this.almacenamiento.almacenar(archivo);

    // Aviso, no bloqueo: que dos versiones sean binariamente idénticas
    // puede ser un error de la persona o algo perfectamente deliberado
    // (por ejemplo, rehacer una carga fallida). Se deja constancia en la
    // bitácora y se sigue adelante.
    const duplicadoDe = await this.repositorioVersiones.findOne({
      where: { idDocumento, hashArchivo: almacenado.hashArchivo },
      order: { numeroVersion: 'ASC' },
    });

    let numeroVersion: number;

    try {
      numeroVersion = await this.fuenteDatos.transaction(async (gestor) => {
        const ultima = await gestor.findOne(VersionDocumento, {
          where: { idDocumento },
          order: { numeroVersion: 'DESC' },
        });

        const siguiente = (ultima?.numeroVersion ?? 0) + 1;

        await gestor.save(
          gestor.create(VersionDocumento, {
            idDocumento,
            numeroVersion: siguiente,
            nombreArchivoOriginal: (archivo as ArchivoCargado).originalname,
            nombreArchivoSistema: almacenado.nombreArchivoSistema,
            rutaArchivo: almacenado.rutaArchivo,
            hashArchivo: almacenado.hashArchivo,
            algoritmoHash: almacenado.algoritmoHash,
            tamanoBytes: String(almacenado.tamanoBytes),
            mimeType: MIME_TYPE_PDF,
            numeroPaginas: almacenado.numeroPaginas,
            comentarioVersion: dto.comentarioVersion?.trim() || null,
            idUsuarioCarga: usuario.idUsuario,
          }),
        );

        // Se toca el documento para que su `fecha_actualizacion` refleje
        // que tiene contenido nuevo; si no, el listado ordenado por esa
        // fecha dejaría al fondo un documento que acaba de cambiar.
        await gestor.update(Documento, { idDocumento }, { fechaActualizacion: new Date() });

        return siguiente;
      });
    } catch (error) {
      await this.almacenamiento.descartar(almacenado.rutaArchivo);
      throw error;
    }

    await this.bitacoraService.registrar({
      idUsuario: usuario.idUsuario,
      accion: 'CREAR_VERSION_DOCUMENTO',
      entidad: ENTIDAD_BITACORA,
      idRegistro: idDocumento,
      resultado: 'EXITO',
      detalles: {
        numeroVersion,
        hashArchivo: almacenado.hashArchivo,
        tamanoBytes: almacenado.tamanoBytes,
        numeroPaginas: almacenado.numeroPaginas,
        nombreArchivoOriginal: (archivo as ArchivoCargado).originalname,
        duplicadoDeVersion: duplicadoDe?.numeroVersion ?? null,
      },
    });

    return this.documentosService.obtener(idDocumento, usuario);
  }

  /**
   * Resuelve la versión pedida y abre su archivo. Es el único camino hacia
   * un PDF del sistema: no existe ruta estática que sirva
   * `backend/storage/documentos`, así que sin pasar por aquí —y por tanto
   * sin JWT, permiso y verificación de estado— el archivo no se alcanza.
   *
   * @param numeroVersion Omitido = versión vigente. Las anteriores siguen
   *   siendo consultables (VP-05).
   * @param registrarDescarga Sólo la descarga se audita (RN-013). Abrir el
   *   visor no deja registro: se dispara en cada apertura del detalle y
   *   llenaría la bitácora de ruido.
   */
  async obtenerArchivo(
    idDocumento: number,
    numeroVersion: number | undefined,
    usuario: PayloadJwt,
    registrarDescarga: boolean,
  ): Promise<ArchivoParaTransmitir> {
    const documento = await this.documentosService.buscarEntidadAccesible(idDocumento, usuario);

    // Un documento retirado deja de estar disponible para consulta; quien
    // administra sí puede seguir viéndolo, que es justamente lo que
    // permite revisar qué se retiró y por qué.
    if (documento.estado === 'INACTIVO' && !this.documentosService.puedeGestionar(usuario)) {
      throw new TransicionEstadoInvalidaException('El documento está inactivo');
    }

    const version =
      numeroVersion !== undefined
        ? await this.repositorioVersiones.findOne({
            where: { idDocumento, numeroVersion },
          })
        : await this.repositorioVersiones.findOne({
            where: { idDocumento },
            order: { numeroVersion: 'DESC' },
          });

    if (!version) {
      throw new VersionNoEncontradaException(numeroVersion);
    }

    const contenido = await this.almacenamiento.abrirLectura(version.rutaArchivo);

    if (registrarDescarga) {
      await this.bitacoraService.registrar({
        idUsuario: usuario.idUsuario,
        accion: 'DESCARGAR_DOCUMENTO',
        entidad: ENTIDAD_BITACORA,
        idRegistro: idDocumento,
        resultado: 'EXITO',
        detalles: {
          numeroVersion: version.numeroVersion,
          nombreArchivoOriginal: version.nombreArchivoOriginal,
        },
      });
    }

    return {
      contenido,
      nombreArchivoOriginal: version.nombreArchivoOriginal,
      tamanoBytes: Number(version.tamanoBytes),
      mimeType: version.mimeType,
      numeroVersion: version.numeroVersion,
    };
  }
}
