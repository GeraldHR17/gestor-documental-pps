// src/lib/bitacora.config.ts
//
// Tipos de entidad que audita la bitácora y cómo buscar por NOMBRE un
// registro de cada uno. Los valores de `valor` son exactamente los que
// escriben los servicios en `bitacora_logs.entidad`; la etiqueta es lo
// que ve la persona. El identificador se resuelve internamente y nunca se
// muestra: decisión confirmada con el PO (no se exponen IDs en la UI).
//
// Nota: la búsqueda muestra el nombre ACTUAL del registro; si cambió de
// nombre después de la acción auditada, no se ve el histórico.

import usuariosService from '@/services/usuarios.service';
import documentosService from '@/services/documentos.service';
import rolesService from '@/services/roles.service';
import { categoriasItspService, crearServicioCatalogo } from '@/services/catalogos.service';
import type { OpcionBusqueda } from '@/components/SelectorBusqueda.vue';

export interface EntidadBitacora {
  /** Valor guardado en `bitacora_logs.entidad`. */
  valor: string;
  etiqueta: string;
  buscar: (texto: string) => Promise<OpcionBusqueda[]>;
  /** Nombre de un registro concreto, para preseleccionar desde la URL. */
  resolverEtiqueta: (id: number) => Promise<string | null>;
}

const LIMITE_SUGERENCIAS = 10;

function contiene(texto: string, termino: string): boolean {
  return texto.toLowerCase().includes(termino.toLowerCase());
}

function catalogoSimple(recurso: 'tipos-documentos' | 'dependencias' | 'etiquetas') {
  const servicio = crearServicioCatalogo(recurso);
  return {
    async buscar(texto: string): Promise<OpcionBusqueda[]> {
      const filas = await servicio.listar({ nombre: texto || undefined });
      return filas.slice(0, LIMITE_SUGERENCIAS).map((fila) => ({ id: fila.id, etiqueta: fila.nombre }));
    },
    async resolverEtiqueta(id: number): Promise<string | null> {
      try {
        return (await servicio.obtener(id)).nombre;
      } catch {
        return null;
      }
    },
  };
}

export const ENTIDADES_BITACORA: EntidadBitacora[] = [
  {
    valor: 'usuarios',
    etiqueta: 'Usuario',
    async buscar(texto) {
      const respuesta = await usuariosService.listar({ nombre: texto || undefined, limite: LIMITE_SUGERENCIAS });
      return respuesta.datos.map((usuario) => ({
        id: usuario.idUsuario,
        etiqueta: usuario.nombreCompleto,
        detalle: usuario.correo,
      }));
    },
    async resolverEtiqueta(id) {
      try {
        return (await usuariosService.obtener(id)).nombreCompleto;
      } catch {
        return null;
      }
    },
  },
  {
    valor: 'documentos',
    etiqueta: 'Documento',
    async buscar(texto) {
      const respuesta = await documentosService.listar({ texto: texto || undefined, limite: LIMITE_SUGERENCIAS });
      return respuesta.datos.map((documento) => ({
        id: documento.id,
        etiqueta: documento.titulo,
        detalle: `${documento.nombreTipoDocumento} · ${documento.anio}`,
      }));
    },
    async resolverEtiqueta(id) {
      try {
        return (await documentosService.obtener(id)).titulo;
      } catch {
        return null;
      }
    },
  },
  {
    valor: 'categorias_itsp',
    etiqueta: 'Categoría ITSP',
    async buscar(texto) {
      const filas = await categoriasItspService.listar({ nombre: texto || undefined });
      return filas.slice(0, LIMITE_SUGERENCIAS).map((fila) => ({
        id: fila.id,
        etiqueta: fila.nombre,
        detalle: fila.nombreCategoriaPadre ?? 'Categoría raíz',
      }));
    },
    async resolverEtiqueta(id) {
      try {
        return (await categoriasItspService.obtener(id)).nombre;
      } catch {
        return null;
      }
    },
  },
  { valor: 'tipos_documentos', etiqueta: 'Tipo de documento', ...catalogoSimple('tipos-documentos') },
  { valor: 'dependencias', etiqueta: 'Dependencia', ...catalogoSimple('dependencias') },
  { valor: 'etiquetas', etiqueta: 'Etiqueta', ...catalogoSimple('etiquetas') },
  {
    // Los cambios de permisos se auditan sobre la entidad 'roles_permisos'
    // con el id del rol como registro afectado.
    valor: 'roles_permisos',
    etiqueta: 'Rol',
    async buscar(texto) {
      const roles = await rolesService.listarRoles();
      return roles
        .filter((rol) => !texto || contiene(rol.nombre, texto))
        .map((rol) => ({ id: rol.idRol, etiqueta: rol.nombre, detalle: rol.descripcion ?? undefined }));
    },
    async resolverEtiqueta(id) {
      const roles = await rolesService.listarRoles();
      return roles.find((rol) => rol.idRol === id)?.nombre ?? null;
    },
  },
];

export function obtenerEntidadBitacora(valor: string): EntidadBitacora | undefined {
  return ENTIDADES_BITACORA.find((entidad) => entidad.valor === valor);
}

/** Búsqueda de quien ejecutó la acción: siempre una cuenta de usuario. */
export const BUSCADOR_USUARIOS = ENTIDADES_BITACORA[0] as EntidadBitacora;
