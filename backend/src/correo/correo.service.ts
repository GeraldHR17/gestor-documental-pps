// src/correo/correo.service.ts
//
// Correo saliente: verificación de cuenta (RF-21/22) y recuperación de
// contraseña (RF-11). Tres modos, decididos por la configuración:
//
//  1. SMTP_HOST definido -> transporte real con las credenciales del .env.
//     Las credenciales las pone la persona que administra el entorno;
//     este código no asume ninguna.
//  2. SMTP_HOST vacío fuera de producción -> cuenta de pruebas de Ethereal
//     (https://ethereal.email), que Nodemailer crea sola. Ningún correo
//     llega a un buzón real: cada envío deja en el log una URL de vista
//     previa donde se puede abrir el mensaje tal como se enviaría. Es lo
//     que permite probar el flujo completo sin un servidor de correo.
//  3. SMTP_HOST vacío en producción -> no se envía nada y se deja registro
//     en el log, para que el flujo de negocio no se rompa por un entorno
//     mal configurado (las respuestas de la API son genéricas de todos
//     modos, ver nota en `enviar`).

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import {
  NOMBRE_INSTITUCION,
  construirCorreoInstitucional,
  construirTextoPlano,
  type ContenidoCorreoInstitucional,
} from './plantillas-correo';

/** Remitente de pruebas acordado con el PO; se cambia por variable de entorno. */
const REMITENTE_POR_DEFECTO = 'alcaldia@munipalmares.go.cr';

