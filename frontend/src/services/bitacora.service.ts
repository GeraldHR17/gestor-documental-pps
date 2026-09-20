// src/services/bitacora.service.ts
//
// Consulta de la bitácora de auditoría (sólo lectura). El par
// entidad + idRegistro es el que usa el panel "Cambios recientes" del
// formulario de usuario; la pantalla de bitácora usa el resto de filtros.

import clienteHttp from '@/lib/http';
import type { FiltrosBitacoraDto, ListaPaginadaBitacora } from '@/types/bitacora.types';

export default {
  async consultar(filtros: FiltrosBitacoraDto = {}): Promise<ListaPaginadaBitacora> {
    const { data } = await clienteHttp.get<ListaPaginadaBitacora>('/bitacora', { params: filtros });
    return data;
  },
};
