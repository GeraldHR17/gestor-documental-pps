// src/catalogos/categorias-itsp.service.spec.ts
//
// Pruebas de la parte que no comparte con los catálogos planos: el árbol
// agrupado que consumirán los selects en cascada de Fase 6, y las reglas
// que mantienen la jerarquía en exactamente dos niveles.

import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';

import { CategoriasItspService } from './categorias-itsp.service';
import { CrearCategoriaItspDto } from './dto/crear-categoria-itsp.dto';
import { ActualizarCategoriaItspDto } from './dto/actualizar-categoria-itsp.dto';
import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { Documento } from '../entidades/documento.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import {
  CategoriaPadreInvalidaException,
  CodigoCategoriaNoAsignadoException,
  NombreCatalogoDuplicadoException,
  RegistroCatalogoNoEncontradoException,
} from '../comun/excepciones/excepciones-catalogos';
import { MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA } from '../comun/constantes/categorias-itsp';

const usuarioAutenticado: PayloadJwt = {
  idUsuario: 1,
  idRol: 1,
  nombreRol: 'Superadministrador',
  permisos: ['catalogos.administrar'],
};

function categoria(datos: Partial<CategoriaItsp>): CategoriaItsp {
  return {
    idCategoriaItsp: 0,
    idCategoriaPadre: null,
    codigo: '',
    nombre: '',
    descripcion: null,
    nivel: 1,
    orden: 0,
    estado: 'ACTIVO',
    ...datos,
  } as CategoriaItsp;
}

// Dos raíces con una subsección cada una, más una subsección inactiva.
const RAIZ_INSTITUCIONAL = categoria({
  idCategoriaItsp: 1,
  codigo: 'ITSP-01',
  nombre: 'Información institucional',
  orden: 1,
});
const RAIZ_RENDICION = categoria({
  idCategoriaItsp: 2,
  codigo: 'ITSP-02',
  nombre: 'Rendición de cuentas',
  orden: 2,
});
const SUB_BASICA = categoria({
  idCategoriaItsp: 5,
  idCategoriaPadre: 1,
  codigo: 'ITSP-01-01',
  nombre: 'Información institucional básica',
  nivel: 2,
  orden: 1,
});
const SUB_PLANES = categoria({
  idCategoriaItsp: 6,
  idCategoriaPadre: 2,
  codigo: 'ITSP-02-01',
  nombre: 'Planes institucionales',
  nivel: 2,
  orden: 1,
});
const SUB_INFORMES_INACTIVA = categoria({
  idCategoriaItsp: 7,
  idCategoriaPadre: 2,
  codigo: 'ITSP-02-02',
  nombre: 'Informes institucionales',
  nivel: 2,
  orden: 2,
  estado: 'INACTIVO',
});

const TODAS = [RAIZ_RENDICION, SUB_INFORMES_INACTIVA, SUB_BASICA, RAIZ_INSTITUCIONAL, SUB_PLANES];

// Raíz sin hijas: la única forma de probar raíz -> subsección sin que la
// regla del tercer nivel lo rechace antes.
const RAIZ_SIN_HIJAS = categoria({
  idCategoriaItsp: 3,
  codigo: 'ITSP-03',
  nombre: 'Participación ciudadana',
  orden: 3,
});

/** El error que lanza TypeORM cuando MySQL rechaza un código repetido. */
function errorCodigoDuplicado(): QueryFailedError {
  return new QueryFailedError(
    'INSERT INTO categorias_itsp ...',
    [],
    Object.assign(new Error("Duplicate entry 'ITSP-03' for key 'uk_categorias_itsp_codigo'"), {
      code: 'ER_DUP_ENTRY',
    }),
  );
}

/**
 * Repositorio en memoria en vez de un `findOne` mockeado por llamada: los
 * métodos de este servicio guardan y vuelven a leer lo guardado (crear
 * termina devolviendo `obtener()`), así que un mock que no recuerde lo
 * escrito falla por razones que no tienen que ver con la regla bajo prueba.
 *
 * `manager.transaction` entrega el mismo repositorio: la transacción en sí
 * es de TypeORM; aquí sólo importa que la asignación del código pase por
 * ella y se reintente.
 */
