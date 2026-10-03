// src/correo/verificar-smtp.ts
//
// Diagnóstico de la configuración de correo saliente, ejecutable sin
// levantar la aplicación:
//
//   npm run correo:verificar
//   npm run correo:verificar -- --enviar alguien@ejemplo.com
//
// Existe porque el flujo real de recuperación de contraseña **no sirve
// para diagnosticar**: `CorreoService.enviar()` atrapa el error y la API
// responde 200 de todos modos (respuestas genéricas por diseño, para no
// permitir enumerar cuentas). Un 200 no significa que el correo salió.
// Este script, en cambio, hace `transporter.verify()` —que abre la
// conexión y autentica de verdad— y traduce el código de respuesta del
// servidor a una causa concreta y a la acción que la corrige.
//
// No se importa `CorreoService` a propósito: ese servicio depende del
// contenedor de Nest y, sobre todo, silencia los errores. Aquí se replica
// exactamente la misma construcción del transporte (ver `crearTransporte`)
// pero dejando que la falla salga a la superficie.

import * as path from 'node:path';

import * as dotenv from 'dotenv';
import * as nodemailer from 'nodemailer';

import {
  NOMBRE_INSTITUCION,
  construirCorreoInstitucional,
  construirTextoPlano,
  type ContenidoCorreoInstitucional,
} from './plantillas-correo';

// El mismo archivo que carga `ConfigModule` en `app.module.ts`
// (`envFilePath: '../.env'`), resuelto desde la raíz del backend para que
// el script funcione sin importar desde dónde se invoque npm.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

/** Hosts SMTP de Google, que imponen el formato de contraseña de aplicación. */
const HOSTS_GOOGLE = ['smtp.gmail.com', 'smtp.googlemail.com'];

/** Una contraseña de aplicación de Google son 16 letras minúsculas, sin dígitos. */
const FORMATO_CONTRASENA_APLICACION = /^[a-z]{16}$/;

interface Configuracion {
  host: string;
  puerto: number;
  usuario: string;
  contrasena: string;
  remitente: string;
}

function leerConfiguracion(): Configuracion | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  return {
    host,
    puerto: Number(process.env.SMTP_PORT ?? 587),
    usuario: process.env.SMTP_USER?.trim() ?? '',
    // Sin `trim()`: hay servidores donde los espacios son parte real de la
    // contraseña. Si sobran, el informe de abajo lo señala en vez de
    // corregirlo a escondidas.
    contrasena: process.env.SMTP_PASS ?? '',
    remitente: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || '',
  };
}

/** Describe la contraseña sin imprimirla: lo único que interesa es su forma. */
function describirContrasena(contrasena: string): string {
  if (!contrasena) return 'vacía';
  const espacios = (contrasena.match(/\s/g) ?? []).length;
  const partes = [`${contrasena.length} caracteres`];
  if (espacios > 0) partes.push(`${espacios} espacio(s)`);
  if (/^["']|["']$/.test(contrasena)) partes.push('entre comillas (probable error de copiado)');
  return partes.join(', ');
}

/**
 * Revisiones que se pueden hacer antes de tocar la red. Detectan los
 * errores de configuración que, de otro modo, llegan al servidor como un
 * genérico «usuario y contraseña no aceptados» y hacen perder tiempo
 * buscando la causa en el lugar equivocado.
 */
function revisarFormato(config: Configuracion): string[] {
  const problemas: string[] = [];

  if (!config.usuario) {
    problemas.push('SMTP_USER está vacío: el servidor no podrá autenticar.');
  }
  if (!config.contrasena) {
    problemas.push('SMTP_PASS está vacío: el servidor no podrá autenticar.');
  }
  if (/^["']|["']$/.test(config.contrasena)) {
    problemas.push(
      'SMTP_PASS empieza o termina con comillas. En un archivo .env no se entrecomillan ' +
        'los valores: las comillas viajan como parte de la contraseña.',
    );
  }

  if (HOSTS_GOOGLE.includes(config.host.toLowerCase())) {
    const sinEspacios = config.contrasena.replace(/\s/g, '');

    if (/\s/.test(config.contrasena)) {
      problemas.push(
        'SMTP_PASS contiene espacios. Google muestra la contraseña de aplicación en cuatro ' +
          'grupos de cuatro letras por legibilidad, pero debe guardarse sin espacios.',
      );
    }

    if (sinEspacios && !FORMATO_CONTRASENA_APLICACION.test(sinEspacios)) {
      problemas.push(
        `SMTP_PASS no tiene la forma de una contraseña de aplicación de Google ` +
          `(16 letras minúsculas, sin dígitos ni símbolos; aquí hay ${sinEspacios.length} ` +
          `caracteres${/[^a-z]/.test(sinEspacios) ? ' e incluye caracteres fuera de a-z' : ''}). ` +
          'Google rechaza la contraseña normal de la cuenta en SMTP desde 2022; hay que generar ' +
          'una contraseña de aplicación en https://myaccount.google.com/apppasswords ' +
          '(requiere verificación en dos pasos activa en la cuenta).',
      );
    }

    if (config.usuario && !config.usuario.toLowerCase().endsWith('@gmail.com')) {
      problemas.push(
        `SMTP_USER (${config.usuario}) no es una dirección de Gmail, pero SMTP_HOST sí lo es. ` +
          'Para una cuenta de Google Workspace el usuario debe ser la cuenta completa del dominio.',
      );
    }

    if (
      config.remitente &&
      config.usuario &&
      config.remitente.toLowerCase() !== config.usuario.toLowerCase()
    ) {
      problemas.push(
        `SMTP_FROM (${config.remitente}) no coincide con SMTP_USER (${config.usuario}). ` +
          'Gmail reescribe el remitente a la cuenta autenticada salvo que la dirección esté ' +
          'registrada como alias verificado, así que el correo no saldría con el remitente esperado.',
      );
    }
  }

  return problemas;
}

function crearTransporte(config: Configuracion): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    // Igual que en CorreoService: 465 es SMTPS (TLS desde el inicio);
    // 587 y 25 negocian STARTTLS.
    secure: config.puerto === 465,
    auth: config.usuario ? { user: config.usuario, pass: config.contrasena } : undefined,
  });
}

