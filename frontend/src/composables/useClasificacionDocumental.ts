// src/composables/useClasificacionDocumental.ts
//
// Catálogos que alimentan tanto el formulario de documento como los
// filtros del listado: categorías ITSP, tipos documentales, dependencias y
// etiquetas. De tipos, dependencias y etiquetas se piden sólo los
// registros ACTIVOS: un catálogo inactivo no debe poder elegirse, y el
// backend además lo rechaza.
//
// Las categorías se piden COMPLETAS (spec-ajustes-niveles-y-estados): con
// hasta 10 niveles, la categoría se elige en un solo selector con la ruta
// completa, y las que no admiten documentos se muestran deshabilitadas con
// el motivo en vez de desaparecer, para que nadie busque en vano una que
// sabe que existe.
//
// Se cargan con `allSettled` y no con `all` a propósito. Los endpoints de
// catálogos exigen 'catalogos.administrar', que un perfil de sola consulta
// no tiene; si uno falla con 403, los demás deben seguir sirviendo y la
// pantalla se limita a no ofrecer ese filtro, en vez de caerse entera.

import { computed, reactive, toRefs } from 'vue';
import { categoriasItspService, crearServicioCatalogo } from '@/services/catalogos.service';
import {
  JerarquiaCategorias,
  aplanarArbol,
  normalizarParaBuscar,
  type CategoriaEnJerarquia,
} from '@/lib/categorias';
import type { OpcionBusqueda } from '@/components/SelectorBusqueda.vue';
import type { CatalogoDto, CategoriaItspNodoArbolDto } from '@/types/catalogo.types';

const tiposDocumentosService = crearServicioCatalogo('tipos-documentos');
const dependenciasService = crearServicioCatalogo('dependencias');
const etiquetasService = crearServicioCatalogo('etiquetas');

/** Por qué una categoría no se puede elegir para un documento. */
export const MOTIVOS_NO_CLASIFICABLE = {
  excluida: 'Participación ciudadana no admite documentos',
  inactiva: 'la categoría está inactiva',
  superiorInactiva: 'una categoría superior está inactiva',
  conSubcategorias: 'tiene subcategorías; elija una de ellas',
} as const;

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
      categoriasItspService.obtenerArbol(),
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

  const jerarquia = computed(
    () => new JerarquiaCategorias<CategoriaEnJerarquia>(aplanarArbol(estado.arbolCategorias)),
  );

  /**
   * Motivo por el que no se puede clasificar en esa categoría, o `null` si
   * se puede. Mismas reglas que el backend, más la de las raíces: una raíz
   * con subcategorías no se elige directamente (spec D-4, la regla de hoy).
   */
  function motivoNoClasificable(id: number): string | null {
    const j = jerarquia.value;
    const nodo = j.obtener(id);
    if (!nodo) return null;
    if (j.enSubarbolExcluido(id)) return MOTIVOS_NO_CLASIFICABLE.excluida;
    if (nodo.estado !== 'ACTIVO') return MOTIVOS_NO_CLASIFICABLE.inactiva;
    if (!j.efectivamenteActiva(id)) return MOTIVOS_NO_CLASIFICABLE.superiorInactiva;
    if (nodo.idCategoriaPadre === null && j.tieneHijos(id)) {
      return MOTIVOS_NO_CLASIFICABLE.conSubcategorias;
    }
    return null;
  }

  /**
   * Opciones del formulario de documento, en orden de despliegue y con la
   * ruta completa. Las inactivas por sí mismas no se ofrecen (un catálogo
   * inactivo no se elige); las demás que no admiten documentos se ven
   * deshabilitadas con su motivo (ajuste 4).
   */
  const opcionesClasificacion = computed<OpcionBusqueda[]>(() =>
    jerarquia.value
      .ordenDeDespliegue()
      .filter((categoria) => categoria.estado === 'ACTIVO')
      .map((categoria) => {
        const motivo = motivoNoClasificable(categoria.id);
        return {
          id: categoria.id,
          etiqueta: jerarquia.value.rutaComoTexto(categoria.id),
          detalle: categoria.codigo,
          ...(motivo ? { deshabilitada: true, motivo } : {}),
        };
      }),
  );

  /**
   * Opciones del filtro del listado: todas, también las inactivas, porque
   * puede haber documentos ya clasificados ahí y deben poder encontrarse.
   */
  const opcionesFiltro = computed<OpcionBusqueda[]>(() =>
    jerarquia.value.ordenDeDespliegue().map((categoria) => ({
      id: categoria.id,
      etiqueta: jerarquia.value.rutaComoTexto(categoria.id),
      detalle:
        categoria.estado === 'ACTIVO' ? categoria.codigo : `${categoria.codigo} · inactiva`,
    })),
  );

  /** Búsqueda local para SelectorBusqueda: por ruta o por código, sin tildes. */
  function buscarEn(opciones: OpcionBusqueda[], texto: string): OpcionBusqueda[] {
    const termino = normalizarParaBuscar(texto);
    if (!termino) return opciones;
    return opciones.filter(
      (opcion) =>
        normalizarParaBuscar(opcion.etiqueta).includes(termino) ||
        normalizarParaBuscar(opcion.detalle ?? '').includes(termino),
    );
  }

  /** Ruta «Raíz › … › Categoría» de una categoría, o null si no está cargada. */
  function rutaDe(id: number | null): string | null {
    if (id === null || !jerarquia.value.obtener(id)) return null;
    return jerarquia.value.rutaComoTexto(id);
  }

  return {
    ...toRefs(estado),
    jerarquia,
    opcionesClasificacion,
    opcionesFiltro,
    cargar,
    motivoNoClasificable,
    buscarEn,
    rutaDe,
  };
}