@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  private readonly remitente: string;
  private readonly urlFrontend: string;
  private readonly usaCuentaDePruebas: boolean;
  private transportador: Promise<nodemailer.Transporter | null> | null = null;

  constructor(private readonly configuracion: ConfigService) {
    this.remitente = this.configuracion.get<string>('SMTP_FROM')?.trim() || REMITENTE_POR_DEFECTO;
    this.urlFrontend = this.configuracion.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    const hayServidor = Boolean(this.configuracion.get<string>('SMTP_HOST')?.trim());
    const esProduccion = this.configuracion.get<string>('NODE_ENV') === 'production';
    this.usaCuentaDePruebas = !hayServidor && !esProduccion;
  }

  /** Expuesto para diagnósticos y pruebas: qué modo quedó activo. */
  get modo(): 'smtp' | 'ethereal' | 'deshabilitado' {
    if (this.configuracion.get<string>('SMTP_HOST')?.trim()) return 'smtp';
    return this.usaCuentaDePruebas ? 'ethereal' : 'deshabilitado';
  }

  async enviarVerificacionCorreo(destinatario: string, token: string): Promise<void> {
    const horas = Number(this.configuracion.get<string>('TOKEN_VERIFICACION_EXPIRACION_HORAS') ?? 24);
    await this.enviar(destinatario, `Confirme su correo — ${NOMBRE_INSTITUCION}`, {
      titulo: 'Confirme su correo electrónico',
      parrafos: [
        `Gracias por registrarse en el Portal de Gobierno Abierto de la ${NOMBRE_INSTITUCION}.`,
        'Para activar su cuenta y poder iniciar sesión, confirme su correo electrónico con el siguiente botón.',
      ],
      textoBoton: 'Verificar mi correo',
      enlace: `${this.urlFrontend}/verificar-correo?token=${encodeURIComponent(token)}`,
      vigencia: `${horas} horas`,
      nota: 'Si usted no realizó este registro, puede ignorar este mensaje; no se creará ninguna cuenta activa.',
    });
  }

  async enviarRecuperacionContrasena(destinatario: string, token: string): Promise<void> {
    const minutos = Number(this.configuracion.get<string>('TOKEN_RECUPERACION_EXPIRACION_MIN') ?? 60);
    await this.enviar(destinatario, `Recuperación de contraseña — ${NOMBRE_INSTITUCION}`, {
      titulo: 'Recuperación de contraseña',
      parrafos: [
        'Recibimos una solicitud para restablecer la contraseña de su cuenta.',
        'Para elegir una contraseña nueva, use el siguiente botón.',
      ],
      textoBoton: 'Restablecer contraseña',
      enlace: `${this.urlFrontend}/recuperar-contrasena?token=${encodeURIComponent(token)}`,
      vigencia: `${minutos} minutos`,
      nota: 'Si usted no solicitó este cambio, puede ignorar este mensaje; su contraseña actual seguirá funcionando.',
    });
  }

  private async enviar(
    destinatario: string,
    asunto: string,
    contenido: ContenidoCorreoInstitucional,
  ): Promise<void> {
    try {
      const transportador = await this.obtenerTransportador();
      if (!transportador) {
        this.logger.warn(`Correo NO enviado a ${destinatario} (SMTP sin configurar): ${asunto}`);
        return;
      }

      const resultado = await transportador.sendMail({
        from: { name: NOMBRE_INSTITUCION, address: this.remitente },
        to: destinatario,
        subject: asunto,
        text: construirTextoPlano(contenido),
        html: construirCorreoInstitucional(contenido),
      });

      if (this.usaCuentaDePruebas) {
        // En Ethereal el mensaje no viaja a ningún buzón: esta URL es la
        // única forma de verlo, por eso se deja en el log.
        this.logger.log(
          `Correo de prueba para ${destinatario}: ${nodemailer.getTestMessageUrl(resultado) || '(sin vista previa)'}`,
        );
      }
    } catch (error) {
      // No se relanza hacia el flujo de negocio: por diseño (Sección 9,
      // regla #4) las respuestas de verificación/recuperación son siempre
      // genéricas, tanto si el envío tuvo éxito como si no, para no
      // revelar información ni bloquear el flujo por una falla transitoria
      // del SMTP. Se deja registrado para soporte.
      this.logger.error(`No se pudo enviar correo a ${destinatario}`, error as Error);
    }
  }

  /**
   * El transporte se crea una sola vez, en el primer envío y no en el
   * constructor: crear la cuenta de Ethereal es una llamada de red y no
   * debe retrasar ni condicionar el arranque de la aplicación.
   */
  private obtenerTransportador(): Promise<nodemailer.Transporter | null> {
    if (!this.transportador) {
      this.transportador = this.crearTransportador().catch((error: unknown) => {
        this.logger.error('No se pudo preparar el transporte de correo', error as Error);
        // Se deja reintentar en el siguiente envío.
        this.transportador = null;
        return null;
      });
    }
    return this.transportador;
  }

  private async crearTransportador(): Promise<nodemailer.Transporter | null> {
    const host = this.configuracion.get<string>('SMTP_HOST')?.trim();

    if (host) {
      const puerto = Number(this.configuracion.get<string>('SMTP_PORT') ?? 587);
      const usuario = this.configuracion.get<string>('SMTP_USER')?.trim();
      const contrasena = this.configuracion.get<string>('SMTP_PASS');
      return nodemailer.createTransport({
        host,
        port: puerto,
        // 465 es SMTPS (TLS desde el inicio); 587 y 25 negocian STARTTLS.
        secure: puerto === 465,
        auth: usuario ? { user: usuario, pass: contrasena } : undefined,
      });
    }

    if (!this.usaCuentaDePruebas) {
      return null;
    }

    const cuenta = await nodemailer.createTestAccount();
    this.logger.warn(
      `SMTP sin configurar: se usa una cuenta de pruebas de Ethereal (${cuenta.user}). ` +
        'Los correos NO llegan a buzones reales; cada envío deja una URL de vista previa en este log.',
    );
    return nodemailer.createTransport({
      host: cuenta.smtp.host,
      port: cuenta.smtp.port,
      secure: cuenta.smtp.secure,
      auth: { user: cuenta.user, pass: cuenta.pass },
    });
  }
}
