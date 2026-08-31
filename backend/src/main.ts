import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Requerido para leer la cookie httpOnly que transporta el refresh
  // token (spec.md, Sección 7).
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // `credentials: true` es obligatorio para que la cookie httpOnly viaje
  // entre el frontend (Vite, puerto 5173) y este backend.
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(process.env.PUERTO ?? 3000);
}
bootstrap();
