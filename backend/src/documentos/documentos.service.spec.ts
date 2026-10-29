// src/documentos/documentos.service.spec.ts
//
// Se prueban las reglas de negocio del ciclo de vida, no el ORM: los
// repositorios son dobles con jest.fn() y la transacción se simula
// ejecutando su callback con un gestor falso. Lo que se verifica es qué
// decide el servicio (qué rechaza, con qué excepción y qué deja en la
// bitácora), que es lo que puede romperse al tocar el código.

import { CachePermisosService } from '../comun/cache/cache-permisos.service';
import { PermisoDenegadoException } from '../comun/excepciones/excepciones-autenticacion';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import { Documento } from '../entidades/documento.entidad';

import { DocumentosService } from './documentos.service';
import { AlmacenamientoDocumentosService } from './almacenamiento-documentos.service';
import {
  ClasificacionInvalidaException,
  DocumentoNoEncontradoException,
  DocumentoNoPublicableException,
  TransicionEstadoInvalidaException,
} from '../comun/excepciones/excepciones-documentos';

const GESTOR: PayloadJwt = {
  idUsuario: 1,
  idRol: 2,
  nombreRol: 'Administrador',
  permisos: ['documentos.crear', 'documentos.editar', 'documentos.publicar', 'documentos.inactivar'],
};

const CONSULTANTE: PayloadJwt = {
  idUsuario: 9,
  idRol: 3,
  nombreRol: 'Usuario',
  permisos: ['documentos.consultar'],
};

type EstadoDocumento = 'BORRADOR' | 'PUBLICADO' | 'INACTIVO';

function documentoDe(estado: EstadoDocumento, id = 1): Documento {
  return {
    idDocumento: id,
    titulo: 'Informe de labores',
    descripcion: null,
    anio: 2026,
    estado,
    fechaPublicacion: estado === 'PUBLICADO' ? new Date('2026-01-01') : null,
    idCategoriaItsp: 5,
    idTipoDocumento: 3,
    idUsuarioCreador: 1,
    fechaCreacion: new Date('2026-01-01'),
    fechaActualizacion: new Date('2026-01-02'),
    categoriaItsp: { nombre: 'Informes institucionales', categoriaPadre: { nombre: 'Rendición de cuentas' } },
    tipoDocumento: { nombre: 'Informe' },
    usuarioCreador: { nombreCompleto: 'Ana Solís' },
  } as unknown as Documento;
}