/**
 * Traduce la falla a la acción que la corrige. Los códigos SMTP son
 * deliberadamente ambiguos (un 535 no distingue «contraseña equivocada» de
 * «este tipo de contraseña no se acepta»), así que se explica el abanico.
 */
function explicarError(config: Configuracion, error: unknown): string[] {
  const err = error as { code?: string; responseCode?: number; response?: string; message?: string };
  const respuesta = err.response ?? err.message ?? String(error);
  const esGoogle = HOSTS_GOOGLE.includes(config.host.toLowerCase());
  const pistas: string[] = [];

  if (/5\.7\.9|534/.test(respuesta) || err.responseCode === 534) {
    // Respuesta inequívoca de Google: la cuenta tiene verificación en dos
    // pasos activa y está exigiendo una contraseña de aplicación, es decir
    // que lo configurado es la contraseña normal de la cuenta.
    pistas.push(
      'El servidor dice explícitamente que exige una contraseña de aplicación ' +
        '(«Application-specific password required»). Lo que hay en SMTP_PASS es la contraseña ' +
        'normal de la cuenta, que Gmail no acepta para SMTP.',
    );
    pistas.push(
      'La cuenta ya tiene verificación en dos pasos activa, así que la contraseña de ' +
        'aplicación se puede generar de inmediato en https://myaccount.google.com/apppasswords ' +
        `entrando con ${config.usuario || '(SMTP_USER)'}. Copiar sus 16 letras seguidas, ` +
        'sin espacios, en SMTP_PASS y volver a ejecutar este comando.',
    );
  } else if (/535/.test(respuesta) || err.responseCode === 535) {
    pistas.push('El servidor aceptó la conexión pero rechazó las credenciales.');
    if (esGoogle) {
      pistas.push(
        'En Gmail este error casi siempre significa una de tres cosas: (a) SMTP_PASS es la ' +
          'contraseña normal de la cuenta y no una contraseña de aplicación; (b) la contraseña ' +
          'de aplicación fue revocada; (c) la cuenta no tiene verificación en dos pasos, ' +
          'requisito para poder generar una.',
      );
      pistas.push(
        'Comprobación directa: entrar a https://myaccount.google.com/apppasswords con la cuenta ' +
          `${config.usuario || '(SMTP_USER)'}, generar una contraseña nueva y copiar sus 16 letras ` +
          'sin espacios en SMTP_PASS.',
      );
    }
  } else if (err.code === 'EAUTH') {
    pistas.push('Falló la autenticación; revisar SMTP_USER y SMTP_PASS.');
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    pistas.push(
      `No se pudo abrir la conexión a ${config.host}:${config.puerto}. ` +
        'Suele ser el puerto equivocado, un cortafuegos o la red bloqueando el puerto 587/465.',
    );
  } else if (err.code === 'ESOCKET' || /wrong version number/i.test(respuesta)) {
    pistas.push(
      `Error de TLS. Con el puerto ${config.puerto} se esperaba ` +
        `${config.puerto === 465 ? 'TLS directo' : 'STARTTLS'}; probablemente el puerto y el ` +
        'modo de cifrado no concuerdan (465 para SMTPS, 587 para STARTTLS).',
    );
  } else if (err.code === 'EDNS' || /ENOTFOUND/.test(respuesta)) {
    pistas.push(`El nombre ${config.host} no se resuelve. Revisar SMTP_HOST.`);
  }

  return pistas;
}

