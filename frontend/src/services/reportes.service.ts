// src/services/reportes.service.ts
//
// Indicadores que alimentan la pantalla de Inicio (MF-08). Sólo los
// agregados: los listados que la acompañan (documentos recientes y cola de
// pendientes) salen de `documentos.service`, reutilizando los filtros que
// ya existen desde Fase 6.

import clienteHttp from '@/lib/http';
import type { ConteoPorGrupoDto, ResumenReportesDto } from '@/types/reporte.types';

export default {
  async obtenerResumen(): Promise<ResumenReportesDto> {
    const { data } = await clienteHttp.get<ResumenReportesDto>('/reportes/resumen');
    return data;
  },

  async obtenerPorCategoria(): Promise<ConteoPorGrupoDto[]> {
    const { data } = await clienteHttp.get<ConteoPorGrupoDto[]>('/reportes/por-categoria');
    return data;
  },

  async obtenerPorDependencia(): Promise<ConteoPorGrupoDto[]> {
    const { data } = await clienteHttp.get<ConteoPorGrupoDto[]>('/reportes/por-dependencia');
    return data;
  },
};
