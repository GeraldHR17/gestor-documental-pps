// src/composables/useCategoriasItsp.ts

import { computed, reactive, toRefs } from 'vue';
import { categoriasItspService } from '@/services/catalogos.service';
import { JerarquiaCategorias } from '@/lib/categorias';
import type {
  CategoriaItspDto,
  EstadoCatalogo,
  FiltrosCatalogoDto,
  GuardarCategoriaItspDto,
} from '@/types/catalogo.types';

interface EstadoCategorias {
  /** Las filas que pide la pantalla, con sus filtros. */
  categorias: CategoriaItspDto[];
  /**
   * El catálogo entero, sin filtros. Con N niveles, preguntas como «¿tiene
   * una superior inactiva?» o «¿cuáles son sus subcategorías?» necesitan el
   * árbol completo aunque la tabla muestre solo lo que coincide con la
   * búsqueda (spec-ajustes-niveles-y-estados).
   */
  todas: CategoriaItspDto[];
  cargando: boolean;
  error: string | null;
}

export function useCategoriasItsp() {
  const estado = reactive<EstadoCategorias>({
    categorias: [],
    todas: [],
    cargando: false,
    error: null,
  });

  async function listar(filtros: FiltrosCatalogoDto = {}): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      // El backend ya devuelve la lista en orden de despliegue (cada nodo
      // seguido de su subárbol), así que la tabla sólo tiene que indentar
      // según el nivel. Sin filtros, la misma respuesta sirve de árbol.
      const conFiltros = Object.values(filtros).some((valor) => valor !== undefined && valor !== '');
      const [filas, todas] = await Promise.all([
        categoriasItspService.listar(filtros),
        conFiltros ? categoriasItspService.listar() : null,
      ]);
      estado.categorias = filas;
      estado.todas = todas ?? filas;
    } catch (error) {
      estado.error = 'No se pudo cargar el catálogo de categorías ITSP';
      throw error;
    } finally {
      estado.cargando = false;
    }
  }

  const jerarquia = computed(() => new JerarquiaCategorias(estado.todas));

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
    // Las dos listas pueden ser objetos distintos (si la tabla está
    // filtrada): se actualizan ambas para que el estado efectivo de las
    // subcategorías se recalcule al momento.
    for (const lista of [estado.categorias, estado.todas]) {
      const categoria = lista.find((fila) => fila.id === id);
      if (categoria) categoria.estado = nuevoEstado;
    }
  }

  return {
    ...toRefs(estado),
    jerarquia,
    listar,
    crear,
    actualizar,
    obtenerSiguienteCodigo,
    cambiarEstado,
  };
}
