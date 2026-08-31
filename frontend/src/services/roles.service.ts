// src/services/roles.service.ts

import clienteHttp from '@/lib/http';
import type { RolDto, PermisosPorRolDto } from '@/types/rol.types';

export default {
  async listarRoles(): Promise<RolDto[]> {
    const { data } = await clienteHttp.get<RolDto[]>('/roles');
    return data;
  },

  async obtenerPermisosPorRol(idRol: number): Promise<PermisosPorRolDto> {
    const { data } = await clienteHttp.get<PermisosPorRolDto>(`/roles/${idRol}/permisos`);
    return data;
  },

  async actualizarPermisosDeRol(idRol: number, idsPermisos: number[]): Promise<void> {
    await clienteHttp.patch(`/roles/${idRol}/permisos`, { idsPermisos });
  },
};