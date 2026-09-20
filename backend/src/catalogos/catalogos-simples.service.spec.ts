// src/catalogos/catalogos-simples.service.spec.ts
//
// Los tres catálogos planos comparten ServicioCatalogoSimple, así que las
// pruebas se escriben una vez y se ejecutan contra los tres con
// `describe.each`: si alguno se configura mal (llave primaria equivocada,
// sufijo de bitácora duplicado, descripción donde no existe la columna),
// falla aquí y no en producción.

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TiposDocumentosService } from './tipos-documentos.service';
import { DependenciasService } from './dependencias.service';
import { EtiquetasService } from './etiquetas.service';
import { TipoDocumento } from '../entidades/tipo-documento.entidad';
import { Dependencia } from '../entidades/dependencia.entidad';
import { Etiqueta } from '../entidades/etiqueta.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import {
  NombreCatalogoDuplicadoException,
  RegistroCatalogoNoEncontradoException,
} from '../comun/excepciones/excepciones-catalogos';

function crearRepositorioMock() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((entidad: object) => Promise.resolve(entidad)),
    create: jest.fn((datos: object) => datos),
  };
}

const usuarioAutenticado: PayloadJwt = {
  idUsuario: 1,
  idRol: 1,
  nombreRol: 'Superadministrador',
  permisos: ['catalogos.administrar'],
};

type ServicioSimple = TiposDocumentosService | DependenciasService | EtiquetasService;

interface CasoCatalogo {
  etiqueta: string;
  Servicio: new (...args: never[]) => ServicioSimple;
  entidad: new () => object;
  propiedadId: string;
  sufijoAccion: string;
  entidadBitacora: string;
  admiteDescripcion: boolean;
}

const CASOS: CasoCatalogo[] = [
  {
    etiqueta: 'TiposDocumentosService',
    Servicio: TiposDocumentosService as never,
    entidad: TipoDocumento,
    propiedadId: 'idTipoDocumento',
    sufijoAccion: 'TIPO_DOCUMENTO',
    entidadBitacora: 'tipos_documentos',
    admiteDescripcion: true,
  },
  {
    etiqueta: 'DependenciasService',
    Servicio: DependenciasService as never,
    entidad: Dependencia,
    propiedadId: 'idDependencia',
    sufijoAccion: 'DEPENDENCIA',
    entidadBitacora: 'dependencias',
    admiteDescripcion: true,
  },
  {
    etiqueta: 'EtiquetasService',
    Servicio: EtiquetasService as never,
    entidad: Etiqueta,
    propiedadId: 'idEtiqueta',
    sufijoAccion: 'ETIQUETA',
    entidadBitacora: 'etiquetas',
    admiteDescripcion: false,
  },
];

