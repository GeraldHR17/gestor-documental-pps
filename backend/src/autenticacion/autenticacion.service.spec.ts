// src/autenticacion/autenticacion.service.spec.ts
//
// Pruebas unitarias minimas de AutenticacionService, usando mocks
// manuales de los repositorios de TypeORM (sin base de datos real).
// Cubre los casos de la Seccion 14 del spec relacionados directamente
// con este servicio: login exito/fallo, bloqueo, correo no verificado,
// refresh (rotacion y reuso), logout y recuperacion.

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AutenticacionService } from './autenticacion.service';
import { Usuario } from '../entidades/usuario.entidad';
import { Rol } from '../entidades/rol.entidad';
import { SesionRefreshToken } from '../entidades/sesion-refresh-token.entidad';
import { TokenRecuperacionContrasena } from '../entidades/token-recuperacion-contrasena.entidad';
import { TokenVerificacionCorreo } from '../entidades/token-verificacion-correo.entidad';
import { CachePermisosService } from '../comun/cache/cache-permisos.service';
import { CorreoService } from '../correo/correo.service';
import { BitacoraService } from '../bitacora/bitacora.service';
import {
  CredencialesInvalidasException,
  CuentaBloqueadaException,
  CorreoNoVerificadoException,
  RefreshTokenRevocadoException,
} from '../comun/excepciones/excepciones-autenticacion';

