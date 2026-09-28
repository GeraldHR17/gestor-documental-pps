// src/reportes/reportes.module.ts
//
// MF-08 — Indicadores embebidos en la pantalla de Inicio. Sólo registra
// los repositorios que consulta: no aporta entidades nuevas.

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Documento } from '../entidades/documento.entidad';
import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { Dependencia } from '../entidades/dependencia.entidad';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';

import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Documento, CategoriaItsp, Dependencia, BitacoraLog])],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
