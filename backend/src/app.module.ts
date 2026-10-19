import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import baseDatosConfiguracion from './configuracion/base-datos.configuracion';

import { Rol } from './entidades/rol.entidad';
import { Permiso } from './entidades/permiso.entidad';
import { Usuario } from './entidades/usuario.entidad';
import { CategoriaItsp } from './entidades/categoria-itsp.entidad';
import { TipoDocumento } from './entidades/tipo-documento.entidad';
import { Dependencia } from './entidades/dependencia.entidad';
import { Etiqueta } from './entidades/etiqueta.entidad';
import { Documento } from './entidades/documento.entidad';
import { VersionDocumento } from './entidades/version-documento.entidad';
import { DocumentoEtiqueta } from './entidades/documento-etiqueta.entidad';
import { BitacoraLog } from './entidades/bitacora-log.entidad';
import { SesionRefreshToken } from './entidades/sesion-refresh-token.entidad';
import { TokenRecuperacionContrasena } from './entidades/token-recuperacion-contrasena.entidad';
import { TokenVerificacionCorreo } from './entidades/token-verificacion-correo.entidad';

import { ComunModule } from './comun/comun.module';
import { AutenticacionModule } from './autenticacion/autenticacion.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { RolesModule } from './roles/roles.module';
import { CorreoModule } from './correo/correo.module';
import { BitacoraModule } from './bitacora/bitacora.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { DocumentosModule } from './documentos/documentos.module';
import { ReportesModule } from './reportes/reportes.module';
import { SaludModule } from './salud/salud.module';
import { PublicoModule } from './publico/publico.module';

import { JwtAuthGuard } from './comun/guards/jwt-auth.guard';
import { PermisosGuard } from './comun/guards/permisos.guard';
import { ExcepcionGlobalFilter } from './comun/filtros/excepcion-global.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
      load: [baseDatosConfiguracion],
    }),

    // Rate limiting general de la API (Sección 12). Los endpoints
    // sensibles de autenticación aplican además un @Throttle() propio,
    // mucho más estricto, declarado en AutenticacionController.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // Tareas programadas del servidor. Hoy la única es la retención de la
    // bitácora (BitacoraLimpiezaService); forRoot() va aquí porque debe
    // registrarse una sola vez para toda la aplicación.
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configuracion: ConfigService) => ({
        type: 'mysql',
        host: configuracion.get<string>('baseDatos.host'),
        port: configuracion.get<number>('baseDatos.puerto'),
        username: configuracion.get<string>('baseDatos.usuario'),
        password: configuracion.get<string>('baseDatos.contrasena'),
        database: configuracion.get<string>('baseDatos.nombre'),

        entities: [
          Rol,
          Permiso,
          Usuario,
          CategoriaItsp,
          TipoDocumento,
          Dependencia,
          Etiqueta,
          Documento,
          VersionDocumento,
          DocumentoEtiqueta,
          BitacoraLog,
          SesionRefreshToken,
          TokenRecuperacionContrasena,
          TokenVerificacionCorreo,
        ],

        // El esquema lo gobiernan los scripts de base-datos/scripts/init;
        // TypeORM nunca lo altera por su cuenta.
        synchronize: false,

        // En desarrollo conviene ver cada consulta; en producción no: el
        // volcado de SQL llena el log del servicio, cuesta rendimiento y
        // además deja valores de negocio escritos en disco sin control de
        // retención.
        logging: configuracion.get<string>('NODE_ENV') !== 'production',
      }),
    }),

    ComunModule,
    AutenticacionModule,
    UsuariosModule,
    RolesModule,
    CorreoModule,
    BitacoraModule,
    CatalogosModule,
    DocumentosModule,
    ReportesModule,
    SaludModule,

    // Portal publico de transparencia: la unica superficie del sistema
    // abierta a Internet. Va al final para que se lea como lo que es, una
    // capa de solo lectura montada sobre los modulos anteriores.
    PublicoModule,
  ],
  providers: [
    // ORDEN IMPORTANTE: NestJS ejecuta los guards globales en el orden en
    // que se registran aquí.
    //   1. ThrottlerGuard  — corta el exceso de peticiones antes de gastar
    //      trabajo en validar tokens o consultar la base de datos.
    //   2. JwtAuthGuard    — autenticación: resuelve `request.user`.
    //   3. PermisosGuard   — autorización: consume `request.user`, por lo
    //      que debe ir necesariamente después de JwtAuthGuard.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermisosGuard },
    { provide: APP_FILTER, useClass: ExcepcionGlobalFilter },
  ],
})
export class AppModule {}
