import clienteHttp from '@/lib/http';
import type { EstadoSistema } from '@/types/sistema.types';

export default {
  async obtenerEstado(): Promise<EstadoSistema> {
    const { data } = await clienteHttp.get<EstadoSistema>('/sistema/estado');
    return data;
  },
};
