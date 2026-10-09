// src/salud/salud.module.ts
import { Module } from '@nestjs/common';

import { SaludController } from './salud.controller';
import { SaludService } from './salud.service';

@Module({
  // Sin TypeOrmModule.forFeature: SaludService no usa repositorios, solo
  // el DataSource que TypeOrmModule.forRootAsync ya publica globalmente.
  controllers: [SaludController],
  providers: [SaludService],
})
export class SaludModule {}
