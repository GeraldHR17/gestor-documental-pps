// src/composables/useRolesPermisos.ts
//
// Agrupa el catálogo REAL de 9 permisos (02-datos-iniciales.sql) por módulo,
// usando el prefijo antes del punto en el nombre del permiso
// (ej. 'documentos.crear' -> módulo 'documentos'). El mockup "Roles y
// Permisos" solo se usó como referencia del patrón de interfaz (matriz por
// módulo con checkboxes) — el contenido viene siempre del backend.

import { reactive, toRefs, computed } from 'vue';
import rolesService from '@/services/roles.service';
import type { RolDto, PermisoDeRolDto } from '@/types/rol.types';

interface ModuloDePermisos {
  clave: string;
  etiqueta: string;
  permisos: PermisoDeRolDto[];
}

const ETIQUETAS_MODULO: Record<string, string> = {
  documentos: 'Documentos',
  versiones: 'Versiones de documentos',
  catalogos: 'Catálogos',
  usuarios: 'Usuarios',
  bitacora: 'Bitácora (auditoría)',
};

function agruparPorModulo(permisos: PermisoDeRolDto[]): ModuloDePermisos[] {
  const grupos = new Map<string, PermisoDeRolDto[]>();
  for (const permiso of permisos) {
    // Un permiso siempre tiene la forma 'modulo.accion', pero si alguno
    // llegara sin punto se agrupa bajo su propio nombre en vez de fallar.
    const clave = permiso.nombre.split('.')[0] ?? permiso.nombre;
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.push(permiso);
    } else {
      grupos.set(clave, [permiso]);
    }
  }
  return Array.from(grupos.entries()).map(([clave, permisosDelModulo]) => ({
    clave,
    etiqueta: ETIQUETAS_MODULO[clave] ?? clave,
    permisos: permisosDelModulo,
  }));
}

interface EstadoRolesPermisos {
  roles: RolDto[];
  idRolSeleccionado: number | null;
  permisos: PermisoDeRolDto[];
  cargando: boolean;
  guardando: boolean;
  error: string | null;
}

export function useRolesPermisos() {
  const estado = reactive<EstadoRolesPermisos>({
    roles: [],
    idRolSeleccionado: null,
    permisos: [],
    cargando: false,
    guardando: false,
    error: null,
  });

  const modulos = computed<ModuloDePermisos[]>(() => agruparPorModulo(estado.permisos));

  async function cargarRoles(): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      estado.roles = await rolesService.listarRoles();
    } catch {
      estado.error = 'No se pudo cargar el catálogo de roles';
    } finally {
      estado.cargando = false;
    }
  }

  async function seleccionarRol(idRol: number): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      const respuesta = await rolesService.obtenerPermisosPorRol(idRol);
      estado.idRolSeleccionado = respuesta.idRol;
      estado.permisos = respuesta.permisos;
    } catch {
      estado.error = 'No se pudo cargar la matriz de permisos de este rol';
    } finally {
      estado.cargando = false;
    }
  }

  function alternarPermiso(idPermiso: number): void {
    const permiso = estado.permisos.find((p) => p.idPermiso === idPermiso);
    if (permiso) permiso.asignado = !permiso.asignado;
  }

  async function guardarCambios(): Promise<void> {
    if (estado.idRolSeleccionado === null) return;
    estado.guardando = true;
    estado.error = null;
    try {
      const idsAsignados = estado.permisos.filter((p) => p.asignado).map((p) => p.idPermiso);
      await rolesService.actualizarPermisosDeRol(estado.idRolSeleccionado, idsAsignados);
    } catch (error) {
      estado.error = 'No se pudieron guardar los cambios de permisos';
      throw error;
    } finally {
      estado.guardando = false;
    }
  }

  return {
    ...toRefs(estado),
    modulos,
    cargarRoles,
    seleccionarRol,
    alternarPermiso,
    guardarCambios,
  };
}