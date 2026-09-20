// src/composables/useCatalogo.ts
//
// Mismo patrón que useUsuarios: estado por instancia (no singleton), sin
// Pinia. Recibe la clave del catálogo porque los tres planos comparten
// vista, formulario y este composable.

import { reactive, toRefs } from 'vue';
import { crearServicioCatalogo } from '@/services/catalogos.service';
import { obtenerConfiguracionCatalogo } from '@/lib/catalogos.config';
import type {
  CatalogoDto,
  EstadoCatalogo,
  FiltrosCatalogoDto,
  GuardarCatalogoDto,
} from '@/types/catalogo.types';

interface EstadoCatalogoLista {
  registros: CatalogoDto[];
  cargando: boolean;
  error: string | null;
}

export function useCatalogo(clave: string) {
  const configuracion = obtenerConfiguracionCatalogo(clave);
  const servicio = crearServicioCatalogo(configuracion.recurso);

  const estado = reactive<EstadoCatalogoLista>({
    registros: [],
    cargando: false,
    error: null,
  });

  async function listar(filtros: FiltrosCatalogoDto = {}): Promise<void> {
    estado.cargando = true;
    estado.error = null;
    try {
      estado.registros = await servicio.listar(filtros);
    } catch (error) {
      estado.error = `No se pudo cargar el catálogo de ${configuracion.titulo.toLowerCase()}`;
      throw error;
    } finally {
      estado.cargando = false;
    }
  }

  async function crear(datos: GuardarCatalogoDto): Promise<void> {
    await servicio.crear(datos);
  }

  async function actualizar(id: number, datos: GuardarCatalogoDto): Promise<void> {
    await servicio.actualizar(id, datos);
  }

  async function cambiarEstado(id: number, nuevoEstado: EstadoCatalogo): Promise<void> {
    await servicio.cambiarEstado(id, nuevoEstado);
    // Se actualiza en memoria en vez de recargar la lista completa: el
    // cambio es de una sola fila y así la tabla no parpadea.
    const registro = estado.registros.find((fila) => fila.id === id);
    if (registro) registro.estado = nuevoEstado;
  }

  return { ...toRefs(estado), configuracion, servicio, listar, crear, actualizar, cambiarEstado };
}
