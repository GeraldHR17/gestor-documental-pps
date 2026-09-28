// src/reportes/reportes.controller.ts
//
// MF-08 — Indicadores de gestión documental. Sólo lectura y agregados: no
// exponen documentos individuales, por eso basta un permiso propio a nivel
// de controlador en vez de filtrar por visibilidad como hace
// DocumentosService.
//
// Los listados que acompañan a estos indicadores en la pantalla de Inicio
// (documentos recientes, cola de pendientes) NO viven aquí: reutilizan
// `GET /documentos` con sus filtros y orden ya existentes.

import { Controller, Get } from '@nestjs/common';

import { RequierePermisos } from '../comun/decoradores/requiere-permisos.decorator';
import { ReportesService } from './reportes.service';

@Controller('reportes')
@RequierePermisos('reportes.consultar')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('resumen')
  obtenerResumen() {
    return this.reportesService.obtenerResumen();
  }

  @Get('por-categoria')
  obtenerPorCategoria() {
    return this.reportesService.obtenerPorCategoria();
  }

  @Get('por-dependencia')
  obtenerPorDependencia() {
    return this.reportesService.obtenerPorDependencia();
  }
}
