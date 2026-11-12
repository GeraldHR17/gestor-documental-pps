import { reactive, readonly, toRefs } from 'vue';

import sistemaService from '@/services/sistema.service';
import type { EstadoSistema } from '@/types/sistema.types';

interface EstadoConsulta {
  datos: EstadoSistema | null;
  cargando: boolean;
  error: string | null;
}

const estado = reactive<EstadoConsulta>({
  datos: null,
  cargando: false,
  error: null,
});

export function useEstadoSistema() {
  async function cargar(): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      estado.datos = await sistemaService.obtenerEstado();
    } catch {
      estado.error = 'No se pudo obtener el estado del sistema.';
    } finally {
      estado.cargando = false;
    }
  }

  return { ...toRefs(readonly(estado)), cargar };
}
