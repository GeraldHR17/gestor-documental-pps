// src/catalogos/categorias-itsp.service.spec.ts
//
// Pruebas de la parte que no comparte con los catálogos planos: el árbol
// agrupado que consumirán los selects en cascada de Fase 6, y las reglas
// que mantienen la jerarquía en exactamente dos niveles.

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CategoriasItspService } from './categorias-itsp.service';
import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import {
  CategoriaPadreInvalidaException,
  CodigoCategoriaDuplicadoException,
  NombreCatalogoDuplicadoException,
  RegistroCatalogoNoEncontradoException,
} from '../comun/excepciones/excepciones-catalogos';

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
    codigo: null,
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

/**
 * Repositorio en memoria en vez de un `findOne` mockeado por llamada: los
 * métodos de este servicio guardan y vuelven a leer lo guardado (crear
 * termina devolviendo `obtener()`), así que un mock que no recuerde lo
 * escrito falla por razones que no tienen que ver con la regla bajo prueba.
 */
function montarRepositorio(datos: CategoriaItsp[]) {
  const almacen = new Map(datos.map((fila) => [fila.idCategoriaItsp, { ...fila }]));
  let proximoId = 100;

  return {
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

    save: jest.fn((entidad: CategoriaItsp) => {
      const guardada = { ...entidad } as CategoriaItsp;
      if (guardada.idCategoriaItsp === undefined) {
        guardada.idCategoriaItsp = proximoId++;
      }
      almacen.set(guardada.idCategoriaItsp, guardada);
      return Promise.resolve(guardada);
    }),

    create: jest.fn((datosNuevos: Partial<CategoriaItsp>) => ({ ...datosNuevos })),
  };
}

describe('CategoriasItspService', () => {
  let servicio: CategoriasItspService;
  let repositorio: ReturnType<typeof montarRepositorio>;
  let bitacoraService: { registrar: jest.Mock };

  async function construirCon(datos: CategoriaItsp[]): Promise<void> {
    repositorio = montarRepositorio(datos);
    bitacoraService = { registrar: jest.fn() };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriasItspService,
        { provide: getRepositoryToken(CategoriaItsp), useValue: repositorio },
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

    it('rechaza colgar de una subsección: la jerarquía es de dos niveles', async () => {
      await expect(
        servicio.crear({ nombre: 'Tercer nivel', idCategoriaPadre: 5 }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CategoriaPadreInvalidaException);
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

    it('rechaza un código ya usado por otra categoría', async () => {
      await expect(
        servicio.crear({ nombre: 'Otra raíz', codigo: 'ITSP-01' }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CodigoCategoriaDuplicadoException);
    });
  });

  describe('actualizar', () => {
    it('convierte una subsección en raíz al enviar idCategoriaPadre null', async () => {
      const actualizada = await servicio.actualizar(
        5,
        { idCategoriaPadre: null },
        usuarioAutenticado,
      );

      expect(actualizada).toMatchObject({ nivel: 1, idCategoriaPadre: null });
      expect(actualizada.nombreCategoriaPadre).toBeNull();
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