describe.each(CASOS)('$etiqueta', (caso) => {
  let servicio: ServicioSimple;
  let repositorio: ReturnType<typeof crearRepositorioMock>;
  let bitacoraService: { registrar: jest.Mock };

  beforeEach(async () => {
    repositorio = crearRepositorioMock();
    bitacoraService = { registrar: jest.fn() };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        caso.Servicio,
        { provide: getRepositoryToken(caso.entidad), useValue: repositorio },
        { provide: BitacoraService, useValue: bitacoraService },
      ],
    }).compile();

    servicio = modulo.get(caso.Servicio);
  });

  it('crea el registro, recorta el nombre y lo deja ACTIVO', async () => {
    repositorio.findOne.mockResolvedValue(null);
    repositorio.save.mockImplementation((entidad: Record<string, unknown>) =>
      Promise.resolve({ ...entidad, [caso.propiedadId]: 10 }),
    );

    const resultado = await servicio.crear({ nombre: '  Legal  ' }, usuarioAutenticado);

    expect(repositorio.create).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Legal', estado: 'ACTIVO' }),
    );
    expect(resultado).toEqual({ id: 10, nombre: 'Legal', descripcion: null, estado: 'ACTIVO' });
  });

  it('rechaza un nombre ya usado con 409', async () => {
    repositorio.findOne.mockResolvedValue({ [caso.propiedadId]: 3, nombre: 'Legal' });

    await expect(servicio.crear({ nombre: 'Legal' }, usuarioAutenticado)).rejects.toBeInstanceOf(
      NombreCatalogoDuplicadoException,
    );
    expect(repositorio.save).not.toHaveBeenCalled();
  });

  it('registra la creación en la bitácora con la acción y la entidad del catálogo', async () => {
    repositorio.findOne.mockResolvedValue(null);
    repositorio.save.mockImplementation((entidad: Record<string, unknown>) =>
      Promise.resolve({ ...entidad, [caso.propiedadId]: 7 }),
    );

    await servicio.crear({ nombre: 'Archivo' }, usuarioAutenticado);

    expect(bitacoraService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        idUsuario: 1,
        accion: 'CREAR_' + caso.sufijoAccion,
        entidad: caso.entidadBitacora,
        idRegistro: 7,
        resultado: 'EXITO',
      }),
    );
  });

  it('lanza 404 al pedir un registro inexistente', async () => {
    repositorio.findOne.mockResolvedValue(null);

    await expect(servicio.obtener(99)).rejects.toBeInstanceOf(RegistroCatalogoNoEncontradoException);
  });

  it('actualiza el nombre sin volver a exigir unicidad cuando no cambió', async () => {
    repositorio.findOne.mockResolvedValue({
      [caso.propiedadId]: 5,
      nombre: 'Legal',
      estado: 'ACTIVO',
    });

    await servicio.actualizar(5, { nombre: 'Legal' }, usuarioAutenticado);

    // Una sola búsqueda: la del propio registro. Si hubiera revisado
    // unicidad habría hecho una segunda.
    expect(repositorio.findOne).toHaveBeenCalledTimes(1);
    expect(bitacoraService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'ACTUALIZAR_' + caso.sufijoAccion }),
    );
  });

  it('inactiva sin borrar físicamente y registra INACTIVAR', async () => {
    repositorio.findOne.mockResolvedValue({
      [caso.propiedadId]: 5,
      nombre: 'Legal',
      estado: 'ACTIVO',
    });

    const resultado = await servicio.cambiarEstado(5, 'INACTIVO', usuarioAutenticado);

    expect(resultado.estado).toBe('INACTIVO');
    expect(repositorio.save).toHaveBeenCalledWith(expect.objectContaining({ estado: 'INACTIVO' }));
    expect(bitacoraService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'INACTIVAR_' + caso.sufijoAccion }),
    );
  });

  it('registra REACTIVAR al volver a ACTIVO', async () => {
    repositorio.findOne.mockResolvedValue({
      [caso.propiedadId]: 5,
      nombre: 'Legal',
      estado: 'INACTIVO',
    });

    await servicio.cambiarEstado(5, 'ACTIVO', usuarioAutenticado);

    expect(bitacoraService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'REACTIVAR_' + caso.sufijoAccion }),
    );
  });

  it('respeta si el catálogo tiene o no columna de descripción', async () => {
    repositorio.findOne.mockResolvedValue(null);
    repositorio.save.mockImplementation((entidad: Record<string, unknown>) =>
      Promise.resolve({ ...entidad, [caso.propiedadId]: 1 }),
    );

    const resultado = await servicio.crear(
      { nombre: 'Archivo', descripcion: 'Oficina de archivo' },
      usuarioAutenticado,
    );

    if (caso.admiteDescripcion) {
      expect(resultado.descripcion).toBe('Oficina de archivo');
    } else {
      // `etiquetas` no tiene la columna: la descripción se ignora en vez de
      // llegar al ORM y reventar con un error de columna desconocida.
      expect(resultado.descripcion).toBeNull();
      expect(repositorio.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ descripcion: expect.anything() }),
      );
    }
  });
});