function montarRepositorio(datos: CategoriaItsp[]) {
  const almacen = new Map(datos.map((fila) => [fila.idCategoriaItsp, { ...fila }]));
  let proximoId = 100;

  const repositorio = {
    find: jest.fn(() => Promise.resolve([...almacen.values()])),

    findOne: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const encontrada = [...almacen.values()].find((fila) =>
        where.idCategoriaItsp !== undefined
          ? fila.idCategoriaItsp === where.idCategoriaItsp
          : fila.codigo === where.codigo,
      );
      return Promise.resolve(encontrada ?? null);
    }),

    count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        [...almacen.values()].filter((fila) => fila.idCategoriaPadre === where.idCategoriaPadre)
          .length,
      ),
    ),

    // Como TypeORM: acepta una entidad o un arreglo (mover un subárbol
    // guarda todas sus filas de una vez).
    save: jest.fn((entidades: CategoriaItsp | CategoriaItsp[]) => {
      const guardar = (entidad: CategoriaItsp): CategoriaItsp => {
        const guardada: CategoriaItsp = { ...entidad };
        if (guardada.idCategoriaItsp === undefined) {
          guardada.idCategoriaItsp = proximoId++;
        }
        almacen.set(guardada.idCategoriaItsp, guardada);
        return guardada;
      };
      return Promise.resolve(
        Array.isArray(entidades) ? entidades.map(guardar) : guardar(entidades),
      );
    }),

    create: jest.fn((datosNuevos: Partial<CategoriaItsp>) => ({ ...datosNuevos })),

    manager: {
      transaction: jest.fn(
        (operacion: (gestor: { getRepository: () => unknown }) => Promise<unknown>) =>
          // `unknown` explícito: sin él, el tipo de `repositorio` se
          // referiría a sí mismo y TypeScript lo dejaría en `any`.
          operacion({ getRepository: (): unknown => repositorio }),
      ),
    },
  };

  return repositorio;
}