function montar(
  opciones: {
    documento?: Documento | null;
    cantidadVersiones?: number;
    /** Dependencia del usuario autenticado en la base (para la precarga). */
    idDependenciaDelUsuario?: number | null;
    /** Código de la categoría 5 y de su raíz, para probar la exclusión. */
    codigoCategoria?: string;
    codigoRaiz?: string | null;
    /** Tabla de categorías completa, para los casos de varios niveles. */
    categorias?: Array<Record<string, unknown>>;
  } = {},
) {
  const documento = opciones.documento === undefined ? documentoDe('BORRADOR') : opciones.documento;

  const repositorioDocumentos = {
    findOne: jest.fn().mockResolvedValue(documento),
    save: jest.fn().mockImplementation((entidad) => Promise.resolve(entidad)),
    createQueryBuilder: jest.fn(),
  };
  const repositorioVersiones = {
    count: jest.fn().mockResolvedValue(opciones.cantidadVersiones ?? 1),
    find: jest.fn().mockResolvedValue([]),
  };
  const vacio = { find: jest.fn().mockResolvedValue([]) };
  const repositorioUsuarios = {
    findOne: jest.fn().mockResolvedValue({
      idUsuario: GESTOR.idUsuario,
      idDependencia: opciones.idDependenciaDelUsuario ?? null,
    }),
  };

  // El servicio lee la tabla completa y arma la jerarquía en memoria: la
  // categoría 5 cuelga de la raíz 2, salvo que codigoRaiz sea null.
  const categorias = opciones.categorias ?? [
    ...(opciones.codigoRaiz === null
      ? []
      : [
          {
            idCategoriaItsp: 2,
            idCategoriaPadre: null,
            codigo: opciones.codigoRaiz ?? 'ITSP-02',
            nombre: 'Rendición de cuentas',
            estado: 'ACTIVO',
            orden: 2,
          },
        ]),
    {
      idCategoriaItsp: 5,
      idCategoriaPadre: opciones.codigoRaiz === null ? null : 2,
      codigo: opciones.codigoCategoria ?? 'ITSP-02-02',
      nombre: 'Informes institucionales',
      estado: 'ACTIVO',
      orden: 1,
    },
  ];
  const repositorioCategorias = {
    find: jest.fn().mockResolvedValue(categorias),
  };
  const repositorioTipos = {
    findOne: jest.fn().mockResolvedValue({ idTipoDocumento: 3, estado: 'ACTIVO' }),
  };
  const repositorioDependencias = {
    findOne: jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(
        where.idDependencia === 99
          ? null
          : { idDependencia: where.idDependencia, estado: where.idDependencia === 8 ? 'INACTIVO' : 'ACTIVO' },
      ),
    ),
  };
  const repositorioEtiquetas = { find: jest.fn().mockResolvedValue([]) };

  const gestorTransaccion = {
    create: jest.fn((_entidad, datos) => ({ ...datos })),
    save: jest.fn((entidad) => Promise.resolve({ idDocumento: 1, ...entidad })),
    delete: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const fuenteDatos = {
    transaction: jest.fn((callback) => callback(gestorTransaccion)),
  };

  const almacenamiento = {
    almacenar: jest.fn().mockResolvedValue({
      nombreArchivoSistema: 'uuid.pdf',
      rutaArchivo: 'documentos/uuid.pdf',
      hashArchivo: 'a'.repeat(64),
      algoritmoHash: 'SHA-256',
      tamanoBytes: 1024,
    }),
    descartar: jest.fn().mockResolvedValue(undefined),
  };

  const bitacora = { registrar: jest.fn().mockResolvedValue(undefined) };
  // Caché vacía: el servicio cae al listado de permisos del propio JWT,
  // igual que hace PermisosGuard.
  const cachePermisos = { obtener: jest.fn().mockReturnValue(undefined) };

  const servicio = new DocumentosService(
    repositorioDocumentos as never,
    repositorioVersiones as never,
    repositorioUsuarios as never,
    vacio as never,
    repositorioCategorias as never,
    repositorioTipos as never,
    repositorioDependencias as never,
    repositorioEtiquetas as never,
    fuenteDatos as never,
    almacenamiento as unknown as AlmacenamientoDocumentosService,
    bitacora as unknown as BitacoraService,
    cachePermisos as unknown as CachePermisosService,
  );

  return {
    servicio,
    repositorioUsuarios,
    repositorioDocumentos,
    repositorioVersiones,
    repositorioCategorias,
    repositorioTipos,
    gestorTransaccion,
    fuenteDatos,
    almacenamiento,
    bitacora,
  };
}

const ARCHIVO = {
  originalname: 'informe.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('%PDF-1.7'),
};

