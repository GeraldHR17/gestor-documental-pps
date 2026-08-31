// src/correo/correo.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  private readonly transportador: nodemailer.Transporter;
  private readonly remitente: string;
  private readonly urlFrontend: string;

  constructor(private readonly configuracion: ConfigService) {
    this.transportador = nodemailer.createTransport({
      host: this.configuracion.get<string>('SMTP_HOST'),
      port: Number(this.configuracion.get<string>('SMTP_PORT')),
      secure: false,
      auth: {
        user: this.configuracion.get<string>('SMTP_USER'),
        pass: this.configuracion.get<string>('SMTP_PASS'),
      },
    });
    this.remitente = this.configuracion.get<string>('SMTP_FROM') ?? 'no-responder@palmares.go.cr';
    this.urlFrontend = this.configuracion.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  async enviarVerificacionCorreo(destinatario: string, token: string): Promise<void> {
    const enlace = `${this.urlFrontend}/verificar-correo?token=${token}`;
    await this.enviar({
      destinatario,
      asunto: 'Confirme su correo — Municipalidad de Palmares',
      html: `
        <p>Gracias por registrarse en el Portal de Gobierno Abierto de la Municipalidad de Palmares.</p>
        <p>Para activar su cuenta, confirme su correo electrónico dando clic en el siguiente enlace (válido por 24 horas):</p>
        <p><a href="${enlace}">${enlace}</a></p>
        <p>Si usted no realizó este registro, puede ignorar este mensaje.</p>
      `,
    });
  }

  async enviarRecuperacionContrasena(destinatario: string, token: string): Promise<void> {
    const enlace = `${this.urlFrontend}/recuperar-contrasena?token=${token}`;
    await this.enviar({
      destinatario,
      asunto: 'Recuperación de contraseña — Municipalidad de Palmares',
      html: `
        <p>Recibimos una solicitud para restablecer su contraseña.</p>
        <p>Este enlace es válido por 60 minutos:</p>
        <p><a href="${enlace}">${enlace}</a></p>
        <p>Si usted no solicitó este cambio, puede ignorar este mensaje; su contraseña actual seguirá funcionando.</p>
      `,
    });
  }

  private async enviar(datos: { destinatario: string; asunto: string; html: string }): Promise<void> {
    try {
      await this.transportador.sendMail({
        from: this.remitente,
        to: datos.destinatario,
        subject: datos.asunto,
        html: datos.html,
      });
    } catch (error) {
      // No se relanza el error hacia el flujo de negocio: por diseño
      // (Seccion 9, regla #4) las respuestas de verificacion/recuperacion
      // son siempre genericas independientemente de si el envio de correo
      // tuvo exito, para no revelar informacion ni bloquear el flujo por
      // una falla transitoria del SMTP. Se deja registrado para soporte.
      this.logger.error(`No se pudo enviar correo a ${datos.destinatario}`, error as Error);
    }
  }
}