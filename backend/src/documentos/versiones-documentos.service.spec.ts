// src/documentos/versiones-documentos.service.spec.ts
//
// Reglas del versionamiento y de la entrega del archivo. El servicio de
// documentos se sustituye por un doble: aquí no se vuelve a probar la
// visibilidad (eso está en documentos.service.spec.ts), sino qué hace este
// servicio con el documento que aquél le devuelve.

import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import { BitacoraService } from '../bitacora/bitacora.service';
import { Documento } from '../entidades/documento.entidad';

import { VersionesDocumentosService } from './versiones-documentos.service';
import { DocumentosService } from './documentos.service';
import { AlmacenamientoDocumentosService } from './almacenamiento-documentos.service';
import {
  TransicionEstadoInvalidaException,
  VersionNoEncontradaException,
} from '../comun/excepciones/excepciones-documentos';

const GESTOR: PayloadJwt = {
  idUsuario: 4,
  idRol: 2,
  nombreRol: 'Administrador',
  permisos: ['versiones.cargar', 'documentos.consultar'],
};

const CONSULTANTE: PayloadJwt = {
  idUsuario: 9,
  idRol: 3,
  nombreRol: 'Usuario',
  permisos: ['documentos.consultar'],
};

const ARCHIVO = {
  originalname: 'informe-v2.pdf',
  mimetype: 'application/pdf',
  size: 2048,
  buffer: Buffer.from('%PDF-1.7'),
};