describe('DocumentosService', () => {
  describe('visibilidad según permisos', () => {
    it('un perfil de sola consulta no ve un borrador: responde 404, no 403', async () => {
      const { servicio } = montar({ documento: documentoDe('BORRADOR') });

      await expect(servicio.obtener(1, CONSULTANTE)).rejects.toThrow(DocumentoNoEncontradoException);
    });

    it('un perfil de sola consulta tampoco ve un documento inactivo', async () => {
      const { servicio } = montar({ documento: documentoDe('INACTIVO') });

      await expect(servicio.obtener(1, CONSULTANTE)).rejects.toThrow(DocumentoNoEncontradoException);
    });

    it('un perfil de sola consulta sí ve un documento publicado', async () => {
      const { servicio } = montar({ documento: documentoDe('PUBLICADO') });

      await expect(servicio.obtener(1, CONSULTANTE)).resolves.toMatchObject({
        id: 1,
        estado: 'PUBLICADO',
      });
    });

    it('quien administra ve los borradores', async () => {
      const { servicio } = montar({ documento: documentoDe('BORRADOR') });

      await expect(servicio.obtener(1, GESTOR)).resolves.toMatchObject({ estado: 'BORRADOR' });
    });

    it('responde 404 cuando el documento no existe', async () => {
      const { servicio } = montar({ documento: null });

      await expect(servicio.obtener(99, GESTOR)).rejects.toThrow(DocumentoNoEncontradoException);
    });
  });

  describe('registrar', () => {
    const dto = {
      titulo: '  Informe de labores  ',
      anio: 2026,
      idCategoriaItsp: 5,
      idTipoDocumento: 3,
    };

    it('crea el documento en BORRADOR junto con su versión 1', async () => {
      const { servicio, gestorTransaccion } = montar();

      await servicio.registrar(dto as never, ARCHIVO, GESTOR);

      const documentoCreado = gestorTransaccion.create.mock.calls[0][1];
      expect(documentoCreado).toMatchObject({
        titulo: 'Informe de labores', // se recorta al guardar
        estado: 'BORRADOR',
        idUsuarioCreador: GESTOR.idUsuario,
      });

      const versionCreada = gestorTransaccion.create.mock.calls[1][1];
      expect(versionCreada).toMatchObject({
        numeroVersion: 1,
        nombreArchivoOriginal: 'informe.pdf',
        nombreArchivoSistema: 'uuid.pdf',
        mimeType: 'application/pdf',
        algoritmoHash: 'SHA-256',
      });
    });

    it('registra CREAR_DOCUMENTO en la bitácora con el hash y el tamaño', async () => {
      const { servicio, bitacora } = montar();

      await servicio.registrar(dto as never, ARCHIVO, GESTOR);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR_DOCUMENTO',
          entidad: 'documentos',
          idUsuario: GESTOR.idUsuario,
          detalles: expect.objectContaining({ hashArchivo: 'a'.repeat(64), tamanoBytes: 1024 }),
        }),
      );
    });

    // Si la transacción falla, el PDF ya está en disco y nadie lo
    // referencia: quedaría ocupando espacio para siempre.
    it('descarta el archivo escrito si la transacción falla', async () => {
      const { servicio, fuenteDatos, almacenamiento } = montar();
      fuenteDatos.transaction.mockRejectedValueOnce(new Error('fallo de base de datos'));

      await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).rejects.toThrow(
        'fallo de base de datos',
      );
      expect(almacenamiento.descartar).toHaveBeenCalledWith('documentos/uuid.pdf');
    });

    it('rechaza una categoría inactiva antes de tocar el disco', async () => {
      const { servicio, repositorioCategorias, almacenamiento } = montar();
      repositorioCategorias.find.mockResolvedValue([
        { idCategoriaItsp: 5, idCategoriaPadre: null, codigo: 'ITSP-05', nombre: 'X', estado: 'INACTIVO', orden: 0 },
      ]);

      await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).rejects.toThrow(
        ClasificacionInvalidaException,
      );
      expect(almacenamiento.almacenar).not.toHaveBeenCalled();
    });

    it('rechaza un tipo documental inexistente', async () => {
      const { servicio, repositorioTipos } = montar();
      repositorioTipos.findOne.mockResolvedValue(null);

      await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).rejects.toThrow(
        /tipo documental seleccionado no existe/,
      );
    });
  });

  describe('publicar (VP-03 / RN-009)', () => {
    it('exige al menos una versión cargada', async () => {
      const { servicio } = montar({ documento: documentoDe('BORRADOR'), cantidadVersiones: 0 });

      await expect(servicio.publicar(1, GESTOR)).rejects.toThrow(DocumentoNoPublicableException);
    });

    it('publica y sella la fecha cuando hay versión', async () => {
      const { servicio, repositorioDocumentos } = montar({
        documento: documentoDe('BORRADOR'),
        cantidadVersiones: 1,
      });

      await servicio.publicar(1, GESTOR);

      const guardado = repositorioDocumentos.save.mock.calls[0][0];
      expect(guardado.estado).toBe('PUBLICADO');
      expect(guardado.fechaPublicacion).toBeInstanceOf(Date);
    });

    it('registra PUBLICAR_DOCUMENTO en la bitácora', async () => {
      const { servicio, bitacora } = montar({ documento: documentoDe('BORRADOR') });

      await servicio.publicar(1, GESTOR, 'aprobado por la jefatura');

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'PUBLICAR_DOCUMENTO',
          idRegistro: 1,
          detalles: { motivo: 'aprobado por la jefatura' },
        }),
      );
    });

    it('rechaza publicar un documento ya publicado', async () => {
      const { servicio } = montar({ documento: documentoDe('PUBLICADO') });

      await expect(servicio.publicar(1, GESTOR)).rejects.toThrow(/ya está publicado/);
    });

    it('rechaza publicar un documento inactivo', async () => {
      const { servicio } = montar({ documento: documentoDe('INACTIVO') });

      await expect(servicio.publicar(1, GESTOR)).rejects.toThrow(TransicionEstadoInvalidaException);
    });
  });

  describe('despublicar (RF-025)', () => {
    // El ENUM no tiene DESPUBLICADO: despublicar devuelve el documento a
    // BORRADOR, donde vuelve a ser editable y republicable.
    it('devuelve el documento a BORRADOR y limpia la fecha de publicación', async () => {
      const { servicio, repositorioDocumentos } = montar({ documento: documentoDe('PUBLICADO') });

      await servicio.despublicar(1, GESTOR);

      const guardado = repositorioDocumentos.save.mock.calls[0][0];
      expect(guardado.estado).toBe('BORRADOR');
      expect(guardado.fechaPublicacion).toBeNull();
    });

    it('rechaza despublicar algo que no está publicado', async () => {
      const { servicio } = montar({ documento: documentoDe('BORRADOR') });

      await expect(servicio.despublicar(1, GESTOR)).rejects.toThrow(
        /Sólo se puede despublicar un documento que está publicado/,
      );
    });
  });

  describe('inactivar (RN-007)', () => {
    it('cambia el estado a INACTIVO sin borrar la fila', async () => {
      const { servicio, repositorioDocumentos } = montar({ documento: documentoDe('PUBLICADO') });

      await servicio.inactivar(1, GESTOR);

      expect(repositorioDocumentos.save).toHaveBeenCalledTimes(1);
      expect(repositorioDocumentos.save.mock.calls[0][0].estado).toBe('INACTIVO');
      // Ningún camino del servicio llama a delete/remove sobre documentos.
      expect((repositorioDocumentos as Record<string, unknown>).delete).toBeUndefined();
    });

    it('registra INACTIVAR_DOCUMENTO en la bitácora', async () => {
      const { servicio, bitacora } = montar({ documento: documentoDe('PUBLICADO') });

      await servicio.inactivar(1, GESTOR);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'INACTIVAR_DOCUMENTO', entidad: 'documentos' }),
      );
    });

    it('rechaza inactivar algo ya inactivo', async () => {
      const { servicio } = montar({ documento: documentoDe('INACTIVO') });

      await expect(servicio.inactivar(1, GESTOR)).rejects.toThrow(/ya está inactivo/);
    });
  });

  describe('actualizar metadatos', () => {
    it('rechaza editar un documento inactivo', async () => {
      const { servicio } = montar({ documento: documentoDe('INACTIVO') });

      await expect(servicio.actualizar(1, { titulo: 'Otro' }, GESTOR)).rejects.toThrow(
        /No se pueden editar los metadatos de un documento inactivo/,
      );
    });

    it('recorta el título y deja constancia de los campos modificados', async () => {
      const { servicio, gestorTransaccion, bitacora } = montar({
        documento: documentoDe('BORRADOR'),
      });

      await servicio.actualizar(1, { titulo: '  Nuevo título  ' }, GESTOR);

      expect(gestorTransaccion.update.mock.calls[0][2].titulo).toBe('Nuevo título');
      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'ACTUALIZAR_DOCUMENTO',
          detalles: { camposModificados: ['titulo'] },
        }),
      );
    });

    // Omitir el campo deja las asociaciones como estaban; enviarlo vacío
    // es una instrucción explícita de borrarlas.
    it('no toca las relaciones N:M si el cliente no las envía', async () => {
      const { servicio, gestorTransaccion } = montar({ documento: documentoDe('BORRADOR') });

      await servicio.actualizar(1, { titulo: 'Nuevo' }, GESTOR);

      expect(gestorTransaccion.delete).not.toHaveBeenCalled();
    });

    it('borra las relaciones N:M cuando se envía una lista vacía', async () => {
      const { servicio, gestorTransaccion } = montar({ documento: documentoDe('BORRADOR') });

      await servicio.actualizar(1, { etiquetas: [] }, GESTOR);

      expect(gestorTransaccion.delete).toHaveBeenCalledTimes(1);
      expect(gestorTransaccion.insert).not.toHaveBeenCalled();
    });
  });
});

