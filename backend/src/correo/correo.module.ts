// src/correo/correo.module.ts

import { Module } from '@nestjs/common';
import { CorreoService } from './correo.service';

@Module({
  providers: [CorreoService],
  exports: [CorreoService],
})
export class CorreoModule {}