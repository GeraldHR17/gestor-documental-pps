// src/scripts/crear-administrador.ts
//
// Crea el usuario administrador inicial en una instalación nueva.
//
// Existe porque el usuario semilla de `06-usuario-superadministrador.sql`
// lleva una contraseña conocida y publicada en el repositorio
// (`Palmares#2026`), aceptable en una máquina de desarrollo e inadmisible
// en producción. En la VM ese script no se aplica, y la primera cuenta se
// crea con este programa, con una contraseña que solo conoce quien la
// escribe.
//
// Se compila con el resto del backend (`nest build`) y se ejecuta:
//
//   node dist/scripts/crear-administrador.js
//
// Los datos llegan por variables de entorno del proceso, nunca por
// argumentos de línea de comandos: los argumentos quedan visibles en la
// lista de procesos del sistema, las variables de entorno del proceso hijo
// no. Quien lo invoca es `despliegue/crear-administrador.ps1`, que pide la
// contraseña con Read-Host -AsSecureString.
//
//   ADMIN_CORREO           obligatoria
//   ADMIN_NOMBRE           obligatoria
//   ADMIN_CONTRASENA       obligatoria
//   ADMIN_IDENTIFICACION   opcional (por defecto '000000000')
//   ADMIN_ROL              opcional (por defecto 'Superadministrador')
//
// La contraseña no se imprime nunca, ni completa ni parcial, ni en el
// camino de error.

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import { AppModule } from '../app.module';
import { Rol } from '../entidades/rol.entidad';
import { Usuario } from '../entidades/usuario.entidad';

/**
 * Rol por defecto.
 *
 * La guía de despliegue habla de «Administrador TI», pero ese rol no
 * existe en el modelo: la semilla define Superadministrador, Administrador
 * y Usuario. El equivalente funcional es Superadministrador, el único que
 * tiene `usuarios.administrar` y `bitacora.consultar`, es decir el único
 * capaz de crear las demás cuentas tras el despliegue. Se deja
 * configurable por si se decide otro.
 */
const ROL_POR_DEFECTO = 'Superadministrador';

const IDENTIFICACION_POR_DEFECTO = '000000000';

interface DatosAdministrador {
  correo: string;
  nombre: string;
  contrasena: string;
  identificacion: string;
  rol: string;
}

function leerEntorno(): DatosAdministrador {
  const faltantes: string[] = [];
  const obligatoria = (clave: string): string => {
    const valor = process.env[clave]?.trim();
    if (!valor) {
      faltantes.push(clave);
      return '';
    }
    return valor;
  };

  const correo = obligatoria('ADMIN_CORREO');
  const nombre = obligatoria('ADMIN_NOMBRE');
  // Sin trim(): una contraseña puede empezar o terminar con un espacio a
  // propósito, y recortarla produciría un hash que no corresponde a lo que
  // la persona escribió.
  const contrasena = process.env.ADMIN_CONTRASENA ?? '';
  if (!contrasena) {
    faltantes.push('ADMIN_CONTRASENA');
  }

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. ` +
        'Use despliegue/crear-administrador.ps1, que las define por usted.',
    );
  }

  return {
    correo: correo.toLowerCase(),
    nombre,
    contrasena,
    identificacion: process.env.ADMIN_IDENTIFICACION?.trim() || IDENTIFICACION_POR_DEFECTO,
    rol: process.env.ADMIN_ROL?.trim() || ROL_POR_DEFECTO,
  };
}

async function principal(): Promise<number> {
  const datos = leerEntorno();

  // Contexto sin servidor HTTP: no abre ningún puerto, solo resuelve las
  // dependencias (ConfigService, conexión a la base) tal como las resuelve
  // la aplicación, para no duplicar aquí la configuración de TypeORM ni el
  // número de rondas de bcrypt.
  const aplicacion = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const repositorioUsuarios = aplicacion.get<Repository<Usuario>>(getRepositoryToken(Usuario));
    const repositorioRoles = aplicacion.get<Repository<Rol>>(getRepositoryToken(Rol));
    const configuracion = aplicacion.get(ConfigService);

    const existente = await repositorioUsuarios.findOne({ where: { correo: datos.correo } });
    if (existente) {
      // Idempotente a propósito: volver a ejecutar el despliegue no debe
      // fallar ni, mucho menos, sobrescribir la contraseña de una cuenta
      // que ya está en uso.
      console.log(
        `Ya existe un usuario con el correo ${datos.correo} (id ${existente.idUsuario}). ` +
          'No se modifica nada.',
      );
      return 0;
    }

    const identificacionExistente = await repositorioUsuarios.findOne({
      where: { identificacion: datos.identificacion },
    });
    if (identificacionExistente) {
      throw new Error(
        `La identificación ${datos.identificacion} ya está registrada por otro usuario. ` +
          'Defina ADMIN_IDENTIFICACION con un valor distinto.',
      );
    }

    const rol = await repositorioRoles.findOne({ where: { nombre: datos.rol } });
    if (!rol) {
      const disponibles = (await repositorioRoles.find()).map((r) => r.nombre).join(', ');
      throw new Error(
        `No existe el rol '${datos.rol}'. Roles disponibles: ${disponibles || '(ninguno)'}. ` +
          'Compruebe que se aplicaron los scripts SQL de datos iniciales.',
      );
    }

    // El MISMO algoritmo y las mismas rondas que UsuariosService.crear() y
    // AutenticacionService: si aquí se usara otro, el hash resultante no
    // validaría al iniciar sesión.
    const rondas = Number(configuracion.get<string>('BCRYPT_SALT_ROUNDS') ?? 12);
    const contrasenaHash = await bcrypt.hash(datos.contrasena, rondas);

    const usuario = repositorioUsuarios.create({
      nombreCompleto: datos.nombre,
      identificacion: datos.identificacion,
      correo: datos.correo,
      contrasenaHash,
      estado: 'ACTIVO',
      idRol: rol.idRol,
      idDependencia: null,
      // Regla #8: una cuenta creada por un administrador no pasa por
      // verificación de correo. Además, hoy no existe ningún camino en la
      // aplicación que permita verificarla.
      correoVerificado: true,
    });

    const guardado = await repositorioUsuarios.save(usuario);

    console.log(
      `Administrador creado: ${guardado.correo} (id ${guardado.idUsuario}, rol ${rol.nombre}).`,
    );
    console.log('Inicie sesión con la contraseña que acaba de escribir y cámbiela si corresponde.');
    return 0;
  } finally {
    await aplicacion.close();
  }
}

void principal().then(
  (codigo) => process.exit(codigo),
  (error: unknown) => {
    // Se imprime solo el mensaje: un stack completo podría arrastrar el
    // contenido de variables de entorno en algunos errores de driver.
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