// =====================================================================
// Pulido de Fase 6: dependencia única, exclusión en backend y
// "confirmar y publicar"
// =====================================================================

describe('DocumentosService — dependencia única (sección A)', () => {
  const dto = { titulo: 'Informe', anio: 2026, idCategoriaItsp: 5, idTipoDocumento: 3 };

  it('precarga la dependencia del usuario autenticado cuando el cliente no la envía', async () => {
    const { servicio, gestorTransaccion } = montar({ idDependenciaDelUsuario: 4 });

    await servicio.registrar(dto as never, ARCHIVO, GESTOR);

    expect(gestorTransaccion.create.mock.calls[0][1]).toMatchObject({ idDependencia: 4 });
  });

  it('deja la dependencia en null si el usuario tampoco tiene una', async () => {
    const { servicio, gestorTransaccion } = montar({ idDependenciaDelUsuario: null });

    await servicio.registrar(dto as never, ARCHIVO, GESTOR);

    expect(gestorTransaccion.create.mock.calls[0][1]).toMatchObject({ idDependencia: null });
  });

  // Precarga, no imposición: permite registrar en nombre de otra dependencia.
  it('respeta la dependencia enviada explícitamente aunque difiera de la del usuario', async () => {
    const { servicio, gestorTransaccion, repositorioUsuarios } = montar({ idDependenciaDelUsuario: 4 });

    await servicio.registrar({ ...dto, idDependencia: 6 } as never, ARCHIVO, GESTOR);

    expect(gestorTransaccion.create.mock.calls[0][1]).toMatchObject({ idDependencia: 6 });
    // Ni siquiera consulta la del usuario: la enviada manda.
    expect(repositorioUsuarios.findOne).not.toHaveBeenCalled();
  });

  it('rechaza una dependencia inexistente', async () => {
    const { servicio } = montar();

    await expect(
      servicio.registrar({ ...dto, idDependencia: 99 } as never, ARCHIVO, GESTOR),
    ).rejects.toThrow(/dependencia seleccionada no existe/);
  });

  it('rechaza una dependencia inactiva', async () => {
    const { servicio } = montar();

    await expect(
      servicio.registrar({ ...dto, idDependencia: 8 } as never, ARCHIVO, GESTOR),
    ).rejects.toThrow(/dependencia seleccionada está inactiva/);
  });

  it('al editar, null explícito quita la dependencia y omitirla la conserva', async () => {
    const conDependencia = { ...documentoDe('BORRADOR'), idDependencia: 4 } as Documento;
    const { servicio, gestorTransaccion } = montar({ documento: conDependencia });

    await servicio.actualizar(1, { titulo: 'Otro' }, GESTOR);
    // Omitida: la columna no viaja en el UPDATE, así que conserva su valor.
    expect(gestorTransaccion.update.mock.calls[0][2]).not.toHaveProperty('idDependencia');

    await servicio.actualizar(1, { idDependencia: null }, GESTOR);
    // null explícito: sí viaja, y como null. Se usa update y no save porque
    // save persistiría la FK desde la relación cargada e ignoraría el null.
    expect(gestorTransaccion.update.mock.calls[1][2].idDependencia).toBeNull();
  });
});

