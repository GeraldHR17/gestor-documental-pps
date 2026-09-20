// src/composables/useClasificacionDocumental.ts
//
// Catálogos que alimentan tanto los selects del formulario de documento
// como los filtros del listado: categorías ITSP (en árbol, para la
// cascada), tipos documentales, dependencias y etiquetas. Se piden sólo los
// registros ACTIVOS: un catálogo inactivo no debe poder elegirse, y el
// backend además lo rechaza.
//
// Se cargan con `allSettled` y no con `all` a propósito. Los endpoints de
// catálogos exigen 'catalogos.administrar', que un perfil de sola consulta
// no tiene; si uno falla con 403, los demás deben seguir sirviendo y la
// pantalla se limita a no ofrecer ese filtro, en vez de caerse entera.

import { computed, reactive, toRefs } from 'vue';
import { categoriasItspService, crearServicioCatalogo } from '@/services/catalogos.service';
import { CODIGO_CATEGORIA_RAIZ_EXCLUIDA } from '@/lib/documentos.config';
import type { CatalogoDto, CategoriaItspNodoArbolDto } from '@/types/catalogo.types';

const tiposDocumentosService = crearServicioCatalogo('tipos-documentos');
const dependenciasService = crearServicioCatalogo('dependencias');
const etiquetasService = crearServicioCatalogo('etiquetas');

interface EstadoClasificacion {
  arbolCategorias: CategoriaItspNodoArbolDto[];
  tiposDocumentos: CatalogoDto[];
  dependencias: CatalogoDto[];
  etiquetas: CatalogoDto[];
  cargando: boolean;
}

export function useClasificacionDocumental() {
  const estado = reactive<EstadoClasificacion>({
    arbolCategorias: [],
    tiposDocumentos: [],
    dependencias: [],
    etiquetas: [],
    cargando: false,
  });

  async function cargar(): Promise<void> {
    estado.cargando = true;
    const [arbol, tipos, dependencias, etiquetas] = await Promise.allSettled([
      categoriasItspService.obtenerArbol({ estado: 'ACTIVO' }),
      tiposDocumentosService.listar({ estado: 'ACTIVO' }),
      dependenciasService.listar({ estado: 'ACTIVO' }),
      etiquetasService.listar({ estado: 'ACTIVO' }),
    ]);

    estado.arbolCategorias = arbol.status === 'fulfilled' ? arbol.value : [];
    estado.tiposDocumentos = tipos.status === 'fulfilled' ? tipos.value : [];
    estado.dependencias = dependencias.status === 'fulfilled' ? dependencias.value : [];
    estado.etiquetas = etiquetas.status === 'fulfilled' ? etiquetas.value : [];
    estado.cargando = false;
  }

  /**
   * Raíces seleccionables en el formulario: el árbol completo menos la
   * sección informativa (ver CODIGO_CATEGORIA_RAIZ_EXCLUIDA). El listado y
   * sus filtros sí usan `arbolCategorias` sin recortar, porque puede haber
   * documentos ya clasificados ahí y deben poder encontrarse.
   */
  const raicesSeleccionables = computed(() =>
    estado.arbolCategorias.filter(
      (raiz) => raiz.codigo !== CODIGO_CATEGORIA_RAIZ_EXCLUIDA,
    ),
  );

  /** Todas las categorías del árbol aplanadas, para resolver un id a su raíz. */
  const categoriasPlanas = computed(() =>
    estado.arbolCategorias.flatMap((raiz) => [
      { nodo: raiz, idRaiz: raiz.id },
      ...raiz.hijos.map((hijo) => ({ nodo: hijo, idRaiz: raiz.id })),
    ]),
  );

  /** Dado el id guardado en el documento, devuelve el par (raíz, subsección). */
  function ubicarCategoria(idCategoria: number | null): {
    idRaiz: number | null;
    idSubseccion: number | null;
  } {
    if (idCategoria === null) return { idRaiz: null, idSubseccion: null };

    const encontrada = categoriasPlanas.value.find((fila) => fila.nodo.id === idCategoria);
    if (!encontrada) return { idRaiz: null, idSubseccion: null };

    return encontrada.idRaiz === idCategoria
      ? { idRaiz: idCategoria, idSubseccion: null }
      : { idRaiz: encontrada.idRaiz, idSubseccion: idCategoria };
  }

  function subseccionesDe(idRaiz: number | null): CategoriaItspNodoArbolDto[] {
    if (idRaiz === null) return [];
    return estado.arbolCategorias.find((raiz) => raiz.id === idRaiz)?.hijos ?? [];
  }

  return {
    ...toRefs(estado),
    raicesSeleccionables,
    categoriasPlanas,
    cargar,
    ubicarCategoria,
    subseccionesDe,
  };
}
