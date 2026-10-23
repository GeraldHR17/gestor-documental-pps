// src/composables/useCategoriasItsp.ts

import { computed, reactive, toRefs } from 'vue';
import { categoriasItspService } from '@/services/catalogos.service';
import type {
  CategoriaItspDto,
  EstadoCatalogo,
  FiltrosCatalogoDto,
  GuardarCategoriaItspDto,
} from '@/types/catalogo.types';

interface EstadoCategorias {
  categorias: CategoriaItspDto[];
  cargando: boolean;
  error: string | null;
}

export function useCategoriasItsp() {
  const estado = reactive<EstadoCategorias>({
    categorias: [],
    cargando: false,
    error: null,
  });

  async function listar(filtros: FiltrosCatalogoDto = {}): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      // El backend ya devuelve la lista en orden de despliegue (cada raíz
      // seguida de sus subsecciones), así que la tabla sólo tiene que
      // indentar según el nivel.
      estado.categorias = await categoriasItspService.listar(filtros);
    } catch (error) {
      estado.error = 'No se pudo cargar el catálogo de categorías ITSP';
      throw error;
    } finally {
      estado.cargando = false;
    }
  }

  /** Sólo las raíces pueden ser categoría padre: la jerarquía es de dos niveles. */
  const categoriasRaiz = computed(() =>
    estado.categorias.filter((categoria) => categoria.idCategoriaPadre === null),
  );

  // Devuelven la categoría guardada porque el código lo asigna el backend:
  // el formulario lo necesita para decir cuál quedó.
  async function crear(datos: GuardarCategoriaItspDto): Promise<CategoriaItspDto> {
    return categoriasItspService.crear(datos);
  }

  async function actualizar(id: number, datos: GuardarCategoriaItspDto): Promise<CategoriaItspDto> {
    return categoriasItspService.actualizar(id, datos);
  }

  async function obtenerSiguienteCodigo(idCategoriaPadre: number | null): Promise<string> {
    return categoriasItspService.obtenerSiguienteCodigo(idCategoriaPadre);
  }

  async function cambiarEstado(id: number, nuevoEstado: EstadoCatalogo): Promise<void> {
    await categoriasItspService.cambiarEstado(id, nuevoEstado);
    const categoria = estado.categorias.find((fila) => fila.id === id);
    if (categoria) categoria.estado = nuevoEstado;
  }

  return {
    ...toRefs(estado),
    categoriasRaiz,
    listar,
    crear,
    actualizar,
    obtenerSiguienteCodigo,
    cambiarEstado,
  };
}
