// src/publico/portal-publico.service.spec.ts
//
// Las 21 pruebas del spec 14.1. Dos niveles, a propósito:
//
//   - Nivel de servicio, con repositorios dobles: qué decide el servicio,
//     qué rechaza y con qué excepción. Mismo criterio que
//     documentos.service.spec.ts.
//   - Nivel HTTP, con supertest (ya estaba en el proyecto) sobre una
//     aplicación Nest real: cabeceras, 304, forma del cuerpo de error y
//     429. Eso no se puede comprobar llamando al servicio a mano, porque
//     lo producen el filtro global, el ValidationPipe y el ThrottlerGuard.
//
// Lo que NO se prueba aquí es que MySQL filtre por estado: eso lo verifica
// la ejecución real contra la base. Lo que sí se fija es que la consulta
// lleve la condición, que es lo que puede desaparecer en un refactor.

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { Readable } from 'node:stream';

import { ExcepcionGlobalFilter } from '../comun/filtros/excepcion-global.filter';
import {
  DocumentoPublicoNoDisponibleException,
  RecursoPublicoNoDisponibleException,
} from '../comun/excepciones/excepciones-portal-publico';
import { ArchivoNoDisponibleException } from '../comun/excepciones/excepciones-documentos';
import { BitacoraService } from '../bitacora/bitacora.service';
import { AlmacenamientoDocumentosService } from '../documentos/almacenamiento-documentos.service';
import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { Documento } from '../entidades/documento.entidad';
import { VersionDocumento } from '../entidades/version-documento.entidad';

import { PortalPublicoService } from './portal-publico.service';
import { PortalPublicoController } from './portal-publico.controller';
import { MENSAJE_DEMASIADAS_SOLICITUDES } from './filtro-throttler-publico';

// =====================================================================
// Dobles
// =====================================================================

/** Constructor de consultas falso: todo encadena salvo los terminales. */
function constructorFalso(terminales: Record<string, unknown>) {
  const doble: Record<string, unknown> = {};
  const encadenables = [
    'select',
    'addSelect',
    'from',
    'innerJoin',
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'groupBy',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ];

  for (const metodo of encadenables) {
    doble[metodo] = jest.fn(() => doble);
  }
  for (const [metodo, valor] of Object.entries(terminales)) {
    doble[metodo] = jest.fn(async () => valor);
  }
  return doble;
}

function categoria(datos: Partial<CategoriaItsp>): CategoriaItsp {
  return {
    idCategoriaItsp: 1,
    idCategoriaPadre: null,
    codigo: 'ITSP-01',
    nombre: 'Información institucional',
    descripcion: null,
    nivel: 1,
    orden: 1,
    estado: 'ACTIVO',
    ...datos,
  } as CategoriaItsp;
}

function documento(datos: Partial<Documento> = {}): Documento {
  return {
    idDocumento: 42,
    titulo: 'Informe de labores 2025',
    descripcion: 'Informe anual.',
    anio: 2025,
    estado: 'PUBLICADO',
    fechaPublicacion: new Date('2026-03-14T15:22:08.000Z'),
    idCategoriaItsp: 11,
    idTipoDocumento: 3,
    idDependencia: 2,
    idUsuarioCreador: 1,
    fechaCreacion: new Date('2026-01-01'),
    fechaActualizacion: new Date('2026-01-02'),
    tipoDocumento: { nombre: 'Informe' },
    dependencia: { nombre: 'Alcaldía' },
    ...datos,
  } as unknown as Documento;
}

function version(datos: Partial<VersionDocumento> = {}): VersionDocumento {
  return {
    idVersion: 7,
    idDocumento: 42,
    numeroVersion: 1,
    nombreArchivoOriginal: 'informe.pdf',
    nombreArchivoSistema: '8f14e45f.pdf',
    rutaArchivo: '2026/8f14e45f.pdf',
    hashArchivo: 'a'.repeat(64),
    algoritmoHash: 'SHA-256',
    tamanoBytes: '2458112',
    mimeType: 'application/pdf',
    numeroPaginas: 58,
    comentarioVersion: null,
    idUsuarioCarga: 1,
    fechaCarga: new Date('2026-03-14'),
    ...datos,
  } as unknown as VersionDocumento;
}

