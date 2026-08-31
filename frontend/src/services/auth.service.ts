// src/services/auth.service.ts

import clienteHttp from '@/lib/http';
import type {
  CredencialesLoginDto,
  RegistroCiudadanoDto,
  ConfirmarVerificacionCorreoDto,
  ReenviarVerificacionCorreoDto,
  SolicitarRecuperacionDto,
  ConfirmarRecuperacionDto,
  RespuestaLogin,
  RespuestaRefresh,
  RespuestaMensaje,
  PerfilUsuario,
} from '@/types/auth.types';

export default {
  async iniciarSesion(credenciales: CredencialesLoginDto): Promise<RespuestaLogin> {
    const { data } = await clienteHttp.post<RespuestaLogin>('/auth/login', credenciales);
    return data;
  },

  async renovarToken(): Promise<RespuestaRefresh> {
    const { data } = await clienteHttp.post<RespuestaRefresh>('/auth/refresh');
    return data;
  },

  async cerrarSesion(): Promise<void> {
    await clienteHttp.post('/auth/logout');
  },

  async obtenerPerfil(): Promise<PerfilUsuario> {
    const { data } = await clienteHttp.get<PerfilUsuario>('/auth/perfil');
    return data;
  },

  async registrarCiudadano(datos: RegistroCiudadanoDto): Promise<void> {
    await clienteHttp.post('/auth/registro', datos);
  },

  async confirmarVerificacionCorreo(datos: ConfirmarVerificacionCorreoDto): Promise<RespuestaMensaje> {
    const { data } = await clienteHttp.post<RespuestaMensaje>('/auth/verificar-correo', datos);
    return data;
  },

  async reenviarVerificacionCorreo(datos: ReenviarVerificacionCorreoDto): Promise<RespuestaMensaje> {
    const { data } = await clienteHttp.post<RespuestaMensaje>('/auth/verificar-correo/reenviar', datos);
    return data;
  },

  async solicitarRecuperacion(datos: SolicitarRecuperacionDto): Promise<RespuestaMensaje> {
    const { data } = await clienteHttp.post<RespuestaMensaje>('/auth/recuperar-contrasena/solicitar', datos);
    return data;
  },

  async confirmarRecuperacion(datos: ConfirmarRecuperacionDto): Promise<RespuestaMensaje> {
    const { data } = await clienteHttp.post<RespuestaMensaje>('/auth/recuperar-contrasena/confirmar', datos);
    return data;
  },
};