describe('CategoriasItspService', () => {
  let servicio: CategoriasItspService;
  let repositorio: ReturnType<typeof montarRepositorio>;
  let bitacoraService: { registrar: jest.Mock };
  /** Solo se usa para contar documentos al mover a Participación ciudadana. */
  let repositorioDocumentos: { count: jest.Mock };

  async function construirCon(datos: CategoriaItsp[]): Promise<void> {
    repositorio = montarRepositorio(datos);
    bitacoraService = { registrar: jest.fn() };
    repositorioDocumentos = { count: jest.fn().mockResolvedValue(0) };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriasItspService,
        { provide: getRepositoryToken(CategoriaItsp), useValue: repositorio },
        { provide: getRepositoryToken(Documento), useValue: repositorioDocumentos },
        { provide: BitacoraService, useValue: bitacoraService },
      ],
    }).compile();

    servicio = modulo.get(CategoriasItspService);
  }

  beforeEach(async () => {
    await construirCon(TODAS);
  });

  describe('obtenerArbol', () => {
    it('agrupa por raíz con las subsecciones anidadas, no una lista plana', async () => {
      const arbol = await servicio.obtenerArbol();

      expect(arbol).toHaveLength(2);
      expect(arbol[0]).toMatchObject({ id: 1, codigo: 'ITSP-01', nivel: 1 });
      expect(arbol[0].hijos.map((hijo) => hijo.id)).toEqual([5]);
      expect(arbol[1]).toMatchObject({ id: 2, codigo: 'ITSP-02', nivel: 1 });
      expect(arbol[1].hijos.map((hijo) => hijo.nombre)).toEqual([
        'Planes institucionales',
        'Informes institucionales',
      ]);
    });

    it('ordena las raíces por `orden` aunque la base las devuelva desordenadas', async () => {
      const arbol = await servicio.obtenerArbol();

      expect(arbol.map((raiz) => raiz.orden)).toEqual([1, 2]);
    });

    it('poda lo inactivo cuando se pide estado=ACTIVO (lo que usará Fase 6)', async () => {
      const arbol = await servicio.obtenerArbol({ estado: 'ACTIVO' });

      expect(arbol.find((raiz) => raiz.id === 2)?.hijos.map((hijo) => hijo.id)).toEqual([6]);
    });

    it('no devuelve subsecciones sueltas si su raíz quedó podada', async () => {
      await construirCon([{ ...RAIZ_RENDICION, estado: 'INACTIVO' }, SUB_PLANES]);

      await expect(servicio.obtenerArbol({ estado: 'ACTIVO' })).resolves.toEqual([]);
    });
  });

  describe('listar', () => {
    it('devuelve la lista plana en orden de despliegue: cada raíz seguida de sus hijas', async () => {
      const lista = await servicio.listar();

      expect(lista.map((fila) => fila.id)).toEqual([1, 5, 2, 6, 7]);
      expect(lista.map((fila) => fila.nivel)).toEqual([1, 2, 1, 2, 2]);
    });

    it('resuelve el nombre de la categoría padre para la indentación de la tabla', async () => {
      const lista = await servicio.listar();

      expect(lista.find((fila) => fila.id === 5)?.nombreCategoriaPadre).toBe(
        'Información institucional',
      );
      expect(lista.find((fila) => fila.id === 1)?.nombreCategoriaPadre).toBeNull();
    });
  });

  describe('crear', () => {
    it('deriva nivel 1 cuando no se envía categoría padre', async () => {
      await servicio.crear({ nombre: 'Nueva raíz' }, usuarioAutenticado);

      expect(repositorio.create).toHaveBeenCalledWith(
        expect.objectContaining({ nivel: 1, idCategoriaPadre: null }),
      );
    });

    it('deriva nivel 2 cuando cuelga de una raíz y lo registra en bitácora', async () => {
      const creada = await servicio.crear(
        { nombre: 'Nueva subsección', idCategoriaPadre: 1 },
        usuarioAutenticado,
      );

      expect(creada).toMatchObject({ nivel: 2, idCategoriaPadre: 1, estado: 'ACTIVO' });
      expect(creada.nombreCategoriaPadre).toBe('Información institucional');
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR_CATEGORIA_ITSP',
          entidad: 'categorias_itsp',
          resultado: 'EXITO',
        }),
      );
    });

    // Antes se rechazaba: la jerarquía era de dos niveles. Desde
    // spec-ajustes-niveles-y-estados una subsección puede tener hijas.
    it('permite colgar de una subsección: crea el nivel 3 con el código del padre', async () => {
      const creada = await servicio.crear(
        { nombre: 'Tercer nivel', idCategoriaPadre: 5 },
        usuarioAutenticado,
      );

      expect(creada).toMatchObject({ nivel: 3, idCategoriaPadre: 5, codigo: 'ITSP-01-01-01' });
    });

    it('rechaza una categoría padre inexistente', async () => {
      await expect(
        servicio.crear({ nombre: 'Huérfana', idCategoriaPadre: 999 }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CategoriaPadreInvalidaException);
    });

    it('recorta el nombre y guarda como NULL una descripción en blanco', async () => {
      const creada = await servicio.crear(
        { nombre: '  Cultura  ', descripcion: '   ' },
        usuarioAutenticado,
      );

      expect(creada.nombre).toBe('Cultura');
      expect(creada.descripcion).toBeNull();
    });

    it('permite el mismo nombre bajo raíces distintas pero no entre hermanas', async () => {
      // 'Planes institucionales' ya existe, pero colgando de la raíz 2.
      await expect(
        servicio.crear(
          { nombre: 'Planes institucionales', idCategoriaPadre: 1 },
          usuarioAutenticado,
        ),
      ).resolves.toBeDefined();

      await expect(
        servicio.crear(
          { nombre: 'Planes institucionales', idCategoriaPadre: 2 },
          usuarioAutenticado,
        ),
      ).rejects.toBeInstanceOf(NombreCatalogoDuplicadoException);
    });

    it('asigna a una raíz nueva el siguiente ITSP-NN y lo registra en bitácora', async () => {
      const creada = await servicio.crear({ nombre: 'Nueva raíz' }, usuarioAutenticado);

      expect(creada.codigo).toBe('ITSP-03');
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'CREAR_CATEGORIA_ITSP',
          detalles: { nombre: 'Nueva raíz', codigo: 'ITSP-03' },
        }),
      );
    });

    it('numera la subsección contando también las hermanas inactivas', async () => {
      // La raíz 2 tiene ITSP-02-01 (activa) e ITSP-02-02 (inactiva).
      const creada = await servicio.crear(
        { nombre: 'Presupuesto', idCategoriaPadre: 2 },
        usuarioAutenticado,
      );

      expect(creada.codigo).toBe('ITSP-02-03');
    });

    it('asigna el código dentro de una transacción', async () => {
      await servicio.crear({ nombre: 'Nueva raíz' }, usuarioAutenticado);

      expect(repositorio.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('reintenta si otra persona ganó el número y entonces guarda', async () => {
      repositorio.save.mockRejectedValueOnce(errorCodigoDuplicado());

      const creada = await servicio.crear({ nombre: 'Nueva raíz' }, usuarioAutenticado);

      expect(creada.codigo).toBe('ITSP-03');
      expect(repositorio.manager.transaction).toHaveBeenCalledTimes(2);
    });

    it('responde 409 tras tres colisiones seguidas, sin registrar en bitácora', async () => {
      repositorio.save
        .mockRejectedValueOnce(errorCodigoDuplicado())
        .mockRejectedValueOnce(errorCodigoDuplicado())
        .mockRejectedValueOnce(errorCodigoDuplicado());

      await expect(
        servicio.crear({ nombre: 'Nueva raíz' }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CodigoCategoriaNoAsignadoException);
      expect(repositorio.manager.transaction).toHaveBeenCalledTimes(3);
      expect(bitacoraService.registrar).not.toHaveBeenCalled();
    });

    it('no reintenta un error que no es de código duplicado', async () => {
      repositorio.save.mockRejectedValueOnce(new Error('Conexión perdida'));

      await expect(
        servicio.crear({ nombre: 'Nueva raíz' }, usuarioAutenticado),
      ).rejects.toThrow('Conexión perdida');
      expect(repositorio.manager.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('codigo en el cuerpo (D-5)', () => {
    // La misma configuración que main.ts: whitelist sin forbidNonWhitelisted.
    const tuberia = new ValidationPipe({ whitelist: true, transform: true });

    it('se descarta al crear, sin responder 400', async () => {
      const dto = (await tuberia.transform(
        { nombre: 'Nueva raíz', codigo: 'ITSP-99' },
        { type: 'body', metatype: CrearCategoriaItspDto },
      )) as Record<string, unknown>;

      expect(dto).toEqual({ nombre: 'Nueva raíz' });
    });

    it('se descarta al actualizar, sin responder 400', async () => {
      const dto = (await tuberia.transform(
        { codigo: 'OTRO' },
        { type: 'body', metatype: ActualizarCategoriaItspDto },
      )) as Record<string, unknown>;

      expect(dto).toEqual({});
    });
  });

  describe('obtenerSiguienteCodigo', () => {
    it('sin padre devuelve la siguiente raíz', async () => {
      await expect(servicio.obtenerSiguienteCodigo(null)).resolves.toEqual({
        codigo: 'ITSP-03',
      });
    });

    it('con una raíz devuelve su siguiente subsección', async () => {
      await expect(servicio.obtenerSiguienteCodigo(2)).resolves.toEqual({
        codigo: 'ITSP-02-03',
      });
    });

    // Antes un padre subsección se rechazaba (dos niveles). Ahora es válido.
    it('con una subsección devuelve su siguiente hija', async () => {
      await expect(servicio.obtenerSiguienteCodigo(5)).resolves.toEqual({
        codigo: 'ITSP-01-01-01',
      });
    });

    it('rechaza un padre que no existe', async () => {
      await expect(servicio.obtenerSiguienteCodigo(999)).rejects.toBeInstanceOf(
        CategoriaPadreInvalidaException,
      );
    });

    it('no escribe nada', async () => {
      await servicio.obtenerSiguienteCodigo(null);

      expect(repositorio.save).not.toHaveBeenCalled();
    });
  });

  describe('actualizar', () => {
    // Antes este caso convertía la subsección en raíz. Desde
    // spec-ajustes-posdespliegue C-2 se rechaza: con códigos automáticos
    // dejaría una raíz con código de subsección.
    it('rechaza convertir una subsección en raíz', async () => {
      await expect(
        servicio.actualizar(5, { idCategoriaPadre: null }, usuarioAutenticado),
      ).rejects.toThrow(
        new CategoriaPadreInvalidaException(
          'Una categoría raíz no puede convertirse en subsección ni una subsección en raíz',
        ),
      );
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('rechaza convertir una raíz sin hijas en subsección', async () => {
      await construirCon([...TODAS, RAIZ_SIN_HIJAS]);

      await expect(
        servicio.actualizar(3, { idCategoriaPadre: 1 }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CategoriaPadreInvalidaException);
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('al mover una subsección recalcula sólo su código y lo registra', async () => {
      const movida = await servicio.actualizar(5, { idCategoriaPadre: 2 }, usuarioAutenticado);

      expect(movida).toMatchObject({ idCategoriaPadre: 2, codigo: 'ITSP-02-03', nivel: 2 });

      const lista = await servicio.listar();
      expect(lista.find((fila) => fila.id === 6)?.codigo).toBe('ITSP-02-01');
      expect(lista.find((fila) => fila.id === 7)?.codigo).toBe('ITSP-02-02');

      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'ACTUALIZAR_CATEGORIA_ITSP',
          detalles: {
            camposActualizados: ['idCategoriaPadre'],
            codigoAnterior: 'ITSP-01-01',
            codigoNuevo: 'ITSP-02-03',
            cantidadUrlCambiadas: 1,
          },
        }),
      );
    });

    it('al mover una subsección revisa el nombre contra las hermanas nuevas', async () => {
      // La raíz 2 ya tiene 'Planes institucionales'.
      await construirCon([...TODAS, { ...SUB_BASICA, nombre: 'Planes institucionales' }]);

      await expect(
        servicio.actualizar(5, { idCategoriaPadre: 2 }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(NombreCatalogoDuplicadoException);
    });

    it('reintenta el código al mover si otra persona ganó el número', async () => {
      repositorio.save.mockRejectedValueOnce(errorCodigoDuplicado());

      const movida = await servicio.actualizar(5, { idCategoriaPadre: 2 }, usuarioAutenticado);

      expect(movida.codigo).toBe('ITSP-02-03');
      expect(repositorio.manager.transaction).toHaveBeenCalledTimes(2);
    });

    it('no cambia el código si el padre enviado es el mismo', async () => {
      const actualizada = await servicio.actualizar(
        5,
        { idCategoriaPadre: 1, nombre: 'Información básica' },
        usuarioAutenticado,
      );

      expect(actualizada.codigo).toBe('ITSP-01-01');
      expect(repositorio.manager.transaction).not.toHaveBeenCalled();
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          detalles: { camposActualizados: ['idCategoriaPadre', 'nombre'] },
        }),
      );
    });

    it('no cambia el código al editar sólo nombre, descripción u orden', async () => {
      const actualizada = await servicio.actualizar(
        1,
        { nombre: 'Institucional', descripcion: 'Texto', orden: 9 },
        usuarioAutenticado,
      );

      expect(actualizada.codigo).toBe('ITSP-01');
    });

    it('impide que una categoría sea su propia categoría padre', async () => {
      await expect(
        servicio.actualizar(1, { idCategoriaPadre: 1 }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CategoriaPadreInvalidaException);
    });

    it('impide colgar una raíz que ya tiene subsecciones: crearía un tercer nivel', async () => {
      await expect(
        servicio.actualizar(1, { idCategoriaPadre: 2 }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CategoriaPadreInvalidaException);
    });

    it('deja renombrar una categoría con su mismo nombre sin marcarla como duplicada', async () => {
      await expect(
        servicio.actualizar(5, { nombre: 'Información institucional básica' }, usuarioAutenticado),
      ).resolves.toMatchObject({ nombre: 'Información institucional básica' });
    });

    it('rechaza renombrar una subsección con el nombre de una hermana', async () => {
      await expect(
        servicio.actualizar(6, { nombre: 'Informes institucionales' }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(NombreCatalogoDuplicadoException);
    });

    it('lanza 404 al actualizar una categoría inexistente', async () => {
      await expect(
        servicio.actualizar(999, { nombre: 'Fantasma' }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(RegistroCatalogoNoEncontradoException);
    });
  });

  describe('jerarquía de N niveles (spec-ajustes-niveles-y-estados)', () => {
    // Bajo ITSP-01-01 (id 5): nivel 3 con una hija regular y una irregular.
    const NIVEL_3 = categoria({
      idCategoriaItsp: 50,
      idCategoriaPadre: 5,
      codigo: 'ITSP-01-01-01',
      nombre: 'Organigramas',
      nivel: 3,
    });
    const NIVEL_4 = categoria({
      idCategoriaItsp: 51,
      idCategoriaPadre: 50,
      codigo: 'ITSP-01-01-01-01',
      nombre: '2026',
      nivel: 4,
      orden: 1,
    });
    const NIVEL_4_IRREGULAR = categoria({
      idCategoriaItsp: 52,
      idCategoriaPadre: 50,
      codigo: 'ORGANIGRAMA-VIEJO',
      nombre: 'Histórico',
      nivel: 4,
      orden: 2,
    });
    const PARTICIPACION = categoria({
      idCategoriaItsp: 30,
      codigo: 'ITSP-03',
      nombre: 'Participación ciudadana',
      orden: 3,
    });
    const SUB_PARTICIPACION = categoria({
      idCategoriaItsp: 31,
      idCategoriaPadre: 30,
      codigo: 'ITSP-03-01',
      nombre: 'Información',
      nivel: 2,
    });
    const PROFUNDA = [
      ...TODAS,
      NIVEL_3,
      NIVEL_4,
      NIVEL_4_IRREGULAR,
      PARTICIPACION,
      SUB_PARTICIPACION,
    ];

    /** Una rama de `niveles` niveles colgando de la raíz 1 (ids 100+). */
    function rama(niveles: number): CategoriaItsp[] {
      const filas: CategoriaItsp[] = [];
      let codigo = 'ITSP-01';
      let idPadre = 1;
      for (let nivel = 2; nivel <= niveles; nivel++) {
        codigo = `${codigo}-09`;
        const id = 100 + nivel;
        filas.push(
          categoria({ idCategoriaItsp: id, idCategoriaPadre: idPadre, codigo, nombre: `N${nivel}`, nivel }),
        );
        idPadre = id;
      }
      return filas;
    }

    beforeEach(async () => {
      await construirCon(PROFUNDA);
    });

    it('arma el árbol recursivo a cualquier profundidad', async () => {
      const arbol = await servicio.obtenerArbol();
      const institucional = arbol.find((raiz) => raiz.id === 1);
      const nivel3 = institucional?.hijos.find((hijo) => hijo.id === 5)?.hijos[0];

      expect(nivel3).toMatchObject({ id: 50, codigo: 'ITSP-01-01-01' });
      expect(nivel3?.hijos.map((hijo) => hijo.id)).toEqual([51, 52]);
    });

    it('con estado=ACTIVO poda en cualquier nivel lo que cuelga de un inactivo', async () => {
      await construirCon(PROFUNDA.map((c) => (c.idCategoriaItsp === 50 ? { ...c, estado: 'INACTIVO' } : c)));

      const arbol = await servicio.obtenerArbol({ estado: 'ACTIVO' });
      const sub = arbol.find((raiz) => raiz.id === 1)?.hijos.find((hijo) => hijo.id === 5);

      // 51 y 52 siguen ACTIVO en la base, pero su padre no: no aparecen.
      expect(sub?.hijos).toEqual([]);
    });

    it('lista cada categoría seguida de todo su subárbol', async () => {
      const lista = await servicio.listar();
      const ids = lista.map((fila) => fila.id);

      expect(ids.slice(0, 5)).toEqual([1, 5, 50, 51, 52]);
      expect(lista.find((fila) => fila.id === 51)?.nombreCategoriaPadre).toBe('Organigramas');
    });

    it('crea hasta el nivel 10 y rechaza el 11 con un mensaje claro', async () => {
      await construirCon([...TODAS, ...rama(10)]);

      await expect(
        servicio.crear({ nombre: 'Nivel 10 bis', idCategoriaPadre: 109 }, usuarioAutenticado),
      ).resolves.toMatchObject({ nivel: 10, codigo: 'ITSP-01-09-09-09-09-09-09-09-09-10' }); // hermana del 110, que ya usa -09

      await expect(
        servicio.crear({ nombre: 'Nivel 11', idCategoriaPadre: 110 }, usuarioAutenticado),
      ).rejects.toThrow(
        new CategoriaPadreInvalidaException(
          'La jerarquía admite como máximo 10 niveles; esta operación la dejaría en 11',
        ),
      );
    });

    it('mueve un subárbol: el nodo toma el siguiente número y sus descendientes conservan el sufijo', async () => {
      const movida = await servicio.actualizar(50, { idCategoriaPadre: 6 }, usuarioAutenticado);

      expect(movida).toMatchObject({ idCategoriaPadre: 6, codigo: 'ITSP-02-01-01', nivel: 3 });
      const lista = await servicio.listar();
      expect(lista.find((fila) => fila.id === 51)).toMatchObject({
        codigo: 'ITSP-02-01-01-01',
        nivel: 4,
      });
      // La irregular toma el máximo + 1 bajo su padre ya recodificado.
      expect(lista.find((fila) => fila.id === 52)?.codigo).toBe('ITSP-02-01-01-02');
      // Nada fuera del subárbol cambia.
      expect(lista.find((fila) => fila.id === 5)?.codigo).toBe('ITSP-01-01');
      expect(lista.find((fila) => fila.id === 6)?.codigo).toBe('ITSP-02-01');
    });

    it('al mover, recalcula el nivel de todo el subárbol', async () => {
      await servicio.actualizar(50, { idCategoriaPadre: 2 }, usuarioAutenticado);

      const lista = await servicio.listar();
      expect(lista.find((fila) => fila.id === 50)).toMatchObject({ nivel: 2, codigo: 'ITSP-02-03' });
      expect(lista.find((fila) => fila.id === 51)).toMatchObject({ nivel: 3, codigo: 'ITSP-02-03-01' });
    });

    it('registra en la bitácora cuántas URL cambian y cuáles', async () => {
      await servicio.actualizar(50, { idCategoriaPadre: 6 }, usuarioAutenticado);

      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'ACTUALIZAR_CATEGORIA_ITSP',
          idRegistro: 50,
          detalles: {
            camposActualizados: ['idCategoriaPadre'],
            codigoAnterior: 'ITSP-01-01-01',
            codigoNuevo: 'ITSP-02-01-01',
            cantidadUrlCambiadas: 3,
            cambiosDescendientes: [
              { id: 51, codigoAnterior: 'ITSP-01-01-01-01', codigoNuevo: 'ITSP-02-01-01-01' },
              { id: 52, codigoAnterior: 'ORGANIGRAMA-VIEJO', codigoNuevo: 'ITSP-02-01-01-02' },
            ],
          },
        }),
      );
    });

    it('en un subárbol grande recorta la lista de la bitácora y conserva el total', async () => {
      // Bajo el 50 (que ya tiene al 51 y al 52): 11 hijas con 10 nietas
      // cada una, 123 descendientes en total, todos cambian de código.
      const anchas: CategoriaItsp[] = [];
      for (let hija = 0; hija < 11; hija++) {
        const idHija = 1000 + hija * 20;
        const codigoHija = `ITSP-01-01-01-${String(hija + 3).padStart(2, '0')}`;
        anchas.push(
          categoria({ idCategoriaItsp: idHija, idCategoriaPadre: 50, codigo: codigoHija, nombre: `H${hija}`, nivel: 4 }),
        );
        for (let nieta = 1; nieta <= 10; nieta++) {
          anchas.push(
            categoria({
              idCategoriaItsp: idHija + nieta,
              idCategoriaPadre: idHija,
              codigo: `${codigoHija}-${String(nieta).padStart(2, '0')}`,
              nombre: `H${hija}N${nieta}`,
              nivel: 5,
            }),
          );
        }
      }
      await construirCon([...PROFUNDA, ...anchas]);

      await servicio.actualizar(50, { idCategoriaPadre: 6 }, usuarioAutenticado);

      const [{ detalles }] = bitacoraService.registrar.mock.calls.at(-1) as [
        {
          detalles: {
            cantidadUrlCambiadas: number;
            cambiosDescendientes: unknown[];
            cambiosDescendientesOmitidos: number;
          };
        },
      ];
      expect(detalles.cantidadUrlCambiadas).toBe(124);
      expect(detalles.cambiosDescendientes).toHaveLength(MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA);
      expect(detalles.cambiosDescendientesOmitidos).toBe(123 - MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA);
      // El recorte es solo de la bitácora: el subárbol entero se recodificó.
      const lista = await servicio.listar();
      expect(lista.find((fila) => fila.id === 1210)?.codigo).toBe('ITSP-02-01-01-13-10');
    });

    it('rechaza mover una categoría dentro de sí misma o de sus descendientes', async () => {
      for (const destino of [50, 51]) {
        await expect(
          servicio.actualizar(5, { idCategoriaPadre: destino }, usuarioAutenticado),
        ).rejects.toThrow(
          new CategoriaPadreInvalidaException(
            'Una categoría no puede moverse dentro de sí misma ni de sus subcategorías',
          ),
        );
      }
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('valida el tope con la altura del subárbol completo', async () => {
      // Rama de 9 niveles (hasta el id 109) y el subárbol 50 ocupa 2.
      await construirCon([...PROFUNDA, ...rama(9)]);

      await expect(
        servicio.actualizar(50, { idCategoriaPadre: 108 }, usuarioAutenticado),
      ).resolves.toBeDefined();

      await construirCon([...PROFUNDA, ...rama(9)]);
      await expect(
        servicio.actualizar(50, { idCategoriaPadre: 109 }, usuarioAutenticado),
      ).rejects.toThrow(
        new CategoriaPadreInvalidaException(
          'La jerarquía admite como máximo 10 niveles; esta operación la dejaría en 11',
        ),
      );
    });

    it('ante una colisión reintenta y el intento fallido no deja nada a medias', async () => {
      repositorio.save.mockRejectedValueOnce(errorCodigoDuplicado());

      await servicio.actualizar(50, { idCategoriaPadre: 6 }, usuarioAutenticado);

      expect(repositorio.manager.transaction).toHaveBeenCalledTimes(2);
      const lista = await servicio.listar();
      expect(lista.find((fila) => fila.id === 51)?.codigo).toBe('ITSP-02-01-01-01');
    });

    it('responde 409 tras tres colisiones al mover un subárbol', async () => {
      repositorio.save
        .mockRejectedValueOnce(errorCodigoDuplicado())
        .mockRejectedValueOnce(errorCodigoDuplicado())
        .mockRejectedValueOnce(errorCodigoDuplicado());

      await expect(
        servicio.actualizar(50, { idCategoriaPadre: 6 }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CodigoCategoriaNoAsignadoException);

      const lista = await servicio.listar();
      expect(lista.find((fila) => fila.id === 50)?.codigo).toBe('ITSP-01-01-01');
      expect(lista.find((fila) => fila.id === 51)?.codigo).toBe('ITSP-01-01-01-01');
    });

    it('rechaza llevar documentos al subárbol de Participación ciudadana (D-7)', async () => {
      repositorioDocumentos.count.mockResolvedValue(2);

      await expect(
        servicio.actualizar(50, { idCategoriaPadre: 31 }, usuarioAutenticado),
      ).rejects.toThrow(
        new CategoriaPadreInvalidaException(
          "No se puede mover a 'Participación ciudadana' una categoría con documentos: esa sección no los admite",
        ),
      );
    });

    it('sí permite mover a Participación ciudadana un subárbol sin documentos', async () => {
      await expect(
        servicio.actualizar(50, { idCategoriaPadre: 31 }, usuarioAutenticado),
      ).resolves.toMatchObject({ codigo: 'ITSP-03-01-01', nivel: 3 });
    });

    it('rechaza un código que no cabe en la columna', async () => {
      await construirCon([
        ...TODAS,
        categoria({ idCategoriaItsp: 60, codigo: 'X'.repeat(48), nombre: 'Irregular larga', orden: 9 }),
      ]);

      await expect(
        servicio.crear({ nombre: 'Hija', idCategoriaPadre: 60 }, usuarioAutenticado),
      ).rejects.toThrow(
        new CategoriaPadreInvalidaException(
          'El código resultante supera los 50 caracteres; elija otra categoría superior',
        ),
      );
    });
  });

  describe('cambiarEstado', () => {
    it('inactiva sin borrar físicamente y registra INACTIVAR_CATEGORIA_ITSP', async () => {
      const resultado = await servicio.cambiarEstado(5, 'INACTIVO', usuarioAutenticado);

      expect(resultado.estado).toBe('INACTIVO');
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'INACTIVAR_CATEGORIA_ITSP', idRegistro: 5 }),
      );
    });

    it('conserva el estado propio de las subsecciones al inactivar su raíz', async () => {
      await servicio.cambiarEstado(1, 'INACTIVO', usuarioAutenticado);

      const lista = await servicio.listar();
      expect(lista.find((fila) => fila.id === 5)?.estado).toBe('ACTIVO');
    });

    it('registra REACTIVAR al volver a ACTIVO', async () => {
      await servicio.cambiarEstado(7, 'ACTIVO', usuarioAutenticado);

      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'REACTIVAR_CATEGORIA_ITSP' }),
      );
    });
  });
});
