// src/autenticacion/autenticacion.controller.ts

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AutenticacionService } from './autenticacion.service';
import { Publico } from '../comun/decoradores/publico.decorator';
import { UsuarioJwtActual } from '../comun/decoradores/usuario-jwt-actual.decorator';
import type { PayloadJwt } from './estrategias/jwt.strategy';

import { LoginDto } from './dto/login.dto';
import { ConfirmarVerificacionCorreoDto } from './dto/confirmar-verificacion-correo.dto';
import { ReenviarVerificacionCorreoDto } from './dto/reenviar-verificacion-correo.dto';
import { SolicitarRecuperacionDto } from './dto/solicitar-recuperacion.dto';
import { ConfirmarRecuperacionDto } from './dto/confirmar-recuperacion.dto';
import { TokenInvalidoException } from '../comun/excepciones/excepciones-autenticacion';

const NOMBRE_COOKIE_REFRESH = 'refreshToken';

@Controller('auth')
export class AutenticacionController {
  constructor(
    private readonly autenticacionService: AutenticacionService,
    private readonly configuracion: ConfigService,
  ) {}

  // Límite estricto sobre el general de la API (Sección 12): complementa
  // al bloqueo por intentos fallidos de RF-12, que es por cuenta, cortando
  // además la fuerza bruta distribuida sobre muchas cuentas distintas.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { tokens, usuario } = await this.autenticacionService.iniciarSesion(dto, {
      ipOrigen: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    this.establecerCookieRefresh(response, tokens.refreshToken, tokens.refreshTokenExpiracion);

    return { accessToken: tokens.accessToken, usuario };
  }

  @Publico()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshTokenPlano = request.cookies?.[NOMBRE_COOKIE_REFRESH];
    if (!refreshTokenPlano) {
      throw new TokenInvalidoException();
    }

    const tokens = await this.autenticacionService.renovarToken(refreshTokenPlano, {
      ipOrigen: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    this.establecerCookieRefresh(response, tokens.refreshToken, tokens.refreshTokenExpiracion);

    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @UsuarioJwtActual() usuarioActual: PayloadJwt,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshTokenPlano = request.cookies?.[NOMBRE_COOKIE_REFRESH];
    if (refreshTokenPlano) {
      await this.autenticacionService.cerrarSesion(refreshTokenPlano, usuarioActual.idUsuario);
    }
    response.clearCookie(NOMBRE_COOKIE_REFRESH, { path: '/auth' });
  }

  @Get('perfil')
  async perfil(@UsuarioJwtActual() usuarioActual: PayloadJwt) {
    return this.autenticacionService.obtenerPerfil(usuarioActual.idUsuario);
  }

  @Publico()
  @Post('verificar-correo')
  @HttpCode(HttpStatus.OK)
  async verificarCorreo(@Body() dto: ConfirmarVerificacionCorreoDto) {
    return this.autenticacionService.confirmarVerificacionCorreo(dto);
  }

  @Publico()
  @Post('verificar-correo/reenviar')
  @HttpCode(HttpStatus.OK)
  async reenviarVerificacionCorreo(@Body() dto: ReenviarVerificacionCorreoDto) {
    return this.autenticacionService.reenviarVerificacionCorreo(dto);
  }

  @Publico()
  @Post('recuperar-contrasena/solicitar')
  @HttpCode(HttpStatus.OK)
  async solicitarRecuperacion(@Body() dto: SolicitarRecuperacionDto) {
    return this.autenticacionService.solicitarRecuperacion(dto);
  }

  @Publico()
  @Post('recuperar-contrasena/confirmar')
  @HttpCode(HttpStatus.OK)
  async confirmarRecuperacion(@Body() dto: ConfirmarRecuperacionDto) {
    return this.autenticacionService.confirmarRecuperacion(dto);
  }

  private establecerCookieRefresh(response: Response, refreshToken: string, expiracion: Date): void {
    const esProduccion = this.configuracion.get<string>('NODE_ENV') === 'production';

    response.cookie(NOMBRE_COOKIE_REFRESH, refreshToken, {
      httpOnly: true,
      secure: esProduccion,
      sameSite: 'strict',
      path: '/auth',
      expires: expiracion,
    });
  }
}