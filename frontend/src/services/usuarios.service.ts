// src/services/usuarios.service.ts

import clienteHttp from '@/lib/http';
import type {
  UsuarioResumenDto,
  CrearUsuarioDto,
  ActualizarUsuarioDto,
  FiltrosUsuariosDto,
  ListaPaginadaUsuariosDto,
  EstadoUsuario,
} from '@/types/usuario.types';

export default {
  async listar(filtros: Partial<FiltrosUsuariosDto>): Promise<ListaPaginadaUsuariosDto> {
    const { data } = await clienteHttp.get<ListaPaginadaUsuariosDto>('/usuarios', { params: filtros });
    return data;
  },

  async obtener(idUsuario: number): Promise<UsuarioResumenDto> {
    const { data } = await clienteHttp.get<UsuarioResumenDto>(`/usuarios/${idUsuario}`);
    return data;
  },

  async crear(datos: CrearUsuarioDto): Promise<UsuarioResumenDto> {
    const { data } = await clienteHttp.post<UsuarioResumenDto>('/usuarios', datos);
    return data;
  },

  async actualizar(idUsuario: number, datos: ActualizarUsuarioDto): Promise<UsuarioResumenDto> {
    const { data } = await clienteHttp.patch<UsuarioResumenDto>(`/usuarios/${idUsuario}`, datos);
    return data;
  },

  async cambiarEstado(idUsuario: number, estado: EstadoUsuario): Promise<void> {
    await clienteHttp.patch(`/usuarios/${idUsuario}/estado`, { estado });
  },

  async asignarRol(idUsuario: number, idRol: number): Promise<void> {
    await clienteHttp.patch(`/usuarios/${idUsuario}/rol`, { idRol });
  },
};