async function principal(): Promise<number> {
  const argumentos = process.argv.slice(2);
  const indiceEnvio = argumentos.indexOf('--enviar');
  const destinatarioPrueba = indiceEnvio >= 0 ? argumentos[indiceEnvio + 1] : undefined;

  console.log(`\nDiagnóstico de correo saliente — ${NOMBRE_INSTITUCION}\n`);

  const config = leerConfiguracion();

  if (!config) {
    const esProduccion = process.env.NODE_ENV === 'production';
    console.log('SMTP_HOST está vacío, así que no hay nada que verificar.');
    console.log(
      esProduccion
        ? 'Modo activo: deshabilitado (NODE_ENV=production). No se envía ningún correo.'
        : 'Modo activo: cuenta de pruebas de Ethereal. Los correos no llegan a buzones reales;\n' +
            'cada envío deja una URL de vista previa en el log del backend.',
    );
    return 0;
  }

  console.log('Configuración leída de .env:');
  console.log(`  SMTP_HOST  ${config.host}`);
  console.log(`  SMTP_PORT  ${config.puerto} (${config.puerto === 465 ? 'SMTPS' : 'STARTTLS'})`);
  console.log(`  SMTP_USER  ${config.usuario || '(vacío)'}`);
  console.log(`  SMTP_PASS  ${describirContrasena(config.contrasena)}`);
  console.log(`  SMTP_FROM  ${config.remitente || '(vacío)'}`);

  const problemas = revisarFormato(config);
  if (problemas.length > 0) {
    console.log('\nRevisión previa — problemas detectados sin tocar la red:');
    problemas.forEach((problema, indice) => console.log(`  ${indice + 1}. ${problema}`));
  } else {
    console.log('\nRevisión previa: la configuración tiene la forma esperada.');
  }

  console.log(`\nConectando a ${config.host}:${config.puerto} y autenticando...`);

  const transporte = crearTransporte(config);

  try {
    await transporte.verify();
    console.log('OK: el servidor aceptó las credenciales. El envío real debería funcionar.');
  } catch (error) {
    console.error('\nFALLO: el servidor no aceptó la conexión o las credenciales.');
    console.error(`  ${(error as Error).message}`);
    explicarError(config, error).forEach((pista) => console.error(`\n  -> ${pista}`));
    console.error(
      '\nRecordatorio: la API seguirá respondiendo 200 en recuperación de contraseña aunque ' +
        'esto falle.\nEse 200 es genérico por diseño y no confirma ningún envío.',
    );
    transporte.close();
    return 1;
  }

  if (!destinatarioPrueba) {
    console.log('\nPara enviar un correo real de prueba: npm run correo:verificar -- --enviar tu@correo.com');
    transporte.close();
    return 0;
  }

  console.log(`\nEnviando correo de prueba a ${destinatarioPrueba}...`);

  // Se usa la plantilla institucional real, no un texto cualquiera: así la
  // prueba también muestra cómo se ve el mensaje que recibirán las personas.
  const contenido: ContenidoCorreoInstitucional = {
    titulo: 'Prueba de configuración de correo',
    parrafos: [
      'Este mensaje confirma que el servidor de correo saliente del sistema de gestión documental quedó bien configurado.',
      'No requiere ninguna acción: es una prueba técnica.',
    ],
    textoBoton: 'Ir al sistema',
    enlace: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    vigencia: 'sin vencimiento (este enlace solo abre el sistema)',
    nota: 'Mensaje generado por el comando npm run correo:verificar.',
  };

  try {
    const resultado = await transporte.sendMail({
      from: { name: NOMBRE_INSTITUCION, address: config.remitente },
      to: destinatarioPrueba,
      subject: `Prueba de correo — ${NOMBRE_INSTITUCION}`,
      text: construirTextoPlano(contenido),
      html: construirCorreoInstitucional(contenido),
    });
    console.log(`OK: aceptado por el servidor (id ${resultado.messageId}).`);
    // El remitente efectivo puede no ser el pedido: Gmail lo reescribe a la
    // cuenta autenticada si SMTP_FROM no es un alias verificado.
    console.log(
      `Revisar en el buzón quién figura como remitente; se pidió ${config.remitente}. ` +
        'Si llega otro, hay que registrar la dirección como alias verificado en el proveedor.',
    );
  } catch (error) {
    console.error('\nFALLO al enviar, aunque la autenticación había funcionado.');
    console.error(`  ${(error as Error).message}`);
    explicarError(config, error).forEach((pista) => console.error(`\n  -> ${pista}`));
    transporte.close();
    return 1;
  }

  transporte.close();
  return 0;
}

void principal().then((codigo) => process.exit(codigo));
