// src/documentos/almacenamiento-documentos.service.ts
//
// Único punto del sistema que toca el disco (RNF-004, RNF-005, RNF-006).
// Todo lo relacionado con archivos vive aquí para que ni el servicio de
// documentos ni el de versiones tengan que saber dónde ni con qué nombre
// se guardan.
//
// Dos decisiones deliberadas:
//
//  1. La carpeta NO se sirve como estática (no hay ServeStaticModule ni
//     express.static apuntando a ella). El único camino hacia un PDF es
//     `GET /documentos/:id/visualizar|descargar`, que pasa por JWT +
//     permiso + estado del documento. Si algún día se agrega middleware de
//     archivos estáticos, esta carpeta debe quedar fuera.
//
//  2. El nombre en disco lo genera el sistema (UUID v4). El nombre que
//     subió la persona se conserva sólo en la columna
//     `nombre_archivo_original`, para mostrarlo y para la descarga. Así el
//     nombre físico nunca es adivinable ni puede contener rutas relativas.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { PDFDocument } from 'pdf-lib';

import {
  ArchivoDemasiadoGrandeException,
  ArchivoInvalidoException,
  ArchivoNoDisponibleException,
} from '../comun/excepciones/excepciones-documentos';

/** 40 MB — mismo valor que el CHECK de `versiones_documentos` (VP-07). */
export const TAMANO_MAXIMO_BYTES = 41_943_040;
export const TAMANO_MAXIMO_MB = TAMANO_MAXIMO_BYTES / (1024 * 1024);

export const MIME_TYPE_PDF = 'application/pdf';

/** Todo PDF válido empieza con estos 5 bytes; ver `%PDF-1.x` en la spec. */
const FIRMA_PDF = '%PDF-';

/** Subcarpeta dentro de la raíz de almacenamiento, y prefijo de `ruta_archivo`. */
const SUBCARPETA_DOCUMENTOS = 'documentos';

/**
 * Forma mínima de un archivo recibido por Multer. Se declara aquí en vez de
 * usar `Express.Multer.File` porque ese tipo global lo aporta @types/multer,
 * que no es dependencia directa del proyecto; con esto el módulo no depende
 * de que ese paquete esté instalado.
 */
export interface ArchivoCargado {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ArchivoAlmacenado {
  nombreArchivoSistema: string;
  /** Relativa a la raíz de almacenamiento, ej. `documentos/<uuid>.pdf`. */
  rutaArchivo: string;
  hashArchivo: string;
  algoritmoHash: string;
  tamanoBytes: number;
  /** `null` si el PDF pasó la firma pero pdf-lib no pudo interpretarlo. */
  numeroPaginas: number | null;
}

@Injectable()
export class AlmacenamientoDocumentosService {
  private readonly logger = new Logger(AlmacenamientoDocumentosService.name);
  private readonly raizAlmacenamiento: string;

  constructor(configuracion: ConfigService) {
    // Se aceptan dos nombres para la misma cosa: `RUTA_ALMACENAMIENTO` es
    // el que usa la guía de despliegue y el que respeta el orden de
    // palabras del resto de las variables en español, y
    // `ALMACENAMIENTO_RUTA` es el que ya existía. Mantener ambos evita que
    // un `.env` escrito con cualquiera de los dos deje los PDF en una
    // carpeta inesperada, que es un fallo silencioso y difícil de notar.
    //
    // `resolve()` admite rutas absolutas de Windows (C:\munidata\storage)
    // y las deja intactas; solo compone cuando la ruta es relativa. Por
    // defecto `backend/storage`, fuera de cualquier carpeta publicada.
    const rutaConfigurada =
      configuracion.get<string>('RUTA_ALMACENAMIENTO')?.trim() ||
      configuracion.get<string>('ALMACENAMIENTO_RUTA')?.trim();

    this.raizAlmacenamiento = resolve(rutaConfigurada || join(process.cwd(), 'storage'));
  }

  /**
   * Las cuatro comprobaciones de RNF-005, en orden de costo creciente. Se
   * ejecuta ANTES de tocar la base de datos: el CHECK de MySQL queda como
   * última red de seguridad, no como el mecanismo que produce el mensaje.
   */
  validar(archivo: ArchivoCargado | undefined): void {
    if (!archivo) {
      throw new ArchivoInvalidoException('Debe adjuntar un archivo PDF');
    }

    if (extname(archivo.originalname).toLowerCase() !== '.pdf') {
      throw new ArchivoInvalidoException('El archivo debe tener extensión .pdf');
    }

    if (archivo.mimetype !== MIME_TYPE_PDF) {
      throw new ArchivoInvalidoException('El archivo debe ser de tipo application/pdf');
    }

    if (!archivo.buffer || archivo.buffer.length === 0) {
      throw new ArchivoInvalidoException('El archivo está vacío');
    }

    if (archivo.buffer.length > TAMANO_MAXIMO_BYTES) {
      throw new ArchivoDemasiadoGrandeException(TAMANO_MAXIMO_MB);
    }

    // Ni la extensión ni el Content-Type los decide el servidor: ambos los
    // envía el cliente y se pueden falsificar renombrando un .exe a .pdf.
    // Los primeros bytes sí son el contenido real del archivo.
    if (archivo.buffer.subarray(0, FIRMA_PDF.length).toString('latin1') !== FIRMA_PDF) {
      throw new ArchivoInvalidoException(
        'El contenido del archivo no corresponde a un PDF válido',
      );
    }
  }