interface OpcionesMontaje {
  categorias?: CategoriaItsp[];
  categoriaUnica?: CategoriaItsp | null;
  documentoUnico?: Documento | null;
  documentosDelListado?: Documento[];
  totalDelListado?: number;
  conteos?: { idCategoria: number; total: string }[];
  versionesVigentes?: VersionDocumento[];
  versionUnica?: VersionDocumento | null;
  etiquetas?: { idDocumento: number; nombre: string }[];
  fallaElArchivo?: boolean;
}

function montar(opciones: OpcionesMontaje = {}) {
  const bitacoraService = { registrar: jest.fn() };

  const constructorDocumentos = constructorFalso({
    getManyAndCount: [opciones.documentosDelListado ?? [], opciones.totalDelListado ?? 0],
    getRawMany: opciones.conteos ?? [],
  });

  const constructorEtiquetas = constructorFalso({
    getRawMany: opciones.etiquetas ?? [],
  });

  const constructorVersiones = constructorFalso({
    getMany: opciones.versionesVigentes ?? [],
  });

  const repositorioCategorias = {
    find: jest.fn(async () => opciones.categorias ?? []),
    findOne: jest.fn(async () =>
      opciones.categoriaUnica === undefined ? null : opciones.categoriaUnica,
    ),
  };

  const repositorioDocumentos = {
    findOne: jest.fn(async () =>
      opciones.documentoUnico === undefined ? null : opciones.documentoUnico,
    ),
    createQueryBuilder: jest.fn(() => constructorDocumentos),
    manager: { createQueryBuilder: jest.fn(() => constructorEtiquetas) },
  };

  const repositorioVersiones = {
    findOne: jest.fn(async () =>
      opciones.versionUnica === undefined ? null : opciones.versionUnica,
    ),
    createQueryBuilder: jest.fn(() => constructorVersiones),
  };

  const almacenamiento = {
    abrirLectura: jest.fn(async () => {
      if (opciones.fallaElArchivo) {
        throw new ArchivoNoDisponibleException();
      }
      return Readable.from(['%PDF-1.4']);
    }),
  };

  const servicio = new PortalPublicoService(
    repositorioCategorias as never,
    repositorioDocumentos as never,
    repositorioVersiones as never,
    almacenamiento as never,
  );

  return {
    servicio,
    repositorioCategorias,
    repositorioDocumentos,
    repositorioVersiones,
    almacenamiento,
    bitacoraService,
    constructorDocumentos,
  };
}

/** Las cuatro raíces y una subsección de cada una de las dos primeras. */
function arbolDePrueba(): CategoriaItsp[] {
  return [
    categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01', nombre: 'Información institucional', orden: 1 }),
    categoria({ idCategoriaItsp: 2, codigo: 'ITSP-02', nombre: 'Rendición de cuentas', orden: 2 }),
    categoria({ idCategoriaItsp: 3, codigo: 'ITSP-03', nombre: 'Participación ciudadana', orden: 3 }),
    categoria({ idCategoriaItsp: 4, codigo: 'ITSP-04', nombre: 'Datos abiertos de gobierno', orden: 4 }),
    categoria({
      idCategoriaItsp: 11,
      idCategoriaPadre: 1,
      codigo: 'ITSP-01-01',
      nombre: 'Información institucional básica',
      nivel: 2,
      orden: 1,
    }),
    categoria({
      idCategoriaItsp: 12,
      idCategoriaPadre: 1,
      codigo: 'ITSP-01-02',
      nombre: 'Organización y funciones',
      nivel: 2,
      orden: 2,
    }),
    categoria({
      idCategoriaItsp: 31,
      idCategoriaPadre: 3,
      codigo: 'ITSP-03-01',
      nombre: 'Información',
      nivel: 2,
      orden: 1,
    }),
  ];
}

// =====================================================================
// Nivel de servicio
// =====================================================================

