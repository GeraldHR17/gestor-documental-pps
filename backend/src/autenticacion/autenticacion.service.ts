// src/autenticacion/autenticacion.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { LessThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { Usuario } from '../entidades/usuario.entidad';
import { Rol } from '../entidades/rol.entidad';
import { SesionRefreshToken } from '../entidades/sesion-refresh-token.entidad';
import { TokenRecuperacionContrasena } from '../entidades/token-recuperacion-contrasena.entidad';
import { TokenVerificacionCorreo } from '../entidades/token-verificacion-correo.entidad';
import { CachePermisosService } from '../comun/cache/cache-permisos.service';
import { CorreoService } from '../correo/correo.service';
import { BitacoraService } from '../bitacora/bitacora.service';

import { LoginDto } from './dto/login.dto';
import { ConfirmarVerificacionCorreoDto } from './dto/confirmar-verificacion-correo.dto';
import { ReenviarVerificacionCorreoDto } from './dto/reenviar-verificacion-correo.dto';
import { SolicitarRecuperacionDto } from './dto/solicitar-recuperacion.dto';
import { ConfirmarRecuperacionDto } from './dto/confirmar-recuperacion.dto';
import { PerfilUsuarioRespuestaDto } from './dto/perfil-usuario-respuesta.dto';

import {
  CredencialesInvalidasException,
  CuentaBloqueadaException,
  CorreoNoVerificadoException,
  TokenVerificacionInvalidoException,
  RefreshTokenRevocadoException,
  TokenExpiradoException,
  TokenInvalidoException,
  UsuarioNoEncontradoException,
  TokenRecuperacionInvalidoException,
} from '../comun/excepciones/excepciones-autenticacion';
import type { PayloadJwt } from './estrategias/jwt.strategy';

interface ContextoPeticion {
  ipOrigen: string | null;
  userAgent: string | null;
}

interface ResultadoTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiracion: Date;
}

const MENSAJE_GENERICO_RECUPERACION = 'Si el correo existe, se enviaron instrucciones';
const MENSAJE_GENERICO_REENVIO_VERIFICACION =
  'Si el correo existe y no ha sido verificado, se reenvió el enlace';

@Injectable()
export class AutenticacionService {
  constructor(
    @InjectRepository(Usuario)
    private readonly repositorioUsuarios: Repository<Usuario>,
    @InjectRepository(Rol)
    private readonly repositorioRoles: Repository<Rol>,
    @InjectRepository(SesionRefreshToken)
    private readonly repositorioSesiones: Repository<SesionRefreshToken>,
    @InjectRepository(TokenRecuperacionContrasena)
    private readonly repositorioTokensRecuperacion: Repository<TokenRecuperacionContrasena>,
    @InjectRepository(TokenVerificacionCorreo)
    private readonly repositorioTokensVerificacion: Repository<TokenVerificacionCorreo>,
    private readonly jwtService: JwtService,
    private readonly configuracion: ConfigService,
    private readonly cachePermisos: CachePermisosService,
    private readonly correoService: CorreoService,
    private readonly bitacoraService: BitacoraService,
  ) {}

  // ============================================================
  // RF-01 / RF-12 / RF-22 — Login
  // ============================================================
  async iniciarSesion(
    dto: LoginDto,
    contexto: ContextoPeticion,
  ): Promise<{ tokens: ResultadoTokens; usuario: PerfilUsuarioRespuestaDto }> {
    const usuario = await this.repositorioUsuarios.findOne({
      where: { correo: dto.correo },
      relations: { rol: true, dependencia: true },
    });

    if (!usuario) {
      await this.registrarBitacora(null, 'LOGIN_FALLIDO', contexto, 'FALLIDO');
      throw new CredencialesInvalidasException();
    }

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
      const minutosRestantes = Math.ceil(
        (usuario.bloqueadoHasta.getTime() - Date.now()) / 60000,
      );
      throw new CuentaBloqueadaException(minutosRestantes);
    }

    // Regla #6: correo no verificado se rechaza ANTES de contar como
    // intento fallido (no debe consumir el contador de RF-12).
    if (!usuario.correoVerificado) {
      throw new CorreoNoVerificadoException();
    }

    const contrasenaValida = await bcrypt.compare(dto.contrasena, usuario.contrasenaHash);

    if (!contrasenaValida) {
      await this.registrarIntentoFallido(usuario);
      await this.registrarBitacora(usuario.idUsuario, 'LOGIN_FALLIDO', contexto, 'FALLIDO');
      throw new CredencialesInvalidasException();
    }

    usuario.intentosFallidos = 0;
    usuario.bloqueadoHasta = null;
    await this.repositorioUsuarios.save(usuario);

