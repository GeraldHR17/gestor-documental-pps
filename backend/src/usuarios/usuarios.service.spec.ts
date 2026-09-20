// src/usuarios/usuarios.service.spec.ts
//
// Pruebas unitarias de UsuariosService, con mocks manuales de los
// repositorios de TypeORM (sin base de datos real). Cubre crear/actualizar/
// cambiarEstado/asignarRol: casos de éxito, duplicados y las reglas de
// negocio #9 (no auto-modificarse) y #10 (solo Superadministrador asigna
// Superadministrador).

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { UsuariosService } from './usuarios.service';
import { Usuario } from '../entidades/usuario.entidad';
import { Rol } from '../entidades/rol.entidad';
import { Dependencia } from '../entidades/dependencia.entidad';
import { Documento } from '../entidades/documento.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import {
  CorreoYaRegistradoException,
  IdentificacionYaRegistradaException,
  AutoModificacionNoPermitidaException,
  PermisoDenegadoException,
} from '../comun/excepciones/excepciones-autenticacion';

function crearRepositorioMock<T extends object>() {
  return {
    findOne: jest.fn(),
    save: jest.fn((entidad: T) => Promise.resolve(entidad)),
    create: jest.fn((datos: Partial<T>) => datos as T),
  };
}

describe('UsuariosService', () => {
  let servicio: UsuariosService;
  let repositorioUsuarios: ReturnType<typeof crearRepositorioMock<Usuario>>;
  let repositorioRoles: ReturnType<typeof crearRepositorioMock<Rol>>;
  let bitacoraService: { registrar: jest.Mock };

  const usuarioAutenticado: PayloadJwt = {
    idUsuario: 1,
    idRol: 2,
    nombreRol: 'Administrador',
    permisos: ['usuarios.administrar'],
  };

  beforeEach(async () => {
    repositorioUsuarios = crearRepositorioMock<Usuario>();
    repositorioRoles = crearRepositorioMock<Rol>();
    bitacoraService = { registrar: jest.fn() };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: getRepositoryToken(Usuario), useValue: repositorioUsuarios },
        { provide: getRepositoryToken(Rol), useValue: repositorioRoles },
        { provide: getRepositoryToken(Dependencia), useValue: crearRepositorioMock<Dependencia>() },
        {
          provide: getRepositoryToken(Documento),
          useValue: { ...crearRepositorioMock<Documento>(), count: jest.fn().mockResolvedValue(0) },
        },
        { provide: ConfigService, useValue: { get: jest.fn(() => '4') } },
        { provide: BitacoraService, useValue: bitacoraService },
      ],
    }).compile();

    servicio = modulo.get(UsuariosService);
  });

  function construirUsuario(overrides: Partial<Usuario> = {}): Usuario {
    return {
      idUsuario: 2,
      nombreCompleto: 'Ana Rodríguez',
      identificacion: '123456789',
      correo: 'ana@palmares.go.cr',
      contrasenaHash: 'hash',
      estado: 'ACTIVO',
      idRol: 3,
      rol: { idRol: 3, nombre: 'Usuario' } as Rol,
      ...overrides,
    } as Usuario;
  }

  describe('crear', () => {
    const dto = {
      nombreCompleto: 'Carlos Pérez',
      identificacion: '987654321',
      correo: 'carlos@palmares.go.cr',
      contrasenaTemporal: 'Temporal#1',
      idRol: 3,
    };

    it('crea el usuario y registra CREAR_USUARIO en bitácora', async () => {
      repositorioUsuarios.findOne.mockResolvedValue(null);
      repositorioRoles.findOne.mockResolvedValue({ idRol: 3, nombre: 'Usuario' } as Rol);

      const resultado = await servicio.crear(dto, usuarioAutenticado);

      expect(resultado.correo).toBe(dto.correo);
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CREAR_USUARIO', idUsuario: usuarioAutenticado.idUsuario }),
      );
    });

    it('rechaza con CorreoYaRegistradoException si el correo ya existe', async () => {
      repositorioUsuarios.findOne.mockResolvedValueOnce(construirUsuario());

      await expect(servicio.crear(dto, usuarioAutenticado)).rejects.toBeInstanceOf(
        CorreoYaRegistradoException,
      );
    });

    it('rechaza con IdentificacionYaRegistradaException si la identificación ya existe', async () => {
      repositorioUsuarios.findOne
        .mockResolvedValueOnce(null) // correo libre
        .mockResolvedValueOnce(construirUsuario()); // identificación ocupada

      await expect(servicio.crear(dto, usuarioAutenticado)).rejects.toBeInstanceOf(
        IdentificacionYaRegistradaException,
      );
    });
  });

  describe('actualizar', () => {
    it('actualiza los campos y registra ACTUALIZAR_USUARIO en bitácora', async () => {
      const usuario = construirUsuario();
      repositorioUsuarios.findOne.mockResolvedValueOnce(usuario); // buscar usuario

      const resultado = await servicio.actualizar(
        usuario.idUsuario,
        { nombreCompleto: 'Ana Actualizada' },
        usuarioAutenticado,
      );

      expect(resultado.nombreCompleto).toBe('Ana Actualizada');
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ACTUALIZAR_USUARIO' }),
      );
    });

    it('rechaza con CorreoYaRegistradoException si el nuevo correo ya está en uso por otro usuario', async () => {
      const usuario = construirUsuario();
      repositorioUsuarios.findOne
        .mockResolvedValueOnce(usuario) // buscar usuario
        .mockResolvedValueOnce(construirUsuario({ idUsuario: 99 })); // correo ocupado

      await expect(
        servicio.actualizar(usuario.idUsuario, { correo: 'otro@palmares.go.cr' }, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CorreoYaRegistradoException);
    });
  });

  describe('cambiarEstado', () => {
    it('inactiva el usuario y registra INACTIVAR_USUARIO en bitácora', async () => {
      const usuario = construirUsuario();
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      const resultado = await servicio.cambiarEstado(usuario.idUsuario, 'INACTIVO', usuarioAutenticado);

      expect(resultado.estado).toBe('INACTIVO');
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'INACTIVAR_USUARIO' }),
      );
    });

    it('reactiva el usuario y registra REACTIVAR_USUARIO en bitácora', async () => {
      const usuario = construirUsuario({ estado: 'INACTIVO' });
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      const resultado = await servicio.cambiarEstado(usuario.idUsuario, 'ACTIVO', usuarioAutenticado);

      expect(resultado.estado).toBe('ACTIVO');
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'REACTIVAR_USUARIO' }),
      );
    });

    it('rechaza con AutoModificacionNoPermitidaException si el usuario intenta auto-inactivarse', async () => {
      await expect(
        servicio.cambiarEstado(usuarioAutenticado.idUsuario, 'INACTIVO', usuarioAutenticado),
      ).rejects.toBeInstanceOf(AutoModificacionNoPermitidaException);
    });
  });

  describe('asignarRol', () => {
    it('rechaza con AutoModificacionNoPermitidaException si el usuario intenta cambiarse su propio rol', async () => {
      await expect(
        servicio.asignarRol(usuarioAutenticado.idUsuario, 3, usuarioAutenticado),
      ).rejects.toBeInstanceOf(AutoModificacionNoPermitidaException);
    });

    it('rechaza con PermisoDenegadoException si un no-Superadministrador intenta asignar el rol Superadministrador', async () => {
      repositorioRoles.findOne.mockResolvedValue({ idRol: 1, nombre: 'Superadministrador' } as Rol);

      await expect(servicio.asignarRol(2, 1, usuarioAutenticado)).rejects.toBeInstanceOf(
        PermisoDenegadoException,
      );
    });

    it('asigna el rol y registra ASIGNAR_ROL_USUARIO en bitácora', async () => {
      const usuario = construirUsuario();
      repositorioRoles.findOne.mockResolvedValue({ idRol: 4, nombre: 'Supervisor' } as Rol);
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      const resultado = await servicio.asignarRol(usuario.idUsuario, 4, usuarioAutenticado);

      expect(resultado.idRol).toBe(4);
      expect(bitacoraService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ASIGNAR_ROL_USUARIO' }),
      );
    });
  });
});