describe('PortalPublicoService', () => {
  describe('listado de una subsección', () => {
    it('1. un documento PUBLICADO en una subsección activa aparece en el listado', async () => {
      const { servicio } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }),
        documentosDelListado: [documento()],
        totalDelListado: 1,
        versionesVigentes: [version()],
        etiquetas: [{ idDocumento: 42, nombre: 'Rendición de cuentas' }],
      });

      // La subsección se resuelve con el mismo findOne que la sección, así
      // que se le devuelve una raíz y luego una hija: ver la prueba 11 para
      // el caso en que la jerarquía no cuadra.
      const resultado = await servicio.listarDocumentosDeSeccion('itsp-01', {});

      expect(resultado.total).toBe(1);
      expect(resultado.datos).toHaveLength(1);
      expect(resultado.datos[0]).toMatchObject({
        id: 42,
        titulo: 'Informe de labores 2025',
        tipoDocumento: 'Informe',
        dependencia: 'Alcaldía',
        etiquetas: ['Rendición de cuentas'],
      });
    });

    it('2 y 3. la consulta exige estado PUBLICADO, de modo que BORRADOR e INACTIVO no pueden salir', async () => {
      const { servicio, constructorDocumentos } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }),
      });

      await servicio.listarDocumentosDeSeccion('itsp-01', {});

      const condiciones = (constructorDocumentos.andWhere as jest.Mock).mock.calls;
      expect(condiciones).toContainEqual([
        'documento.estado = :estado',
        { estado: 'PUBLICADO' },
      ]);
    });

    it('4. una subsección INACTIVA no se resuelve: 404', async () => {
      // El findOne de la subsección filtra por estado ACTIVO, así que una
      // inactiva vuelve como null igual que una inexistente.
      const { servicio, repositorioCategorias } = montar();
      repositorioCategorias.findOne
        .mockResolvedValueOnce(categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }))
        .mockResolvedValueOnce(null as never);

      await expect(
        servicio.listarDocumentosDeSubseccion('itsp-01', 'itsp-01-01', {}),
      ).rejects.toBeInstanceOf(RecursoPublicoNoDisponibleException);
    });

    it('5. si la sección padre está INACTIVA, su subsección deja de ser alcanzable', async () => {
      const { servicio } = montar({ categoriaUnica: null });

      await expect(
        servicio.listarDocumentosDeSubseccion('itsp-02', 'itsp-02-01', {}),
      ).rejects.toBeInstanceOf(RecursoPublicoNoDisponibleException);
    });

    it('6. de un documento con 3 versiones toma el numeroPaginas y el tamanoBytes de la tercera', async () => {
      const { servicio } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }),
        documentosDelListado: [documento()],
        totalDelListado: 1,
        // La consulta ya devuelve solo la vigente; aquí se fija que el DTO
        // use sus valores y no los de otra.
        versionesVigentes: [version({ numeroVersion: 3, numeroPaginas: 120, tamanoBytes: '999999' })],
      });

      const resultado = await servicio.listarDocumentosDeSeccion('itsp-01', {});

      expect(resultado.datos[0].numeroPaginas).toBe(120);
      expect(resultado.datos[0].tamanoBytes).toBe(999999);
    });

    it('7. un documento publicado sin ninguna versión se omite, sin excepción', async () => {
      const { servicio } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }),
        documentosDelListado: [documento({ idDocumento: 42 }), documento({ idDocumento: 43 })],
        totalDelListado: 2,
        versionesVigentes: [version({ idDocumento: 42 })],
      });

      const resultado = await servicio.listarDocumentosDeSeccion('itsp-01', {});

      expect(resultado.datos.map((fila) => fila.id)).toEqual([42]);
    });

    it('8. una subsección sin documentos responde con datos vacíos y total 0, no con un error', async () => {
      const { servicio, repositorioCategorias } = montar();
      repositorioCategorias.findOne
        .mockResolvedValueOnce(categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }))
        .mockResolvedValueOnce(
          categoria({ idCategoriaItsp: 11, idCategoriaPadre: 1, codigo: 'ITSP-01-01' }) as never,
        );

      const resultado = await servicio.listarDocumentosDeSubseccion('itsp-01', 'itsp-01-01', {});

      expect(resultado).toMatchObject({ datos: [], total: 0, pagina: 1, limite: 20 });
    });

    it('11. una subsección que no cuelga de la sección indicada da 404', async () => {
      const { servicio, repositorioCategorias } = montar();
      repositorioCategorias.findOne
        // itsp-02 existe y es raíz...
        .mockResolvedValueOnce(categoria({ idCategoriaItsp: 2, codigo: 'ITSP-02' }))
        // ...pero itsp-01-01 cuelga de la raíz 1, no de la 2.
        .mockResolvedValueOnce(
          categoria({ idCategoriaItsp: 11, idCategoriaPadre: 1, codigo: 'ITSP-01-01' }) as never,
        );

      await expect(
        servicio.listarDocumentosDeSubseccion('itsp-02', 'itsp-01-01', {}),
      ).rejects.toBeInstanceOf(RecursoPublicoNoDisponibleException);
    });

    it('12. un código de sección inexistente da 404', async () => {
      const { servicio } = montar({ categoriaUnica: null });

      await expect(servicio.obtenerSeccion('itsp-99')).rejects.toBeInstanceOf(
        RecursoPublicoNoDisponibleException,
      );
    });

    it('13. un código de subsección usado como sección da 404', async () => {
      const { servicio } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 11, idCategoriaPadre: 1, codigo: 'ITSP-01-01' }),
      });

      await expect(servicio.obtenerSeccion('itsp-01-01')).rejects.toBeInstanceOf(
        RecursoPublicoNoDisponibleException,
      );
    });

    it('16. el DTO del listado no lleva ningún campo interno', async () => {
      const { servicio } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }),
        documentosDelListado: [documento()],
        totalDelListado: 1,
        versionesVigentes: [version()],
      });

      const resultado = await servicio.listarDocumentosDeSeccion('itsp-01', {});
      const campos = Object.keys(resultado.datos[0]);

      for (const prohibido of [
        'estado',
        'idUsuarioCreador',
        'nombreUsuarioCreador',
        'rutaArchivo',
        'nombreArchivoSistema',
        'hashArchivo',
        'algoritmoHash',
        'idCategoriaItsp',
        'idTipoDocumento',
        'idDependencia',
        'fechaCreacion',
        'fechaActualizacion',
        'cantidadVersiones',
        'versiones',
        'numeroVersion',
        'nombreArchivoOriginal',
      ]) {
        expect(campos).not.toContain(prohibido);
      }

      expect(campos.sort()).toEqual(
        [
          'anio',
          'dependencia',
          'descripcion',
          'etiquetas',
          'fechaPublicacion',
          'id',
          'numeroPaginas',
          'tamanoBytes',
          'tipoDocumento',
          'titulo',
        ].sort(),
      );
    });

    it('19. un documento clasificado directamente en una raíz se lista por la ruta de la sección', async () => {
      const { servicio, repositorioDocumentos } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }),
        documentosDelListado: [documento({ idCategoriaItsp: 1 })],
        totalDelListado: 1,
        versionesVigentes: [version()],
      });

      const resultado = await servicio.listarDocumentosDeSeccion('itsp-01', {});

      expect(resultado.datos).toHaveLength(1);
      // Se consulta por el id de la raíz, no por el de ninguna subsección.
      const constructor = repositorioDocumentos.createQueryBuilder.mock.results[0]
        .value as Record<string, jest.Mock>;
      expect(constructor.where).toHaveBeenCalledWith(
        'documento.idCategoriaItsp = :idCategoriaItsp',
        { idCategoriaItsp: 1 },
      );
    });

    it('21. el código funciona en mayúsculas y en minúsculas, sin normalizarlo', async () => {
      const { servicio, repositorioCategorias } = montar({
        categoriaUnica: categoria({ idCategoriaItsp: 1, codigo: 'ITSP-01' }),
      });

      await servicio.obtenerSeccion('ITSP-01');
      await servicio.obtenerSeccion('itsp-01');

      // El servicio pasa el código tal cual: la colación de la columna
      // (utf8mb4_0900_ai_ci) es la que lo hace insensible a mayúsculas.
      const codigosConsultados = repositorioCategorias.findOne.mock.calls.map(
        (llamada) => (llamada[0] as { where: { codigo: string } }).where.codigo,
      );
      expect(codigosConsultados).toEqual(['ITSP-01', 'itsp-01']);
    });
  });

  describe('árbol de secciones', () => {
    it('17. ITSP-03 aparece en el árbol y ninguna categoría inactiva lo hace', async () => {
      const { servicio } = montar({
        categorias: arbolDePrueba(),
        conteos: [
          { idCategoria: 11, total: '7' },
          { idCategoria: 12, total: '3' },
        ],
      });

      const arbol = await servicio.obtenerArbol();

      expect(arbol.map((seccion) => seccion.codigo)).toEqual([
        'itsp-01',
        'itsp-02',
        'itsp-03',
        'itsp-04',
      ]);
      // Participación ciudadana sale como las demás: la exclusión es para
      // clasificar, no para mostrar (spec 11.3).
      expect(arbol[2].subsecciones.map((hija) => hija.codigo)).toEqual(['itsp-03-01']);
      // El find ya filtra por ACTIVO: ninguna inactiva llega hasta aquí.
      expect(arbol).toHaveLength(4);
    });

    it('el conteo de una raíz suma sus subsecciones y lo que cuelga de ella misma', async () => {
      const { servicio } = montar({
        categorias: arbolDePrueba(),
        conteos: [
          { idCategoria: 1, total: '2' },
          { idCategoria: 11, total: '7' },
          { idCategoria: 12, total: '3' },
        ],
      });

      const arbol = await servicio.obtenerArbol();

      expect(arbol[0].cantidadDocumentos).toBe(12);
      expect(arbol[0].subsecciones.map((hija) => hija.cantidadDocumentos)).toEqual([7, 3]);
      expect(arbol[1].cantidadDocumentos).toBe(0);
    });

    it('el conteo se resuelve con una sola consulta agrupada, no una por subsección', async () => {
      const { servicio, repositorioDocumentos } = montar({ categorias: arbolDePrueba() });

      await servicio.obtenerArbol();

      expect(repositorioDocumentos.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('los DTO del árbol no llevan id, nivel, estado ni fechas', async () => {
      const { servicio } = montar({ categorias: arbolDePrueba() });

      const arbol = await servicio.obtenerArbol();
      const campos = Object.keys(arbol[0]);

      for (const prohibido of [
        'id',
        'idCategoriaItsp',
        'nivel',
        'estado',
        'idCategoriaPadre',
        'fechaCreacion',
        'fechaActualizacion',
      ]) {
        expect(campos).not.toContain(prohibido);
      }
      expect(Object.keys(arbol[0].subsecciones[0]).sort()).toEqual(
        ['cantidadDocumentos', 'codigo', 'descripcion', 'nombre', 'orden'].sort(),
      );
    });
  });

  describe('resolución del archivo', () => {
    it('9. un documento en BORRADOR da el 404 genérico', async () => {
      // El findOne filtra por estado PUBLICADO: un borrador vuelve null.
      const { servicio } = montar({ documentoUnico: null });

      await expect(servicio.resolverArchivoPublico(42)).rejects.toBeInstanceOf(
        RecursoPublicoNoDisponibleException,
      );
    });

    it('un documento publicado en una categoría inactiva da 404', async () => {
      const { servicio } = montar({
        documentoUnico: documento({
          categoriaItsp: categoria({ idCategoriaItsp: 11, idCategoriaPadre: 1, estado: 'INACTIVO' }),
        } as Partial<Documento>),
      });

      await expect(servicio.resolverArchivoPublico(42)).rejects.toBeInstanceOf(
        RecursoPublicoNoDisponibleException,
      );
    });

    it('un documento publicado cuya SECCIÓN PADRE está inactiva da 404', async () => {
      const { servicio } = montar({
        documentoUnico: documento({
          categoriaItsp: categoria({
            idCategoriaItsp: 11,
            idCategoriaPadre: 1,
            estado: 'ACTIVO',
            categoriaPadre: categoria({ idCategoriaItsp: 1, estado: 'INACTIVO' }),
          } as Partial<CategoriaItsp>),
        } as Partial<Documento>),
      });

      await expect(servicio.resolverArchivoPublico(42)).rejects.toBeInstanceOf(
        RecursoPublicoNoDisponibleException,
      );
    });

    it('un documento publicado sin versiones da 404 y no un error del servidor', async () => {
      const { servicio } = montar({
        documentoUnico: documento({
          categoriaItsp: categoria({
            idCategoriaItsp: 11,
            idCategoriaPadre: 1,
            categoriaPadre: categoria({ idCategoriaItsp: 1 }),
          } as Partial<CategoriaItsp>),
        } as Partial<Documento>),
        versionUnica: null,
      });

      await expect(servicio.resolverArchivoPublico(42)).rejects.toBeInstanceOf(
        RecursoPublicoNoDisponibleException,
      );
    });

    it('devuelve el hash y el tamaño de la versión vigente', async () => {
      const { servicio, repositorioVersiones } = montar({
        documentoUnico: documento({
          categoriaItsp: categoria({
            idCategoriaItsp: 11,
            idCategoriaPadre: 1,
            categoriaPadre: categoria({ idCategoriaItsp: 1 }),
          } as Partial<CategoriaItsp>),
        } as Partial<Documento>),
        versionUnica: version({ numeroVersion: 3, hashArchivo: 'b'.repeat(64) }),
      });

      const resultado = await servicio.resolverArchivoPublico(42);

      expect(resultado.hashArchivo).toBe('b'.repeat(64));
      expect(resultado.tamanoBytes).toBe(2458112);
      // La vigente es la de mayor numeroVersion.
      expect(repositorioVersiones.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ order: { numeroVersion: 'DESC' } }),
      );
    });

    it('18. abrir el archivo no registra nada en la bitácora', async () => {
      const { servicio, bitacoraService } = montar({});

      await servicio.abrirArchivo('2026/8f14e45f.pdf');

      expect(bitacoraService.registrar).not.toHaveBeenCalled();
    });

    it('traduce el 410 del almacenamiento al 503 público', async () => {
      const { servicio } = montar({ fallaElArchivo: true });

      await expect(servicio.abrirArchivo('2026/ausente.pdf')).rejects.toBeInstanceOf(
        DocumentoPublicoNoDisponibleException,
      );
    });
  });
});

