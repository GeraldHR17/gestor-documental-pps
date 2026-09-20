// src/composables/useUsuarios.ts

import { reactive, toRefs } from 'vue';
import usuariosService from '@/services/usuarios.service';
import type {
  UsuarioResumenDto,
  FiltrosUsuariosDto,
  CrearUsuarioDto,
  ActualizarUsuarioDto,
  EstadoUsuario,
} from '@/types/usuario.types';

interface EstadoUsuarios {
  usuarios: UsuarioResumenDto[];
  total: number;
  pagina: number;
  limite: number;
  cargando: boolean;
  error: string | null;
}

export function useUsuarios() {
  const estado = reactive<EstadoUsuarios>({
    usuarios: [],
    total: 0,
    pagina: 1,
    limite: 10,
    cargando: false,
    error: null,
  });

  async function listar(filtros: Partial<FiltrosUsuariosDto> = {}): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      const respuesta = await usuariosService.listar({
        pagina: filtros.pagina ?? estado.pagina,
        limite: filtros.limite ?? estado.limite,
        nombre: filtros.nombre,
        idRol: filtros.idRol,
        estado: filtros.estado,
      });
      estado.usuarios = respuesta.datos;
      estado.total = respuesta.total;
      estado.pagina = respuesta.pagina;
      estado.limite = respuesta.limite;
    } catch (error) {
      estado.error = 'No se pudo cargar el listado de usuarios';
      throw error;
    } finally {
      estado.cargando = false;
    }
  }

  async function crear(datos: CrearUsuarioDto): Promise<void> {
    await usuariosService.crear(datos);
    await listar({ pagina: 1 });
  }

  async function actualizar(idUsuario: number, datos: ActualizarUsuarioDto): Promise<void> {
    await usuariosService.actualizar(idUsuario, datos);
    await listar({ pagina: estado.pagina });
  }

  async function asignarRol(idUsuario: number, idRol: number): Promise<void> {
    await usuariosService.asignarRol(idUsuario, idRol);
    await listar({ pagina: estado.pagina });
  }

  async function cambiarEstado(idUsuario: number, nuevoEstado: EstadoUsuario): Promise<void> {
    await usuariosService.cambiarEstado(idUsuario, nuevoEstado);
    const usuarioEnLista = estado.usuarios.find((u) => u.idUsuario === idUsuario);
    if (usuarioEnLista) usuarioEnLista.estado = nuevoEstado;
  }

  return { ...toRefs(estado), listar, crear, actualizar, asignarRol, cambiarEstado };
}