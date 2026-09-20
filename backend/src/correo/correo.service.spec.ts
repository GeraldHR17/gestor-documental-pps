// src/correo/correo.service.spec.ts
//
// Se simula nodemailer completo: lo que se prueba es qué transporte elige
// el servicio según la configuración y qué mensaje arma (remitente,
// plantilla institucional, enlace con token), no que un SMTP real reciba
// nada.

import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { CorreoService } from './correo.service';
import { COLOR_PRIMARIO, construirCorreoInstitucional } from './plantillas-correo';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
  createTestAccount: jest.fn(),
  getTestMessageUrl: jest.fn(() => 'https://ethereal.email/message/abc'),
}));

const nodemailerSimulado = nodemailer as jest.Mocked<typeof nodemailer>;

function montar(variables: Record<string, string | undefined>) {
  const configuracion = {
    get: jest.fn((clave: string) => variables[clave]),
  } as unknown as ConfigService;
  const sendMail = jest.fn().mockResolvedValue({ messageId: '<1@prueba>' });
  nodemailerSimulado.createTransport.mockReturnValue({ sendMail } as never);
  nodemailerSimulado.createTestAccount.mockResolvedValue({
    user: 'prueba@ethereal.email',
    pass: 'secreto',
    smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
  } as never);
  return { servicio: new CorreoService(configuracion), sendMail };
}

beforeEach(() => jest.clearAllMocks());

describe('CorreoService — modo de transporte', () => {
  it('con SMTP_HOST usa ese servidor con las credenciales del entorno', async () => {
    const { servicio } = montar({ SMTP_HOST: 'smtp.muni.local', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p' });

    await servicio.enviarRecuperacionContrasena('persona@correo.com', 'tok');

    expect(servicio.modo).toBe('smtp');
    expect(nodemailerSimulado.createTestAccount).not.toHaveBeenCalled();
    expect(nodemailerSimulado.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.muni.local', port: 465, secure: true, auth: { user: 'u', pass: 'p' } }),
    );
  });

  it('sin SMTP_HOST fuera de producción crea una cuenta de pruebas de Ethereal', async () => {
    const { servicio } = montar({ SMTP_HOST: '' });

    await servicio.enviarRecuperacionContrasena('persona@correo.com', 'tok');

    expect(servicio.modo).toBe('ethereal');
    expect(nodemailerSimulado.createTestAccount).toHaveBeenCalledTimes(1);
    expect(nodemailerSimulado.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.ethereal.email', auth: { user: 'prueba@ethereal.email', pass: 'secreto' } }),
    );
  });

  it('la cuenta de pruebas se crea una sola vez aunque se envíen varios correos', async () => {
    const { servicio } = montar({ SMTP_HOST: '' });

    await servicio.enviarRecuperacionContrasena('a@correo.com', 't1');
    await servicio.enviarVerificacionCorreo('b@correo.com', 't2');

    expect(nodemailerSimulado.createTestAccount).toHaveBeenCalledTimes(1);
  });

  it('sin SMTP_HOST en producción no envía nada ni falla', async () => {
    const { servicio, sendMail } = montar({ SMTP_HOST: '', NODE_ENV: 'production' });

    await expect(servicio.enviarRecuperacionContrasena('persona@correo.com', 'tok')).resolves.toBeUndefined();

    expect(servicio.modo).toBe('deshabilitado');
    expect(sendMail).not.toHaveBeenCalled();
  });

  // Regla #4 de la Sección 9: la respuesta al usuario es genérica pase lo
  // que pase con el correo, así que un fallo del SMTP no puede propagarse.
  it('un fallo del envío se registra pero no se relanza', async () => {
    const { servicio, sendMail } = montar({ SMTP_HOST: 'smtp.muni.local' });
    sendMail.mockRejectedValueOnce(new Error('conexión rechazada'));

    await expect(servicio.enviarVerificacionCorreo('persona@correo.com', 'tok')).resolves.toBeUndefined();
  });
});

describe('CorreoService — contenido del mensaje', () => {
  it('usa el remitente de pruebas acordado si SMTP_FROM no está definido', async () => {
    const { servicio, sendMail } = montar({ SMTP_HOST: 'smtp.muni.local' });

    await servicio.enviarRecuperacionContrasena('persona@correo.com', 'tok');

    expect(sendMail.mock.calls[0][0].from).toEqual({
      name: 'Municipalidad de Palmares',
      address: 'alcaldia@munipalmares.go.cr',
    });
  });

  it('respeta SMTP_FROM cuando está definido (cambiable sin tocar código)', async () => {
    const { servicio, sendMail } = montar({ SMTP_HOST: 'smtp.muni.local', SMTP_FROM: 'otro@munipalmares.go.cr' });

    await servicio.enviarRecuperacionContrasena('persona@correo.com', 'tok');

    expect(sendMail.mock.calls[0][0].from.address).toBe('otro@munipalmares.go.cr');
  });

  it('la recuperación lleva plantilla HTML institucional, botón y enlace con el token', async () => {
    const { servicio, sendMail } = montar({ SMTP_HOST: 'smtp.muni.local', FRONTEND_URL: 'http://localhost:5173', TOKEN_RECUPERACION_EXPIRACION_MIN: '60' });

    await servicio.enviarRecuperacionContrasena('persona@correo.com', 'abc123');

    const mensaje = sendMail.mock.calls[0][0];
    expect(mensaje.subject).toContain('Recuperación de contraseña');
    expect(mensaje.html).toContain('Municipalidad de Palmares');
    expect(mensaje.html).toContain(COLOR_PRIMARIO);
    expect(mensaje.html).toContain('Restablecer contraseña');
    expect(mensaje.html).toContain('http://localhost:5173/recuperar-contrasena?token=abc123');
    expect(mensaje.html).toContain('60 minutos');
    // Versión en texto plano para clientes sin HTML.
    expect(mensaje.text).toContain('http://localhost:5173/recuperar-contrasena?token=abc123');
  });

  it('la verificación lleva su propio botón y enlace', async () => {
    const { servicio, sendMail } = montar({ SMTP_HOST: 'smtp.muni.local', FRONTEND_URL: 'http://localhost:5173' });

    await servicio.enviarVerificacionCorreo('persona@correo.com', 'xyz');

    const mensaje = sendMail.mock.calls[0][0];
    expect(mensaje.subject).toContain('Confirme su correo');
    expect(mensaje.html).toContain('Verificar mi correo');
    expect(mensaje.html).toContain('http://localhost:5173/verificar-correo?token=xyz');
  });
});

describe('plantilla institucional', () => {
  it('escapa el marcado en los textos para que no rompa ni inyecte HTML', () => {
    const html = construirCorreoInstitucional({
      titulo: 'Hola <b>mundo</b>',
      parrafos: ['a & b'],
      textoBoton: 'Ir',
      enlace: 'http://x/y?t=1&u=2',
      vigencia: '1 hora',
      nota: '',
    });

    expect(html).toContain('Hola &lt;b&gt;mundo&lt;/b&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('href="http://x/y?t=1&amp;u=2"');
    expect(html).not.toContain('<b>mundo</b>');
  });
});