// =====================================================================
// Nivel HTTP
// =====================================================================

describe('PortalPublicoController (HTTP)', () => {
  const HASH = 'c'.repeat(64);
  const ETAG = `"${HASH}"`;

  let app: INestApplication;
  let servicio: {
    obtenerArbol: jest.Mock;
    obtenerSeccion: jest.Mock;
    listarDocumentosDeSeccion: jest.Mock;
    listarDocumentosDeSubseccion: jest.Mock;
    resolverArchivoPublico: jest.Mock;
    abrirArchivo: jest.Mock;
  };

  async function levantar(limitePorMinuto = 1000): Promise<void> {
    servicio = {
      obtenerArbol: jest.fn(async () => []),
      obtenerSeccion: jest.fn(async () => ({})),
      listarDocumentosDeSeccion: jest.fn(async () => ({ datos: [], total: 0, pagina: 1, limite: 20 })),
      listarDocumentosDeSubseccion: jest.fn(async () => ({
        datos: [],
        total: 0,
        pagina: 1,
        limite: 20,
      })),
      resolverArchivoPublico: jest.fn(async () => ({
        tituloDocumento: 'Informe de labores 2025',
        hashArchivo: HASH,
        nombreArchivoOriginal: 'informe.pdf',
        tamanoBytes: 8,
        mimeType: 'application/pdf',
        rutaArchivo: '2026/8f14e45f.pdf',
      })),
      abrirArchivo: jest.fn(async () => Readable.from(['%PDF-1.4'])),
    };

    const modulo = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: limitePorMinuto }])],
      controllers: [PortalPublicoController],
      providers: [
        { provide: PortalPublicoService, useValue: servicio },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new ExcepcionGlobalFilter());
    await app.init();
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('cuerpo de los errores', () => {
    beforeEach(() => levantar());

    it('10. un documento en borrador y uno inexistente dan el MISMO statusCode, error y mensaje', async () => {
      // Los dos casos lanzan la misma clase: por eso `error` coincide.
      servicio.resolverArchivoPublico.mockRejectedValue(
        new RecursoPublicoNoDisponibleException(),
      );

      const borrador = await request(app.getHttpServer()).get('/publico/documentos/42/visualizar');
      const inexistente = await request(app.getHttpServer()).get(
        '/publico/documentos/999999/visualizar',
      );

      expect(borrador.status).toBe(HttpStatus.NOT_FOUND);
      expect(inexistente.status).toBe(HttpStatus.NOT_FOUND);

      // `ruta` y `timestamp` difieren por construcción y no se comparan.
      expect(borrador.body.statusCode).toBe(inexistente.body.statusCode);
      expect(borrador.body.error).toBe(inexistente.body.error);
      expect(borrador.body.mensaje).toBe(inexistente.body.mensaje);
      expect(borrador.body.mensaje).toBe('El recurso solicitado no está disponible.');
      expect(borrador.body.error).toBe('RecursoPublicoNoDisponibleException');
    });

    it('14. limite=1000 se rechaza con 400', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/publico/secciones/itsp-01/itsp-01-01/documentos')
        .query({ limite: 1000 });

      expect(respuesta.status).toBe(HttpStatus.BAD_REQUEST);
      expect(JSON.stringify(respuesta.body.mensaje)).toContain('El límite no puede ser mayor que 50');
    });

    it('15. pagina=0 se rechaza con 400', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/publico/secciones/itsp-01/itsp-01-01/documentos')
        .query({ pagina: 0 });

      expect(respuesta.status).toBe(HttpStatus.BAD_REQUEST);
      expect(JSON.stringify(respuesta.body.mensaje)).toContain('debe ser 1 o mayor');
    });

    it('un límite válido pasa y llega al servicio ya convertido a número', async () => {
      await request(app.getHttpServer())
        .get('/publico/secciones/itsp-01/itsp-01-01/documentos')
        .query({ pagina: 2, limite: 50 })
        .expect(HttpStatus.OK);

      expect(servicio.listarDocumentosDeSubseccion).toHaveBeenCalledWith('itsp-01', 'itsp-01-01', {
        pagina: 2,
        limite: 50,
      });
    });

    it('descarta los parámetros que no están declarados', async () => {
      await request(app.getHttpServer())
        .get('/publico/secciones/itsp-01/itsp-01-01/documentos')
        .query({ estado: 'BORRADOR', pagina: 1 })
        .expect(HttpStatus.OK);

      expect(servicio.listarDocumentosDeSubseccion).toHaveBeenCalledWith('itsp-01', 'itsp-01-01', {
        pagina: 1,
      });
    });
  });

  describe('cabeceras de las rutas JSON', () => {
    beforeEach(() => levantar());

    it('envían nosniff y no se guardan en caché', async () => {
      const respuesta = await request(app.getHttpServer()).get('/publico/secciones').expect(200);

      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['cache-control']).toBe('no-cache');
    });

    it('no emiten ninguna cookie', async () => {
      const respuesta = await request(app.getHttpServer()).get('/publico/secciones').expect(200);

      expect(respuesta.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('entrega del PDF', () => {
    beforeEach(() => levantar());

    it('visualizar envía las cabeceras completas y el contenido en línea', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/publico/documentos/42/visualizar')
        .expect(200);

      expect(respuesta.headers['content-type']).toContain('application/pdf');
      expect(respuesta.headers['content-length']).toBe('8');
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
      expect(respuesta.headers['etag']).toBe(ETAG);
      expect(respuesta.headers['content-disposition']).toMatch(/^inline;/);
      expect(respuesta.headers['x-robots-tag']).toBeUndefined();
    });

    it('descargar usa attachment y nombra el archivo con el título del documento', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/publico/documentos/42/descargar')
        .expect(200);

      expect(respuesta.headers['content-disposition']).toContain('attachment;');
      expect(respuesta.headers['content-disposition']).toContain(
        'filename="Informe de labores 2025.pdf"',
      );
      expect(respuesta.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('Informe de labores 2025.pdf')}`,
      );
    });

    it('sanea el título y recurre al nombre original si no queda nada utilizable', async () => {
      servicio.resolverArchivoPublico.mockResolvedValue({
        tituloDocumento: '../../etc/passwd\r\n',
        hashArchivo: HASH,
        nombreArchivoOriginal: 'respaldo.pdf',
        tamanoBytes: 8,
        mimeType: 'application/pdf',
        rutaArchivo: '2026/8f14e45f.pdf',
      });

      const conRuta = await request(app.getHttpServer())
        .get('/publico/documentos/42/descargar')
        .expect(200);
      expect(conRuta.headers['content-disposition']).toContain('filename=".. .. etc passwd.pdf"');
      expect(conRuta.headers['content-disposition']).not.toContain('/');

      servicio.resolverArchivoPublico.mockResolvedValue({
        tituloDocumento: '   ///   ',
        hashArchivo: HASH,
        nombreArchivoOriginal: 'respaldo.pdf',
        tamanoBytes: 8,
        mimeType: 'application/pdf',
        rutaArchivo: '2026/8f14e45f.pdf',
      });

      const vacio = await request(app.getHttpServer())
        .get('/publico/documentos/42/descargar')
        .expect(200);
      expect(vacio.headers['content-disposition']).toContain('filename="respaldo.pdf"');
    });

    it('un id que no es un número da 400 en español y no llega al servicio', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/publico/documentos/abc/visualizar')
        .expect(HttpStatus.BAD_REQUEST);

      // El mensaje por defecto de ParseIntPipe está en inglés y acabaría en
      // la pantalla de un ciudadano.
      expect(respuesta.body.mensaje).toBe(
        'El identificador del documento debe ser un número entero.',
      );
      expect(servicio.resolverArchivoPublico).not.toHaveBeenCalled();
    });
  });

  describe('20. revalidación con ETag', () => {
    beforeEach(() => levantar());

    it('con el ETag correcto responde 304, sin cuerpo y SIN abrir el archivo', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/publico/documentos/42/visualizar')
        .set('If-None-Match', ETAG);

      expect(respuesta.status).toBe(HttpStatus.NOT_MODIFIED);
      expect(respuesta.text).toBeFalsy();
      expect(respuesta.headers['etag']).toBe(ETAG);
      expect(respuesta.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
      // Lo importante: el disco no se toca.
      expect(servicio.abrirArchivo).not.toHaveBeenCalled();
    });

    it('con un ETag distinto responde 200 y sí abre el archivo', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/publico/documentos/42/visualizar')
        .set('If-None-Match', '"otro-valor"');

      expect(respuesta.status).toBe(HttpStatus.OK);
      expect(servicio.abrirArchivo).toHaveBeenCalledTimes(1);
    });

    it('acepta una lista de valores, el comodín y el prefijo débil W/', async () => {
      for (const cabecera of [`"otro", ${ETAG}`, '*', `W/${ETAG}`]) {
        servicio.abrirArchivo.mockClear();
        const respuesta = await request(app.getHttpServer())
          .get('/publico/documentos/42/visualizar')
          .set('If-None-Match', cabecera);

        expect(respuesta.status).toBe(HttpStatus.NOT_MODIFIED);
        expect(servicio.abrirArchivo).not.toHaveBeenCalled();
      }
    });

    it('un documento NO público con el ETag correcto sigue dando 404, nunca 304', async () => {
      // Esta es la prueba que importa: si el orden se invirtiera, quien
      // hubiera descargado el PDF cuando era público podría averiguar que
      // sigue existiendo pidiendo con su ETag.
      servicio.resolverArchivoPublico.mockRejectedValue(
        new RecursoPublicoNoDisponibleException(),
      );

      const respuesta = await request(app.getHttpServer())
        .get('/publico/documentos/42/visualizar')
        .set('If-None-Match', ETAG);

      expect(respuesta.status).toBe(HttpStatus.NOT_FOUND);
      expect(respuesta.body.mensaje).toBe('El recurso solicitado no está disponible.');
      expect(servicio.abrirArchivo).not.toHaveBeenCalled();
    });
  });

  describe('limitación de tasa', () => {
    beforeEach(() => levantar());

    it('la ruta del PDF corta en la petición 21 con el mensaje en español', async () => {
      // El @Throttle del método pisa el límite del módulo, así que el valor
      // que se prueba es el declarado en el controlador: 20 por minuto. Se
      // usa esta ruta y no las JSON porque su límite es el más bajo y la
      // prueba no tarda nada.
      for (let intento = 1; intento <= 20; intento++) {
        await request(app.getHttpServer())
          .get('/publico/documentos/42/visualizar')
          .expect(HttpStatus.OK);
      }

      const excedida = await request(app.getHttpServer()).get(
        '/publico/documentos/42/visualizar',
      );

      expect(excedida.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(excedida.body.mensaje).toBe(MENSAJE_DEMASIADAS_SOLICITUDES);
      expect(excedida.body.error).toBe('ThrottlerException');
      expect(excedida.body.statusCode).toBe(429);
      // El cuerpo mantiene la forma del resto de los errores de la API.
      expect(excedida.body).toHaveProperty('timestamp');
      expect(excedida.body).toHaveProperty('ruta');
    });

    it('las rutas JSON aguantan más que las del PDF: 21 llamadas seguidas pasan', async () => {
      for (let intento = 1; intento <= 21; intento++) {
        await request(app.getHttpServer()).get('/publico/secciones').expect(HttpStatus.OK);
      }
    });
  });
});