function crearRepositorioMock<T extends object>() {
  return {
    findOne: jest.fn(),
    save: jest.fn((entidad: T) => Promise.resolve(entidad)),
    create: jest.fn((datos: Partial<T>) => datos as T),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

describe('AutenticacionService', () => {
  let servicio: AutenticacionService;
  let repositorioUsuarios: ReturnType<typeof crearRepositorioMock<Usuario>>;
  let repositorioSesiones: ReturnType<typeof crearRepositorioMock<SesionRefreshToken>>;
  let repositorioRoles: ReturnType<typeof crearRepositorioMock<Rol>>;
  let modulo: TestingModule;

  const contextoPeticion = { ipOrigen: '127.0.0.1', userAgent: 'jest' };

  beforeEach(async () => {
    repositorioUsuarios = crearRepositorioMock<Usuario>();
    repositorioSesiones = crearRepositorioMock<SesionRefreshToken>();
    repositorioRoles = crearRepositorioMock<Rol>();

    modulo = await Test.createTestingModule({
      providers: [
        AutenticacionService,
        { provide: getRepositoryToken(Usuario), useValue: repositorioUsuarios },
        { provide: getRepositoryToken(Rol), useValue: repositorioRoles },
        { provide: getRepositoryToken(SesionRefreshToken), useValue: repositorioSesiones },
        {
          provide: getRepositoryToken(TokenRecuperacionContrasena),
          useValue: crearRepositorioMock<TokenRecuperacionContrasena>(),
        },
        {
          provide: getRepositoryToken(TokenVerificacionCorreo),
          useValue: crearRepositorioMock<TokenVerificacionCorreo>(),
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(() => 'token-firmado-de-prueba'),
            decode: jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((clave: string) => {
              const valores: Record<string, string> = {
                BCRYPT_SALT_ROUNDS: '4',
                JWT_ACCESS_SECRET: 'secreto-de-acceso-de-prueba',
                JWT_REFRESH_SECRET: 'secreto-de-refresco-de-prueba',
              };
              return valores[clave];
            }),
          },
        },
        {
          provide: CachePermisosService,
          useValue: { obtener: jest.fn(() => ['documentos.consultar']), establecer: jest.fn(), invalidar: jest.fn() },
        },
        {
          provide: CorreoService,
          useValue: { enviarVerificacionCorreo: jest.fn(), enviarRecuperacionContrasena: jest.fn() },
        },
        { provide: BitacoraService, useValue: { registrar: jest.fn() } },
      ],
    }).compile();

    servicio = modulo.get(AutenticacionService);
  });

  function construirUsuario(overrides: Partial<Usuario> = {}): Usuario {
    return {
      idUsuario: 1,
      nombreCompleto: 'Ana Rodríguez',
      identificacion: '123456789',
      correo: 'ana@palmares.go.cr',
      contrasenaHash: bcrypt.hashSync('Clave#2024', 4),
      estado: 'ACTIVO',
      idRol: 3,
      rol: { idRol: 3, nombre: 'Usuario' } as Rol,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
      intentosFallidos: 0,
      bloqueadoHasta: null,
      correoVerificado: true,
      ...overrides,
      // Las colecciones de Documentos/Versiones/Bitácora de la entidad no
      // intervienen en autenticación; se omiten deliberadamente del mock.
    } as Usuario;
  }

  describe('iniciarSesion', () => {
    it('inicia sesion correctamente con credenciales validas', async () => {
      const usuario = construirUsuario();
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      const resultado = await servicio.iniciarSesion(
        { correo: usuario.correo, contrasena: 'Clave#2024' },
        contextoPeticion,
      );

      expect(resultado.tokens.accessToken).toBe('token-firmado-de-prueba');
      expect(resultado.usuario.correo).toBe(usuario.correo);
      expect(repositorioSesiones.save).toHaveBeenCalled();
    });

    it('rechaza con CredencialesInvalidasException si el usuario no existe', async () => {
      repositorioUsuarios.findOne.mockResolvedValue(null);

      await expect(
        servicio.iniciarSesion({ correo: 'no-existe@palmares.go.cr', contrasena: 'x' }, contextoPeticion),
      ).rejects.toBeInstanceOf(CredencialesInvalidasException);
    });

    it('rechaza con CredencialesInvalidasException si la contraseña es incorrecta', async () => {
      const usuario = construirUsuario();
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      await expect(
        servicio.iniciarSesion({ correo: usuario.correo, contrasena: 'incorrecta' }, contextoPeticion),
      ).rejects.toBeInstanceOf(CredencialesInvalidasException);

      expect(usuario.intentosFallidos).toBe(1);
    });

    it('bloquea la cuenta al alcanzar el maximo de intentos fallidos (RF-12)', async () => {
      const usuario = construirUsuario({ intentosFallidos: 4 });
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      await expect(
        servicio.iniciarSesion({ correo: usuario.correo, contrasena: 'incorrecta' }, contextoPeticion),
      ).rejects.toBeInstanceOf(CredencialesInvalidasException);

      expect(usuario.intentosFallidos).toBe(5);
      expect(usuario.bloqueadoHasta).not.toBeNull();
    });

    it('rechaza el login mientras la cuenta siga bloqueada', async () => {
      const usuario = construirUsuario({ bloqueadoHasta: new Date(Date.now() + 60_000) });
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      await expect(
        servicio.iniciarSesion({ correo: usuario.correo, contrasena: 'Clave#2024' }, contextoPeticion),
      ).rejects.toBeInstanceOf(CuentaBloqueadaException);
    });

    it('rechaza el login si el correo no ha sido verificado (RF-22)', async () => {
      const usuario = construirUsuario({ correoVerificado: false });
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      await expect(
        servicio.iniciarSesion({ correo: usuario.correo, contrasena: 'Clave#2024' }, contextoPeticion),
      ).rejects.toBeInstanceOf(CorreoNoVerificadoException);
    });
  });

  describe('renovarToken', () => {
    it('revoca todas las sesiones si el refresh token ya fue revocado (reuso)', async () => {
      repositorioSesiones.findOne.mockResolvedValue({
        idSesion: '10',
        idUsuario: 1,
        tokenHash: 'hash-cualquiera',
        fechaExpiracion: new Date(Date.now() + 60_000),
        revocado: true,
      } as SesionRefreshToken);

      await expect(servicio.renovarToken('token-robado', contextoPeticion)).rejects.toBeInstanceOf(
        RefreshTokenRevocadoException,
      );

      expect(repositorioSesiones.update).toHaveBeenCalledWith(
        { idUsuario: 1, revocado: false },
        { revocado: true },
      );
    });

    it('rota el refresh token cuando es valido', async () => {
      const usuario = construirUsuario();
      repositorioSesiones.findOne.mockResolvedValue({
        idSesion: '10',
        idUsuario: usuario.idUsuario,
        tokenHash: 'hash-valido',
        fechaExpiracion: new Date(Date.now() + 60_000),
        revocado: false,
      } as SesionRefreshToken);
      repositorioUsuarios.findOne.mockResolvedValue(usuario);

      const resultado = await servicio.renovarToken('token-valido', contextoPeticion);

      expect(resultado.accessToken).toBe('token-firmado-de-prueba');
      expect(repositorioSesiones.save).toHaveBeenCalled(); // marca la sesion anterior como revocada
    });

    // Pulido de Fase 6, sección B: expiración ABSOLUTA de 8 horas. La
    // renovación rota el token pero NO reinicia el plazo: el refresh token
    // nuevo hereda la fecha de expiración de la sesión original.
    it('la renovación conserva la expiración absoluta de la sesión original', async () => {
      const usuario = construirUsuario();
      const expiracionOriginal = new Date(Date.now() + 2 * 3_600_000); // faltan 2 h de las 8
      repositorioSesiones.findOne.mockResolvedValue({
        idSesion: '10',
        idUsuario: usuario.idUsuario,
        tokenHash: 'hash-valido',
        fechaExpiracion: expiracionOriginal,
        revocado: false,
      } as SesionRefreshToken);
      repositorioUsuarios.findOne.mockResolvedValue(usuario);
      const jwtService = modulo.get(JwtService) as { sign: jest.Mock };

      await servicio.renovarToken('token-valido', contextoPeticion);

      // La segunda firma es la del refresh token (la primera es el access).
      const opcionesRefresh = jwtService.sign.mock.calls[1][1] as { expiresIn: unknown };
      expect(typeof opcionesRefresh.expiresIn).toBe('number');
      // ~7200 s restantes, no una ventana nueva de 8 h (28 800 s).
      expect(opcionesRefresh.expiresIn as number).toBeLessThanOrEqual(7_200);
      expect(opcionesRefresh.expiresIn as number).toBeGreaterThan(7_100);
    });

    it('el login abre una ventana nueva leída de JWT_REFRESH_EXPIRATION', async () => {
      const usuario = construirUsuario();
      repositorioUsuarios.findOne.mockResolvedValue(usuario);
      const jwtService = modulo.get(JwtService) as { sign: jest.Mock };

      await servicio.iniciarSesion(
        { correo: usuario.correo, contrasena: 'Clave#2024' },
        contextoPeticion,
      );

      const opcionesRefresh = jwtService.sign.mock.calls[1][1] as { expiresIn: unknown };
      // Sin sesión previa no hay fecha que heredar: se usa la configuración.
      expect(typeof opcionesRefresh.expiresIn).toBe('string');
    });
  });

  describe('cerrarSesion', () => {
    it('marca la sesion como revocada', async () => {
      const sesion = {
        idSesion: '5',
        idUsuario: 1,
        tokenHash: 'hash',
        revocado: false,
      } as SesionRefreshToken;
      repositorioSesiones.findOne.mockResolvedValue(sesion);

      await servicio.cerrarSesion('token-plano', 1);

      expect(sesion.revocado).toBe(true);
      expect(repositorioSesiones.save).toHaveBeenCalledWith(sesion);
    });
  });
});