describe('DocumentosService — exclusión de "Participación ciudadana" (sección F)', () => {
  const dto = { titulo: 'Informe', anio: 2026, idCategoriaItsp: 5, idTipoDocumento: 3 };

  it('rechaza clasificar en la raíz ITSP-03', async () => {
    const { servicio, almacenamiento } = montar({ codigoCategoria: 'ITSP-03', codigoRaiz: null });

    await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).rejects.toThrow(
      "La categoría 'Participación ciudadana' no es válida para clasificar documentos.",
    );
    expect(almacenamiento.almacenar).not.toHaveBeenCalled();
  });

  it('rechaza clasificar en una subsección de ITSP-03', async () => {
    const { servicio } = montar({ codigoCategoria: 'ITSP-03-01', codigoRaiz: 'ITSP-03' });

    await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).rejects.toThrow(
      ClasificacionInvalidaException,
    );
  });

  it('también lo rechaza al editar los metadatos', async () => {
    const { servicio } = montar({ codigoCategoria: 'ITSP-03-01', codigoRaiz: 'ITSP-03' });

    await expect(servicio.actualizar(1, { idCategoriaItsp: 5 }, GESTOR)).rejects.toThrow(
      /Participación ciudadana/,
    );
  });

  it('rechaza un nieto de ITSP-03, aunque su código no lleve el prefijo', async () => {
    const { servicio } = montar({
      categorias: [
        { idCategoriaItsp: 3, idCategoriaPadre: null, codigo: 'ITSP-03', nombre: 'Participación', estado: 'ACTIVO', orden: 3 },
        { idCategoriaItsp: 4, idCategoriaPadre: 3, codigo: 'ITSP-03-01', nombre: 'Info', estado: 'ACTIVO', orden: 1 },
        { idCategoriaItsp: 5, idCategoriaPadre: 4, codigo: 'IRREGULAR', nombre: 'Nieto', estado: 'ACTIVO', orden: 1 },
      ],
    });

    await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).rejects.toThrow(
      /Participación ciudadana/,
    );
  });

  it('acepta cualquier otra categoría', async () => {
    const { servicio } = montar({ codigoCategoria: 'ITSP-02-02', codigoRaiz: 'ITSP-02' });

    await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).resolves.toBeDefined();
  });
});

