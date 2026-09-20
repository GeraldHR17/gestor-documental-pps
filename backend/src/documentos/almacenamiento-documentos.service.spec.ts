// src/documentos/almacenamiento-documentos.service.spec.ts
//
// Se prueba contra el disco real (una carpeta temporal del sistema
// operativo) y no con `fs` simulado: lo que interesa comprobar es
// justamente que el archivo queda escrito con un nombre generado por el
// sistema y que el hash corresponde al contenido, y un `fs` falso sólo
// verificaría que se llamó a las funciones esperadas.

import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AlmacenamientoDocumentosService,
  TAMANO_MAXIMO_BYTES,
  type ArchivoCargado,
} from './almacenamiento-documentos.service';
import {
  ArchivoDemasiadoGrandeException,
  ArchivoInvalidoException,
  ArchivoNoDisponibleException,
} from '../comun/excepciones/excepciones-documentos';

/** PDF mínimo válido: lo que importa es que empiece con la firma `%PDF-`. */
const CONTENIDO_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1');

function archivo(sobrescribir: Partial<ArchivoCargado> = {}): ArchivoCargado {
  return {
    originalname: 'informe.pdf',
    mimetype: 'application/pdf',
    size: CONTENIDO_PDF.length,
    buffer: CONTENIDO_PDF,
    ...sobrescribir,
  };
}

describe('AlmacenamientoDocumentosService', () => {
  let raiz: string;
  let servicio: AlmacenamientoDocumentosService;

  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'gestor-documental-'));
    const configuracion = { get: () => raiz } as unknown as ConfigService;
    servicio = new AlmacenamientoDocumentosService(configuracion);
  });

  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  describe('validar', () => {
    it('rechaza la ausencia de archivo', () => {
      expect(() => servicio.validar(undefined)).toThrow(ArchivoInvalidoException);
    });

    it('rechaza una extensión distinta de .pdf', () => {
      expect(() => servicio.validar(archivo({ originalname: 'informe.docx' }))).toThrow(
        /extensión \.pdf/,
      );
    });

    it('rechaza un mime type declarado distinto de application/pdf', () => {
      expect(() => servicio.validar(archivo({ mimetype: 'text/plain' }))).toThrow(
        /application\/pdf/,
      );
    });

    it('rechaza un archivo vacío', () => {
      expect(() => servicio.validar(archivo({ buffer: Buffer.alloc(0) }))).toThrow(/vacío/);
    });

    it('rechaza un archivo que supera los 40 MB', () => {
      const enorme = Buffer.concat([CONTENIDO_PDF, Buffer.alloc(TAMANO_MAXIMO_BYTES)]);
      expect(() => servicio.validar(archivo({ buffer: enorme, size: enorme.length }))).toThrow(
        ArchivoDemasiadoGrandeException,
      );
    });

    // El caso central de RNF-005: renombrar un ejecutable a .pdf y declarar
    // application/pdf engaña a la extensión y al Content-Type, pero no a
    // los primeros bytes del contenido.
    it('rechaza un archivo disfrazado de PDF sin la firma %PDF-', () => {
      expect(() =>
        servicio.validar(archivo({ buffer: Buffer.from('MZ\x90\x00 ejecutable', 'latin1') })),
      ).toThrow(/no corresponde a un PDF válido/);
    });

    it('acepta un PDF válido', () => {
      expect(() => servicio.validar(archivo())).not.toThrow();
    });
  });

  describe('almacenar', () => {
    it('escribe el archivo con un nombre generado por el sistema, no el del usuario', async () => {
      const resultado = await servicio.almacenar(archivo({ originalname: 'Informe Final.pdf' }));

      expect(resultado.nombreArchivoSistema).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      expect(resultado.nombreArchivoSistema).not.toContain('Informe');
      expect(resultado.rutaArchivo).toBe(`documentos/${resultado.nombreArchivoSistema}`);

      const guardado = await readFile(join(raiz, resultado.rutaArchivo));
      expect(guardado.equals(CONTENIDO_PDF)).toBe(true);
    });

    it('calcula el SHA-256 del contenido', async () => {
      const resultado = await servicio.almacenar(archivo());

      expect(resultado.algoritmoHash).toBe('SHA-256');
      expect(resultado.hashArchivo).toBe(createHash('sha256').update(CONTENIDO_PDF).digest('hex'));
      expect(resultado.hashArchivo).toHaveLength(64);
      expect(resultado.tamanoBytes).toBe(CONTENIDO_PDF.length);
    });

    it('da un nombre distinto a dos cargas del mismo contenido', async () => {
      const primera = await servicio.almacenar(archivo());
      const segunda = await servicio.almacenar(archivo());

      expect(primera.nombreArchivoSistema).not.toBe(segunda.nombreArchivoSistema);
      // El hash sí coincide: es lo que permite detectar versiones idénticas.
      expect(primera.hashArchivo).toBe(segunda.hashArchivo);
    });

    it('no escribe nada cuando el archivo no pasa la validación', async () => {
      await expect(servicio.almacenar(archivo({ mimetype: 'text/plain' }))).rejects.toThrow(
        ArchivoInvalidoException,
      );
    });
  });

  describe('conteo de páginas (D.2)', () => {
    it('cuenta las páginas de un PDF con estructura completa', async () => {
      const documento = await PDFDocument.create();
      documento.addPage();
      documento.addPage();
      documento.addPage();
      const contenido = Buffer.from(await documento.save());

      const resultado = await servicio.almacenar(archivo({ buffer: contenido, size: contenido.length }));

      expect(resultado.numeroPaginas).toBe(3);
    });

    // El PDF mínimo de las otras pruebas tiene la firma pero no un árbol de
    // páginas: pasa la validación (la firma es lo que se exige) y el conteo
    // simplemente queda en null, sin bloquear la carga.
    it('deja null el conteo cuando el PDF no se puede interpretar, sin rechazar la carga', async () => {
      const resultado = await servicio.almacenar(archivo());

      expect(resultado.numeroPaginas).toBeNull();
      expect(resultado.hashArchivo).toHaveLength(64);
    });
  });

  describe('lectura y descarte', () => {
    it('abre el archivo almacenado', async () => {
      const { rutaArchivo } = await servicio.almacenar(archivo());
      const flujo = await servicio.abrirLectura(rutaArchivo);

      const trozos: Buffer[] = [];
      for await (const trozo of flujo) trozos.push(trozo as Buffer);
      expect(Buffer.concat(trozos).equals(CONTENIDO_PDF)).toBe(true);
    });

    it('informa que el archivo no está disponible si desapareció del disco', async () => {
      await expect(servicio.abrirLectura('documentos/inexistente.pdf')).rejects.toThrow(
        ArchivoNoDisponibleException,
      );
    });

    // La ruta siempre la escribe este servicio, pero si una fila de la base
    // llegara manipulada no debe poder usarse para leer fuera de la carpeta.
    it('no permite salir de la carpeta de almacenamiento', async () => {
      await expect(servicio.abrirLectura('../../../etc/passwd')).rejects.toThrow(
        ArchivoNoDisponibleException,
      );
    });

    it('descarta un archivo huérfano', async () => {
      const { rutaArchivo } = await servicio.almacenar(archivo());
      await servicio.descartar(rutaArchivo);

      await expect(servicio.abrirLectura(rutaArchivo)).rejects.toThrow(ArchivoNoDisponibleException);
    });

    it('no falla al descartar un archivo que ya no existe', async () => {
      await expect(servicio.descartar('documentos/inexistente.pdf')).resolves.toBeUndefined();
    });
  });
});
