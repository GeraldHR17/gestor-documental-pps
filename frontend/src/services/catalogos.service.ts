// src/services/catalogos.service.ts
//
// Los tres catálogos planos exponen la misma API cambiando sólo el segmento
// de la ruta, así que en vez de escribir tres servicios idénticos se
// construyen desde una fábrica. Las categorías ITSP van aparte: tienen el
// endpoint de árbol y campos propios.

import clienteHttp from '@/lib/http';
import type {
  CatalogoDto,
  CategoriaItspDto,
  CategoriaItspNodoArbolDto,
  EstadoCatalogo,
  FiltrosCatalogoDto,
  GuardarCatalogoDto,
  GuardarCategoriaItspDto,
} from '@/types/catalogo.types';

export interface ServicioCatalogo {
  listar(filtros?: FiltrosCatalogoDto): Promise<CatalogoDto[]>;
  obtener(id: number): Promise<CatalogoDto>;
  crear(datos: GuardarCatalogoDto): Promise<CatalogoDto>;
  actualizar(id: number, datos: GuardarCatalogoDto): Promise<CatalogoDto>;
  cambiarEstado(id: number, estado: EstadoCatalogo): Promise<void>;
}

/** @param recurso Segmento de la API, ej. 'tipos-documentos'. */
export function crearServicioCatalogo(recurso: string): ServicioCatalogo {
  const base = `/${recurso}`;

  return {
    async listar(filtros: FiltrosCatalogoDto = {}) {
      const { data } = await clienteHttp.get<CatalogoDto[]>(base, { params: filtros });
      return data;
    },

    async obtener(id: number) {
      const { data } = await clienteHttp.get<CatalogoDto>(`${base}/${id}`);
      return data;
    },

    async crear(datos: GuardarCatalogoDto) {
      const { data } = await clienteHttp.post<CatalogoDto>(base, datos);
      return data;
    },

    async actualizar(id: number, datos: GuardarCatalogoDto) {
      const { data } = await clienteHttp.patch<CatalogoDto>(`${base}/${id}`, datos);
      return data;
    },

    async cambiarEstado(id: number, estado: EstadoCatalogo) {
      await clienteHttp.patch(`${base}/${id}/estado`, { estado });
    },
  };
}

export const categoriasItspService = {
  async listar(filtros: FiltrosCatalogoDto = {}): Promise<CategoriaItspDto[]> {
    const { data } = await clienteHttp.get<CategoriaItspDto[]>('/categorias-itsp', {
      params: filtros,
    });
    return data;
  },

  /**
   * Jerarquía ya agrupada por raíz. Es la que consumirán los selects en
   * cascada del formulario de documentos (Fase 6); aquí se usa para llenar
   * el desplegable de "categoría padre" con sólo las raíces.
   */
  async obtenerArbol(filtros: FiltrosCatalogoDto = {}): Promise<CategoriaItspNodoArbolDto[]> {
    const { data } = await clienteHttp.get<CategoriaItspNodoArbolDto[]>('/categorias-itsp/arbol', {
      params: filtros,
    });
    return data;
  },

  async obtener(id: number): Promise<CategoriaItspDto> {
    const { data } = await clienteHttp.get<CategoriaItspDto>(`/categorias-itsp/${id}`);
    return data;
  },

  async crear(datos: GuardarCategoriaItspDto): Promise<CategoriaItspDto> {
    const { data } = await clienteHttp.post<CategoriaItspDto>('/categorias-itsp', datos);
    return data;
  },

  async actualizar(id: number, datos: GuardarCategoriaItspDto): Promise<CategoriaItspDto> {
    const { data } = await clienteHttp.patch<CategoriaItspDto>(`/categorias-itsp/${id}`, datos);
    return data;
  },

  async cambiarEstado(id: number, estado: EstadoCatalogo): Promise<void> {
    await clienteHttp.patch(`/categorias-itsp/${id}/estado`, { estado });
  },
};