describe('DocumentosService — registrar y publicar en una operación (sección D.1)', () => {
  const dto = { titulo: 'Informe', anio: 2026, idCategoriaItsp: 5, idTipoDocumento: 3 };

  it('publica inmediatamente cuando se pide y el usuario puede publicar', async () => {
    const { servicio, bitacora } = montar({ cantidadVersiones: 1 });

    await servicio.registrar({ ...dto, publicarInmediatamente: true } as never, ARCHIVO, GESTOR);

    const acciones = bitacora.registrar.mock.calls.map(([datos]) => datos.accion);
    expect(acciones).toEqual(['CREAR_DOCUMENTO', 'PUBLICAR_DOCUMENTO']);
  });

  it('se queda en borrador cuando no se pide', async () => {
    const { servicio, bitacora } = montar();

    await servicio.registrar(dto as never, ARCHIVO, GESTOR);

    const acciones = bitacora.registrar.mock.calls.map(([datos]) => datos.accion);
    expect(acciones).toEqual(['CREAR_DOCUMENTO']);
  });

  it('rechaza publicar inmediatamente sin el permiso de publicar, antes de escribir nada', async () => {
    const { servicio, almacenamiento } = montar();
    const soloCrea: PayloadJwt = { ...GESTOR, permisos: ['documentos.crear'] };

    await expect(
      servicio.registrar({ ...dto, publicarInmediatamente: true } as never, ARCHIVO, soloCrea),
    ).rejects.toThrow(PermisoDenegadoException);
    expect(almacenamiento.almacenar).not.toHaveBeenCalled();
  });
});

describe('DocumentosService — categorías de varios niveles (spec-ajustes-niveles-y-estados)', () => {
  const dto = { titulo: 'Informe', anio: 2026, idCategoriaItsp: 5, idTipoDocumento: 3 };
  // 1 Información institucional > 4 Organización > 5 Organigramas
  const TRES_NIVELES = (estadoIntermedia: string) => [
    { idCategoriaItsp: 1, idCategoriaPadre: null, codigo: 'ITSP-01', nombre: 'Información institucional', estado: 'ACTIVO', orden: 1 },
    { idCategoriaItsp: 4, idCategoriaPadre: 1, codigo: 'ITSP-01-02', nombre: 'Organización', estado: estadoIntermedia, orden: 1 },
    { idCategoriaItsp: 5, idCategoriaPadre: 4, codigo: 'ITSP-01-02-01', nombre: 'Organigramas', estado: 'ACTIVO', orden: 1 },
  ];

  it('clasifica en un nodo profundo activo', async () => {
    const { servicio } = montar({ categorias: TRES_NIVELES('ACTIVO') });

    await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).resolves.toBeDefined();
  });

  it('rechaza un nodo activo cuya categoría superior está inactiva (D-6)', async () => {
    const { servicio, almacenamiento } = montar({ categorias: TRES_NIVELES('INACTIVO') });

    await expect(servicio.registrar(dto as never, ARCHIVO, GESTOR)).rejects.toThrow(
      'La categoría ITSP seleccionada no está disponible: una categoría superior está inactiva',
    );
    expect(almacenamiento.almacenar).not.toHaveBeenCalled();
  });

  it('devuelve la raíz real y la ruta completa de la categoría (D-8)', async () => {
    const { servicio } = montar({ categorias: TRES_NIVELES('ACTIVO') });

    const documento = await servicio.obtener(1, GESTOR);

    expect(documento.nombreCategoriaRaiz).toBe('Información institucional');
    expect(documento.rutaCategoria).toEqual(['Información institucional', 'Organización']);
  });
});