    const tokens = await this.emitirTokens(usuario, contexto);
    await this.registrarBitacora(usuario.idUsuario, 'LOGIN_EXITOSO', contexto, 'EXITO');

    return { tokens, usuario: await this.construirPerfil(usuario) };
  }

  // ============================================================
  // RF-02 — Renovación de sesión (con rotación y deteccion de reuso)
  // ============================================================
  async renovarToken(refreshTokenPlano: string, contexto: ContextoPeticion): Promise<ResultadoTokens> {
    const tokenHash = this.hashSha256(refreshTokenPlano);
    const sesion = await this.repositorioSesiones.findOne({ where: { tokenHash } });

    if (!sesion) {
      throw new RefreshTokenRevocadoException();
    }

    if (sesion.revocado) {
      // Regla #3: token ya revocado siendo reutilizado -> posible robo de
      // sesion. Se revocan TODAS las sesiones activas de ese usuario.
      await this.repositorioSesiones.update(
        { idUsuario: sesion.idUsuario, revocado: false },
        { revocado: true },
      );
      throw new RefreshTokenRevocadoException();
    }

    if (sesion.fechaExpiracion.getTime() <= Date.now()) {
      sesion.revocado = true;
      await this.repositorioSesiones.save(sesion);
      throw new TokenExpiradoException();
    }

    const usuario = await this.repositorioUsuarios.findOne({
      where: { idUsuario: sesion.idUsuario },
      relations: { rol: true, dependencia: true },
    });

    if (!usuario || usuario.estado !== 'ACTIVO') {
      throw new TokenInvalidoException();
    }

    sesion.revocado = true;
    await this.repositorioSesiones.save(sesion);

    // Expiración ABSOLUTA (pulido de Fase 6, sección B): el token rotado
    // hereda la fecha de expiración de la sesión original en vez de
    // recibir una ventana nueva. Antes, cada renovación reiniciaba el plazo
    // y una sesión activa no expiraba jamás; ahora, a las 8 horas del
    // login se exige volver a autenticar, se haya usado o no el sistema.
    return this.emitirTokens(usuario, contexto, sesion.fechaExpiracion);
  }

  // ============================================================
  // RF-03 — Logout
  // ============================================================
  async cerrarSesion(refreshTokenPlano: string, idUsuarioAutenticado: number): Promise<void> {
    const tokenHash = this.hashSha256(refreshTokenPlano);
    const sesion = await this.repositorioSesiones.findOne({
      where: { tokenHash, idUsuario: idUsuarioAutenticado },
    });

    if (sesion) {
      sesion.revocado = true;
      await this.repositorioSesiones.save(sesion);
    }

    await this.registrarBitacora(idUsuarioAutenticado, 'LOGOUT', {
      ipOrigen: null,
      userAgent: null,
    }, 'EXITO');
  }

  // ============================================================
  // RF-09 — Perfil del usuario autenticado
  // ============================================================
  async obtenerPerfil(idUsuario: number): Promise<PerfilUsuarioRespuestaDto> {
    const usuario = await this.repositorioUsuarios.findOne({
      where: { idUsuario },
      relations: { rol: true, dependencia: true },
    });

    if (!usuario) {
      throw new UsuarioNoEncontradoException();
    }

    return this.construirPerfil(usuario);
  }

  // ============================================================
  // RF-21 — Verificación de correo
  // ============================================================
  async confirmarVerificacionCorreo(dto: ConfirmarVerificacionCorreoDto): Promise<{ mensaje: string }> {
    const tokenHash = this.hashSha256(dto.token);
    const token = await this.repositorioTokensVerificacion.findOne({
      where: { tokenHash, usado: false },
    });

    if (!token || token.fechaExpiracion.getTime() <= Date.now()) {
      throw new TokenVerificacionInvalidoException();
    }

    token.usado = true;
    await this.repositorioTokensVerificacion.save(token);

    await this.repositorioUsuarios.update({ idUsuario: token.idUsuario }, { correoVerificado: true });

    return { mensaje: 'Correo verificado correctamente' };
  }

  // ============================================================
  // RF-23 — Reenvío de verificación (sin enumeración de cuentas)
  // ============================================================
  async reenviarVerificacionCorreo(dto: ReenviarVerificacionCorreoDto): Promise<{ mensaje: string }> {
    const usuario = await this.repositorioUsuarios.findOne({ where: { correo: dto.correo } });

    if (usuario && !usuario.correoVerificado) {
      await this.generarYEnviarTokenVerificacion(usuario);
    }

    return { mensaje: MENSAJE_GENERICO_REENVIO_VERIFICACION };
  }

  // ============================================================
  // RF-11 — Recuperación de contraseña (sin enumeración de cuentas)
  // ============================================================
  async solicitarRecuperacion(dto: SolicitarRecuperacionDto): Promise<{ mensaje: string }> {
    const usuario = await this.repositorioUsuarios.findOne({ where: { correo: dto.correo } });

    if (usuario) {
      const tokenPlano = this.generarTokenOpaco();
      const minutos = Number(this.configuracion.get<string>('TOKEN_RECUPERACION_EXPIRACION_MIN') ?? 60);

      const token = this.repositorioTokensRecuperacion.create({
        idUsuario: usuario.idUsuario,
        tokenHash: this.hashSha256(tokenPlano),
        fechaExpiracion: new Date(Date.now() + minutos * 60_000),
        usado: false,
      });
      await this.repositorioTokensRecuperacion.save(token);

      await this.correoService.enviarRecuperacionContrasena(usuario.correo, tokenPlano);
    }

    return { mensaje: MENSAJE_GENERICO_RECUPERACION };
  }

  async confirmarRecuperacion(dto: ConfirmarRecuperacionDto): Promise<{ mensaje: string }> {
    const tokenHash = this.hashSha256(dto.token);
    const token = await this.repositorioTokensRecuperacion.findOne({
      where: { tokenHash, usado: false },
    });

    if (!token || token.fechaExpiracion.getTime() <= Date.now()) {
      throw new TokenRecuperacionInvalidoException();
    }

    const saltRounds = Number(this.configuracion.get<string>('BCRYPT_SALT_ROUNDS') ?? 12);
    const nuevaContrasenaHash = await bcrypt.hash(dto.nuevaContrasena, saltRounds);

    await this.repositorioUsuarios.update(
      { idUsuario: token.idUsuario },
      { contrasenaHash: nuevaContrasenaHash, intentosFallidos: 0, bloqueadoHasta: null },
    );

    token.usado = true;
    await this.repositorioTokensRecuperacion.save(token);

    // Medida defensiva razonable (no exigida explicitamente por el spec):
    // tras un cambio de contraseña por recuperacion, se cierran todas las
    // sesiones activas del usuario por seguridad.
    await this.repositorioSesiones.update(
      { idUsuario: token.idUsuario, revocado: false },
      { revocado: true },
    );

    return { mensaje: 'Contraseña actualizada correctamente' };
  }

  // ============================================================
  // Helpers privados
  // ============================================================

  /**
   * @param expiracionAbsoluta Si se indica (renovación), el refresh token
   *   nuevo expira exactamente en esa fecha; si se omite (login), se abre
   *   una ventana nueva de JWT_REFRESH_EXPIRATION (8 horas).
   */
  private async emitirTokens(
    usuario: Usuario,
    contexto: ContextoPeticion,
    expiracionAbsoluta?: Date,
  ): Promise<ResultadoTokens> {
    const permisos = await this.obtenerPermisosEfectivos(usuario.idRol);

    const payloadAcceso: PayloadJwt = {
      idUsuario: usuario.idUsuario,
      idRol: usuario.idRol,
      nombreRol: usuario.rol?.nombre ?? '',
      permisos,
    };

    const accessToken = this.jwtService.sign(
      payloadAcceso,
      this.opcionesFirma('JWT_ACCESS_SECRET', 'JWT_ACCESS_EXPIRATION', '15m'),
    );

    const opcionesRefresh = this.opcionesFirma('JWT_REFRESH_SECRET', 'JWT_REFRESH_EXPIRATION', '8h');
    if (expiracionAbsoluta) {
      // jsonwebtoken acepta segundos como número; se garantiza al menos 1
      // para no firmar un token que nazca vencido si la renovación llega
      // justo en el límite (renovarToken ya rechazó los expirados antes).
      const segundosRestantes = Math.max(
        1,
        Math.floor((expiracionAbsoluta.getTime() - Date.now()) / 1000),
      );
      opcionesRefresh.expiresIn = segundosRestantes;
    }

    const refreshToken = this.jwtService.sign(
      { idUsuario: usuario.idUsuario, jti: crypto.randomUUID() },
      opcionesRefresh,
    );

    const payloadDecodificado = this.jwtService.decode(refreshToken) as { exp: number };
    const refreshTokenExpiracion = new Date(payloadDecodificado.exp * 1000);

    const sesion = this.repositorioSesiones.create({
      idUsuario: usuario.idUsuario,
      tokenHash: this.hashSha256(refreshToken),
      fechaExpiracion: refreshTokenExpiracion,
      revocado: false,
      ipOrigen: contexto.ipOrigen,
      userAgent: contexto.userAgent,
    });
    await this.repositorioSesiones.save(sesion);

    return { accessToken, refreshToken, refreshTokenExpiracion };
  }

  private async construirPerfil(usuario: Usuario): Promise<PerfilUsuarioRespuestaDto> {
    const permisos = await this.obtenerPermisosEfectivos(usuario.idRol);
    return new PerfilUsuarioRespuestaDto({
      idUsuario: usuario.idUsuario,
      nombreCompleto: usuario.nombreCompleto,
      correo: usuario.correo,
      rol: usuario.rol?.nombre ?? '',
      permisos,
      idDependencia: usuario.idDependencia ?? null,
      nombreDependencia: usuario.dependencia?.nombre ?? null,
    });
  }

  async obtenerPermisosEfectivos(idRol: number): Promise<string[]> {
    const enCache = this.cachePermisos.obtener(idRol);
    if (enCache) {
      return enCache;
    }

    const rol = await this.repositorioRoles.findOne({
      where: { idRol },
      relations: { permisos: true },
    });

    const permisos = (rol?.permisos ?? [])
      .filter((permiso) => permiso.estado === 'ACTIVO')
      .map((permiso) => permiso.nombre);

    this.cachePermisos.establecer(idRol, permisos);
    return permisos;
  }

  private async registrarIntentoFallido(usuario: Usuario): Promise<void> {
    const maxIntentos = Number(this.configuracion.get<string>('LOGIN_MAX_INTENTOS') ?? 5);
    const minutosBloqueo = Number(this.configuracion.get<string>('LOGIN_BLOQUEO_MINUTOS') ?? 15);

    usuario.intentosFallidos += 1;

    if (usuario.intentosFallidos >= maxIntentos) {
      usuario.bloqueadoHasta = new Date(Date.now() + minutosBloqueo * 60_000);
    }

    await this.repositorioUsuarios.save(usuario);
  }

  private async generarYEnviarTokenVerificacion(usuario: Usuario): Promise<void> {
    const tokenPlano = this.generarTokenOpaco();
    const horas = Number(this.configuracion.get<string>('TOKEN_VERIFICACION_EXPIRACION_HORAS') ?? 24);

    const token = this.repositorioTokensVerificacion.create({
      idUsuario: usuario.idUsuario,
      tokenHash: this.hashSha256(tokenPlano),
      fechaExpiracion: new Date(Date.now() + horas * 3_600_000),
      usado: false,
    });
    await this.repositorioTokensVerificacion.save(token);

    await this.correoService.enviarVerificacionCorreo(usuario.correo, tokenPlano);
  }

  private async registrarBitacora(
    idUsuario: number | null,
    accion: string,
    contexto: ContextoPeticion,
    resultado: 'EXITO' | 'FALLIDO',
  ): Promise<void> {
    await this.bitacoraService.registrar({
      idUsuario,
      accion,
      entidad: 'usuarios',
      resultado,
      ipOrigen: contexto.ipOrigen,
    });
  }

  /**
   * Arma las opciones de firma de un JWT desde configuración. El tipo de
   * `expiresIn` que espera jsonwebtoken es un literal acotado
   * (`StringValue`, ej. '15m' | '7d'), no un `string` cualquiera; como el
   * valor llega desde una variable de entorno, se afirma el tipo aquí, en
   * un único lugar, en vez de repetir el cast en cada llamada a sign().
   */
  private opcionesFirma(
    claveSecreto: string,
    claveExpiracion: string,
    expiracionPorDefecto: string,
  ): JwtSignOptions {
    const secreto = this.configuracion.get<string>(claveSecreto);
    if (!secreto) {
      throw new Error(
        `Falta la variable de entorno ${claveSecreto}; no es posible firmar tokens.`,
      );
    }

    return {
      secret: secreto,
      expiresIn: (this.configuracion.get<string>(claveExpiracion) ??
        expiracionPorDefecto) as JwtSignOptions['expiresIn'],
    };
  }

  private generarTokenOpaco(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashSha256(valor: string): string {
    return crypto.createHash('sha256').update(valor).digest('hex');
  }

  /** Utilidad de mantenimiento opcional: purga tokens/sesiones vencidos. */
  async purgarExpirados(): Promise<void> {
    const ahora = new Date();
    await this.repositorioSesiones.delete({ fechaExpiracion: LessThan(ahora), revocado: true });
    await this.repositorioTokensRecuperacion.delete({ fechaExpiracion: LessThan(ahora), usado: true });
    await this.repositorioTokensVerificacion.delete({ fechaExpiracion: LessThan(ahora), usado: true });
  }
}