  /** Valida y escribe el archivo. No toca la base de datos. */
  async almacenar(archivo: ArchivoCargado | undefined): Promise<ArchivoAlmacenado> {
    this.validar(archivo);
    const contenido = (archivo as ArchivoCargado).buffer;

    const nombreArchivoSistema = `${randomUUID()}.pdf`;
    const rutaArchivo = `${SUBCARPETA_DOCUMENTOS}/${nombreArchivoSistema}`;
    const rutaAbsoluta = this.rutaAbsolutaDe(rutaArchivo);

    // Se cuenta ANTES de escribir: si el conteo falla no pasa nada (queda
    // null), pero así el archivo no se escribe dos veces ni se relee.
    const numeroPaginas = await this.contarPaginas(contenido);

    await mkdir(join(this.raizAlmacenamiento, SUBCARPETA_DOCUMENTOS), { recursive: true });
    await writeFile(rutaAbsoluta, contenido);

    return {
      nombreArchivoSistema,
      rutaArchivo,
      hashArchivo: createHash('sha256').update(contenido).digest('hex'),
      algoritmoHash: 'SHA-256',
      tamanoBytes: contenido.length,
      numeroPaginas,
    };
  }

  /**
   * Número de páginas del PDF (mejora aprobada, D.2). pdf-lib sólo lee la
   * estructura del documento —no renderiza— así que cuesta poco incluso
   * con archivos de 40 MB. Si el archivo está cifrado o su estructura no
   * se puede interpretar, se devuelve null en vez de rechazar la carga: la
   * firma `%PDF-` ya se verificó y el conteo es informativo.
   */
  async contarPaginas(contenido: Buffer): Promise<number | null> {
    try {
      const documento = await PDFDocument.load(contenido, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      return documento.getPageCount();
    } catch (error) {
      this.logger.warn(`No se pudo contar las páginas del PDF: ${String(error)}`);
      return null;
    }
  }

  /**
   * Abre el archivo para transmitirlo. Devuelve un stream y no el contenido
   * completo: un PDF de 40 MB no tiene por qué pasar entero por la memoria
   * del proceso para llegar al navegador.
   */
  async abrirLectura(rutaArchivo: string): Promise<ReadStream> {
    const rutaAbsoluta = this.rutaAbsolutaDe(rutaArchivo);

    try {
      await stat(rutaAbsoluta);
    } catch {
      this.logger.error(`Archivo registrado en base de datos pero ausente en disco: ${rutaArchivo}`);
      throw new ArchivoNoDisponibleException();
    }

    return createReadStream(rutaAbsoluta);
  }

  /**
   * Borra un archivo recién escrito cuando la transacción que debía
   * registrarlo falló. Es el único borrado físico del sistema y no
   * contradice RN-007: elimina un archivo huérfano que nunca llegó a
   * quedar referenciado por ninguna fila.
   */
  async descartar(rutaArchivo: string): Promise<void> {
    try {
      await unlink(this.rutaAbsolutaDe(rutaArchivo));
    } catch (error) {
      // Que no se pueda borrar el huérfano no debe tapar el error real que
      // provocó el rollback, así que sólo se deja constancia en el log.
      this.logger.warn(`No se pudo descartar el archivo huérfano ${rutaArchivo}: ${String(error)}`);
    }
  }

  /**
   * Resuelve la ruta relativa contra la raíz y verifica que el resultado
   * siga dentro de ella. `ruta_archivo` la escribe siempre este servicio,
   * pero la comprobación evita que una fila manipulada en la base pueda
   * usarse para leer cualquier archivo del servidor (path traversal).
   */
  private rutaAbsolutaDe(rutaArchivo: string): string {
    const rutaAbsoluta = resolve(this.raizAlmacenamiento, rutaArchivo);

    if (
      rutaAbsoluta !== this.raizAlmacenamiento &&
      !rutaAbsoluta.startsWith(this.raizAlmacenamiento + sep)
    ) {
      throw new ArchivoNoDisponibleException();
    }

    return rutaAbsoluta;
  }
}