function montar(opciones: {
  estado?: 'BORRADOR' | 'PUBLICADO' | 'INACTIVO';
  ultimaVersion?: number;
  versionesExistentes?: Array<Record<string, unknown>>;
  puedeGestionar?: boolean;
} = {}) {
  const estado = opciones.estado ?? 'BORRADOR';
  const documento = { idDocumento: 7, estado } as Documento;

  const versiones = opciones.versionesExistentes ?? [];

  const repositorioVersiones = {
    findOne: jest.fn().mockImplementation(({ where, order }) => {
      if (where.hashArchivo) {
        return Promise.resolve(
          versiones.find((version) => version.hashArchivo === where.hashArchivo) ?? null,
        );
      }
      if (where.numeroVersion !== undefined) {
        return Promise.resolve(
          versiones.find((version) => version.numeroVersion === where.numeroVersion) ?? null,
        );
      }
      // Sin número: la vigente, es decir la de mayor numeroVersion.
      const ordenadas = [...versiones].sort(
        (a, b) => (b.numeroVersion as number) - (a.numeroVersion as number),
      );
      void order;
      return Promise.resolve(ordenadas[0] ?? null);
    }),
  };

  const gestorTransaccion = {
    findOne: jest.fn().mockResolvedValue(
      opciones.ultimaVersion !== undefined ? { numeroVersion: opciones.ultimaVersion } : null,
    ),
    create: jest.fn((_entidad, datos) => ({ ...datos })),
    save: jest.fn((entidad) => Promise.resolve(entidad)),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const fuenteDatos = { transaction: jest.fn((callback) => callback(gestorTransaccion)) };

  const documentosService = {
    buscarEntidadAccesible: jest.fn().mockResolvedValue(documento),
    obtener: jest.fn().mockResolvedValue({ id: 7 }),
    cargarVersionesDe: jest.fn().mockResolvedValue(new Map([[7, versiones]])),
    puedeGestionar: jest.fn().mockReturnValue(opciones.puedeGestionar ?? true),
  };

  const almacenamiento = {
    almacenar: jest.fn().mockResolvedValue({
      nombreArchivoSistema: 'uuid.pdf',
      rutaArchivo: 'documentos/uuid.pdf',
      hashArchivo: 'b'.repeat(64),
      algoritmoHash: 'SHA-256',
      tamanoBytes: 2048,
    }),
    abrirLectura: jest.fn().mockResolvedValue('flujo-simulado'),
    descartar: jest.fn().mockResolvedValue(undefined),
  };

  const bitacora = { registrar: jest.fn().mockResolvedValue(undefined) };

  const servicio = new VersionesDocumentosService(
    repositorioVersiones as never,
    fuenteDatos as never,
    documentosService as unknown as DocumentosService,
    almacenamiento as unknown as AlmacenamientoDocumentosService,
    bitacora as unknown as BitacoraService,
  );

  return { servicio, repositorioVersiones, gestorTransaccion, fuenteDatos, almacenamiento, bitacora, documentosService };
}

describe('VersionesDocumentosService', () => {
  describe('crear (VP-05)', () => {
    it('numera la primera versión como 1', async () => {
      const { servicio, gestorTransaccion } = montar({ ultimaVersion: undefined });

      await servicio.crear(7, {}, ARCHIVO, GESTOR);

      expect(gestorTransaccion.create.mock.calls[0][1]).toMatchObject({ numeroVersion: 1 });
    });

    it('continúa la numeración a partir de la última existente', async () => {
      const { servicio, gestorTransaccion } = montar({ ultimaVersion: 4 });

      await servicio.crear(7, {}, ARCHIVO, GESTOR);

      expect(gestorTransaccion.create.mock.calls[0][1]).toMatchObject({ numeroVersion: 5 });
    });

    it('no acepta un numero_version enviado por el cliente', async () => {
      const { servicio, gestorTransaccion } = montar({ ultimaVersion: 2 });

      // El DTO sólo declara `comentarioVersion`; el ValidationPipe con
      // whitelist descarta lo demás, y aquí se comprueba que aunque llegara
      // no altera la numeración que decide el servidor.
      await servicio.crear(7, { numeroVersion: 99 } as never, ARCHIVO, GESTOR);

      expect(gestorTransaccion.create.mock.calls[0][1]).toMatchObject({ numeroVersion: 3 });
    });

    it('guarda el comentario recortado y descarta el vacío', async () => {
      const { servicio, gestorTransaccion } = montar({ ultimaVersion: 1 });

      await servicio.crear(7, { comentarioVersion: '   ' }, ARCHIVO, GESTOR);

      expect(gestorTransaccion.create.mock.calls[0][1]).toMatchObject({ comentarioVersion: null });
    });

    it('registra CREAR_VERSION_DOCUMENTO con el número y el hash', async () => {
      const { servicio, bitacora } = montar({ ultimaVersion: 1 });

      await servicio.crear(7, { comentarioVersion: 'Corrige el anexo 3' }, ARCHIVO, GESTOR);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR_VERSION_DOCUMENTO',
          entidad: 'documentos',
          idRegistro: 7,
          detalles: expect.objectContaining({ numeroVersion: 2, hashArchivo: 'b'.repeat(64) }),
        }),
      );
    });

    // Avisar, no bloquear: repetir una carga puede ser deliberado.
    it('deja constancia de que el contenido es idéntico a otra versión, pero no lo impide', async () => {
      const { servicio, bitacora } = montar({
        ultimaVersion: 2,
        versionesExistentes: [{ numeroVersion: 1, hashArchivo: 'b'.repeat(64) }],
      });

      await servicio.crear(7, {}, ARCHIVO, GESTOR);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          detalles: expect.objectContaining({ duplicadoDeVersion: 1 }),
        }),
      );
    });

    it('rechaza cargar versiones de un documento inactivo', async () => {
      const { servicio, almacenamiento } = montar({ estado: 'INACTIVO' });

      await expect(servicio.crear(7, {}, ARCHIVO, GESTOR)).rejects.toThrow(
        TransicionEstadoInvalidaException,
      );
      expect(almacenamiento.almacenar).not.toHaveBeenCalled();
    });

    it('descarta el archivo escrito si la transacción falla', async () => {
      const { servicio, fuenteDatos, almacenamiento } = montar({ ultimaVersion: 1 });
      fuenteDatos.transaction.mockRejectedValueOnce(new Error('llave duplicada'));

      await expect(servicio.crear(7, {}, ARCHIVO, GESTOR)).rejects.toThrow('llave duplicada');
      expect(almacenamiento.descartar).toHaveBeenCalledWith('documentos/uuid.pdf');
    });
  });

  describe('obtenerArchivo', () => {
    const VERSIONES = [
      { numeroVersion: 1, rutaArchivo: 'documentos/v1.pdf', nombreArchivoOriginal: 'v1.pdf', tamanoBytes: '10', mimeType: 'application/pdf' },
      { numeroVersion: 2, rutaArchivo: 'documentos/v2.pdf', nombreArchivoOriginal: 'v2.pdf', tamanoBytes: '20', mimeType: 'application/pdf' },
    ];

    it('sin número de versión entrega la vigente', async () => {
      const { servicio, almacenamiento } = montar({ versionesExistentes: VERSIONES });

      const archivo = await servicio.obtenerArchivo(7, undefined, GESTOR, false);

      expect(archivo.numeroVersion).toBe(2);
      expect(almacenamiento.abrirLectura).toHaveBeenCalledWith('documentos/v2.pdf');
    });

    // VP-05: el historial completo es consultable, no sólo la vigente.
    it('entrega una versión anterior cuando se pide por número', async () => {
      const { servicio, almacenamiento } = montar({ versionesExistentes: VERSIONES });

      const archivo = await servicio.obtenerArchivo(7, 1, GESTOR, false);

      expect(archivo.numeroVersion).toBe(1);
      expect(almacenamiento.abrirLectura).toHaveBeenCalledWith('documentos/v1.pdf');
    });

    it('responde 404 si la versión pedida no existe', async () => {
      const { servicio } = montar({ versionesExistentes: VERSIONES });

      await expect(servicio.obtenerArchivo(7, 99, GESTOR, false)).rejects.toThrow(
        VersionNoEncontradaException,
      );
    });

    it('responde 404 si el documento no tiene ninguna versión', async () => {
      const { servicio } = montar({ versionesExistentes: [] });

      await expect(servicio.obtenerArchivo(7, undefined, GESTOR, false)).rejects.toThrow(
        VersionNoEncontradaException,
      );
    });

    it('convierte el tamaño BIGINT a número', async () => {
      const { servicio } = montar({ versionesExistentes: VERSIONES });

      const archivo = await servicio.obtenerArchivo(7, 2, GESTOR, false);

      expect(archivo.tamanoBytes).toBe(20);
    });

    it('bloquea el archivo de un documento inactivo a quien sólo consulta', async () => {
      const { servicio } = montar({
        estado: 'INACTIVO',
        versionesExistentes: VERSIONES,
        puedeGestionar: false,
      });

      await expect(servicio.obtenerArchivo(7, undefined, CONSULTANTE, false)).rejects.toThrow(
        /El documento está inactivo/,
      );
    });

    it('permite ver el archivo de un documento inactivo a quien administra', async () => {
      const { servicio } = montar({
        estado: 'INACTIVO',
        versionesExistentes: VERSIONES,
        puedeGestionar: true,
      });

      await expect(servicio.obtenerArchivo(7, undefined, GESTOR, false)).resolves.toMatchObject({
        numeroVersion: 2,
      });
    });
  });

  describe('bitácora de descarga (RN-013)', () => {
    const VERSIONES = [
      { numeroVersion: 1, rutaArchivo: 'documentos/v1.pdf', nombreArchivoOriginal: 'v1.pdf', tamanoBytes: '10', mimeType: 'application/pdf' },
    ];

    it('registra DESCARGAR_DOCUMENTO al descargar', async () => {
      const { servicio, bitacora } = montar({ versionesExistentes: VERSIONES });

      await servicio.obtenerArchivo(7, 1, GESTOR, true);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'DESCARGAR_DOCUMENTO',
          idRegistro: 7,
          idUsuario: GESTOR.idUsuario,
          detalles: expect.objectContaining({ numeroVersion: 1 }),
        }),
      );
    });

    // Abrir el visor ocurre en cada apertura del detalle: auditarlo
    // llenaría la bitácora de ruido sin valor de trazabilidad.
    it('no registra nada al abrir el visor', async () => {
      const { servicio, bitacora } = montar({ versionesExistentes: VERSIONES });

      await servicio.obtenerArchivo(7, 1, GESTOR, false);

      expect(bitacora.registrar).not.toHaveBeenCalled();
    });
  });
});
