// src/composables/useAutenticacion.ts
//
// Estado compartido a nivel de módulo (patrón singleton reactive), consistente
// con el patrón ya establecido en el módulo de Documentos. Deliberadamente NO
// se usa Pinia (ver spec.md, decisión confirmada #3): evita sumar una
// dependencia de manejo de estado nueva sin necesidad real.

import { reactive, readonly, toRefs } from 'vue';
import authService from '@/services/auth.service';
import { establecerAccessToken, limpiarAccessToken } from '@/lib/tokenStore';
import type { PerfilUsuario } from '@/types/auth.types';

interface EstadoAutenticacion {
  usuario: PerfilUsuario | null;
  cargando: boolean;
  error: string | null;
}

const estado = reactive<EstadoAutenticacion>({
  usuario: null,
  cargando: false,
  error: null,
});

function obtenerMensajeError(error: unknown, mensajePorDefecto: string): string {
  const conRespuesta = error as { response?: { data?: { mensaje?: string } } };
  return conRespuesta?.response?.data?.mensaje ?? mensajePorDefecto;
}

// Evita que varias navegaciones simultáneas disparen varios /auth/refresh
// a la vez (cada uno rotaría el token y revocaría al anterior).
let promesaRestauracion: Promise<void> | null = null;

export function useAutenticacion() {
  async function iniciarSesion(correo: string, contrasena: string): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      const respuesta = await authService.iniciarSesion({ correo, contrasena });
      establecerAccessToken(respuesta.accessToken);
      estado.usuario = respuesta.usuario;
    } catch (error) {
      estado.error = obtenerMensajeError(error, 'No se pudo iniciar sesión');
      throw error;
    } finally {
      estado.cargando = false;
    }
  }

  function cerrarSesionLocal(): void {
    limpiarAccessToken();
    estado.usuario = null;
  }

  async function cerrarSesion(): Promise<void> {
    try {
      await authService.cerrarSesion();
    } finally {
      cerrarSesionLocal();
    }
  }

  async function cargarPerfil(): Promise<void> {
    estado.usuario = await authService.obtenerPerfil();
  }

  /**
   * Reconstruye la sesión al abrir o recargar la aplicación (RF-17).
   *
   * El access token vive únicamente en memoria (ver tokenStore.ts), así que
   * un F5 lo pierde. Lo que sí sobrevive es la cookie httpOnly del refresh
   * token, y con ella se puede pedir un access token nuevo sin volver a
   * escribir las credenciales. Si no hay cookie válida, simplemente se
   * queda sin sesión: no es un error, es un visitante anónimo.
   */
  async function restaurarSesion(): Promise<void> {
    if (estado.usuario) return;

    if (!promesaRestauracion) {
      promesaRestauracion = (async () => {
        try {
          const { accessToken } = await authService.renovarToken();
          establecerAccessToken(accessToken);
          estado.usuario = await authService.obtenerPerfil();
        } catch {
          limpiarAccessToken();
          estado.usuario = null;
        }
      })();
    }

    const enCurso = promesaRestauracion;
    try {
      await enCurso;
    } finally {
      if (promesaRestauracion === enCurso) {
        promesaRestauracion = null;
      }
    }
  }

  function tienePermiso(nombrePermiso: string): boolean {
    return estado.usuario?.permisos.includes(nombrePermiso) ?? false;
  }

  function esRol(nombreRol: string): boolean {
    return estado.usuario?.rol === nombreRol;
  }

  return {
    ...toRefs(readonly(estado)),
    iniciarSesion,
    cerrarSesion,
    cerrarSesionLocal,
    cargarPerfil,
    restaurarSesion,
    tienePermiso,
    esRol,
  };
}