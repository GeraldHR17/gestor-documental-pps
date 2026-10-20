// src/composables/usePortalPublico.ts
//
// Estado de las tres vistas del portal. Mismo patrón que el resto de los
// composables de datos (`reactive` + `toRefs`, sin Pinia).
//
// El árbol de secciones sí se guarda a nivel de módulo, como hacen
// `useAutenticacion` y `useNotificaciones`: lo piden la portada, la página
// de sección (para las migas de pan) y la de subsección, y no tiene
// sentido volver a traerlo en cada navegación dentro del iframe. Lo demás
// —el listado de documentos— es estado de una vista y nace con ella.
//
// Este archivo NO importa useAutenticacion, tokenStore ni http.ts: el
// portal no puede tocar la sesión ni por descuido.

import { reactive, toRefs } from 'vue';

import portalPublicoService from '@/services/portalPublico.service';
import { LIMITE_POR_PAGINA, esNoDisponible, mensajeDeError } from '@/lib/portalPublico.config';
import type {
  DocumentoPublicoDto,
  SeccionPublicaDto,
} from '@/types/portalPublico.types';

/** Árbol compartido entre las tres vistas; se trae una sola vez por carga. */
const arbol = reactive<{
  secciones: SeccionPublicaDto[];
  cargando: boolean;
  error: string | null;
  cargado: boolean;
}>({
  secciones: [],
  cargando: false,
  error: null,
  cargado: false,
});

/** Evita dos peticiones simultáneas cuando dos componentes piden el árbol a la vez. */
let promesaDelArbol: Promise<void> | null = null;

export function usePortalPublicoSecciones() {
  async function cargarSecciones(forzar = false): Promise<void> {
    if (arbol.cargado && !forzar) return;

    if (!promesaDelArbol) {
      promesaDelArbol = (async () => {
        arbol.cargando = true;
        arbol.error = null;
        try {
          arbol.secciones = await portalPublicoService.obtenerSecciones();
          arbol.cargado = true;
        } catch (error) {
          // El detalle técnico va a la consola; en pantalla, un mensaje
          // que la persona pueda entender y accionar.
          console.error('No se pudo cargar el árbol de secciones', error);
          arbol.error = mensajeDeError(error);
          arbol.secciones = [];
        } finally {
          arbol.cargando = false;
        }
      })().finally(() => {
        promesaDelArbol = null;
      });
    }

    await promesaDelArbol;
  }

  /** La sección por su código, sin volver a pedirla al servidor. */
  function seccionPorCodigo(codigo: string): SeccionPublicaDto | undefined {
    const buscado = codigo.toLowerCase();
    return arbol.secciones.find((seccion) => seccion.codigo.toLowerCase() === buscado);
  }

  return { ...toRefs(arbol), cargarSecciones, seccionPorCodigo };
}

interface EstadoSeccion {
  seccion: SeccionPublicaDto | null;
  cargando: boolean;
  error: string | null;
  noDisponible: boolean;
}

export function usePortalPublicoSeccion() {
  const estado = reactive<EstadoSeccion>({
    seccion: null,
    cargando: false,
    error: null,
    noDisponible: false,
  });

  async function cargarSeccion(codigoSeccion: string): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    estado.noDisponible = false;
    try {
      estado.seccion = await portalPublicoService.obtenerSeccion(codigoSeccion);
    } catch (error) {
      console.error(`No se pudo cargar la sección ${codigoSeccion}`, error);
      estado.seccion = null;
      estado.noDisponible = esNoDisponible(error);
      estado.error = mensajeDeError(error);
    } finally {
      estado.cargando = false;
    }
  }

  return { ...toRefs(estado), cargarSeccion };
}

interface EstadoDocumentos {
  documentos: DocumentoPublicoDto[];
  total: number;
  pagina: number;
  limite: number;
  cargando: boolean;
  error: string | null;
  noDisponible: boolean;
}

export function usePortalPublicoDocumentos() {
  const estado = reactive<EstadoDocumentos>({
    documentos: [],
    total: 0,
    pagina: 1,
    limite: LIMITE_POR_PAGINA,
    cargando: false,
    error: null,
    noDisponible: false,
  });

  async function cargar(
    peticion: () => Promise<{
      datos: DocumentoPublicoDto[];
      total: number;
      pagina: number;
      limite: number;
    }>,
  ): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    estado.noDisponible = false;
    try {
      const respuesta = await peticion();
      estado.documentos = respuesta.datos;
      estado.total = respuesta.total;
      estado.pagina = respuesta.pagina;
      estado.limite = respuesta.limite;
    } catch (error) {
      console.error('No se pudo cargar el listado de documentos', error);
      estado.documentos = [];
      estado.total = 0;
      estado.noDisponible = esNoDisponible(error);
      estado.error = mensajeDeError(error);
    } finally {
      estado.cargando = false;
    }
  }

  /** Documentos de una subsección. */
  function cargarDeSubseccion(
    codigoSeccion: string,
    codigoSubseccion: string,
    pagina = 1,
  ): Promise<void> {
    return cargar(() =>
      portalPublicoService.listarDocumentos(codigoSeccion, codigoSubseccion, {
        pagina,
        limite: LIMITE_POR_PAGINA,
      }),
    );
  }

  /** Documentos colgados directamente de la sección. */
  function cargarDeSeccion(codigoSeccion: string, pagina = 1): Promise<void> {
    return cargar(() =>
      portalPublicoService.listarDocumentosDeSeccion(codigoSeccion, {
        pagina,
        limite: LIMITE_POR_PAGINA,
      }),
    );
  }

  return { ...toRefs(estado), cargarDeSubseccion, cargarDeSeccion };
}
