import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { derivarOrigenPermitido } from './configuracion/origen-cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Requerido para leer la cookie httpOnly que transporta el refresh
  // token (spec.md, Sección 7).
  app.use(cookieParser());

  // Detrás de Apache (mod_proxy) la conexión que ve Express viene de
  // 127.0.0.1 y en claro, así que `req.ip` y `req.protocol` serían
  // inútiles: el primero para la limitación de tasa por IP y el segundo
  // para cualquier decisión que dependa de HTTPS. Con 'trust proxy' = 1 se
  // hace caso a X-Forwarded-For / X-Forwarded-Proto del primer proxy, que
  // es el único de la cadena. Va bajo variable de entorno porque confiar
  // en esas cabeceras sin un proxy delante permitiría falsificar la IP de
  // origen desde el cliente.
  if (process.env.CONFIAR_EN_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // `credentials: true` es obligatorio para que la cookie httpOnly viaje
  // entre el frontend (Vite, puerto 5173) y este backend. En producción,
  // con Apache sirviendo ambos en el mismo origen, CORS deja de aplicar en
  // la práctica, pero la configuración se mantiene correcta por si se
  // accede directamente al puerto del backend.
  app.enableCors({
    origin: derivarOrigenPermitido(process.env.FRONTEND_URL),
    credentials: true,
  });

  // `HOST_ESCUCHA` solo se pasa a listen() si está definida: en producción
  // vale 127.0.0.1 para que el puerto no quede expuesto en la red (el
  // único camino hacia la API es el proxy de Apache), y sin ella se
  // conserva el comportamiento por defecto de Nest, que escucha en todas
  // las interfaces y es lo que espera el desarrollo local.
  const puerto = process.env.PUERTO ?? 3000;
  const hostEscucha = process.env.HOST_ESCUCHA?.trim();

  if (hostEscucha) {
    await app.listen(puerto, hostEscucha);
  } else {
    await app.listen(puerto);
  }
}
void bootstrap();
