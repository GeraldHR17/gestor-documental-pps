<script setup lang="ts">
// Consulta de la bitácora de auditoría (MF-07). Sólo lectura, paginada.
//
// Filtros (rediseño confirmado con el PO: nada de IDs a la vista):
//  - Usuario que ejecutó la acción: búsqueda por nombre/correo.
//  - Tipo de entidad afectada: select fijo (Usuario, Documento, ...).
//  - Registro afectado: búsqueda por nombre/título dentro de la entidad
//    elegida; deshabilitado hasta elegir el tipo, porque no tiene sentido
//    buscar un registro sin saber en qué catálogo.
//  - Acción: texto libre (ej. PUBLICAR).
// El formulario de usuario enlaza aquí con `?entidad=usuarios&idRegistro=N`;
// ese id sólo viaja en la URL, en pantalla se resuelve a su nombre.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import bitacoraService from '@/services/bitacora.service';
import { obtenerMensajeError } from '@/composables/useNotificaciones';
import { formatearFecha } from '@/lib/documentos.config';
import { BUSCADOR_USUARIOS, ENTIDADES_BITACORA, obtenerEntidadBitacora } from '@/lib/bitacora.config';
import SelectorBusqueda from '@/components/SelectorBusqueda.vue';
import type { EntradaBitacoraDto } from '@/types/bitacora.types';

const route = useRoute();

const entradas = ref<EntradaBitacoraDto[]>([]);
const total = ref(0);
const pagina = ref(1);
const limite = ref(20);
const cargando = ref(false);
const error = ref<string | null>(null);

function leerId(valor: unknown): number | null {
  return typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : null;
}

const entidadInicial = typeof route.query.entidad === 'string' ? route.query.entidad : '';
const filtroEntidad = ref(obtenerEntidadBitacora(entidadInicial) ? entidadInicial : '');
const filtroIdRegistro = ref<number | null>(filtroEntidad.value ? leerId(route.query.idRegistro) : null);
const filtroIdUsuario = ref<number | null>(leerId(route.query.idUsuario));
const filtroAccion = ref('');

const entidadSeleccionada = computed(() => obtenerEntidadBitacora(filtroEntidad.value));

// Las funciones de búsqueda cambian con la entidad elegida; cuando no hay
// entidad se entrega una función vacía y el selector queda deshabilitado.
const buscarRegistro = computed(
  () => entidadSeleccionada.value?.buscar ?? (async () => []),
);
const resolverRegistro = computed(
  () => entidadSeleccionada.value?.resolverEtiqueta ?? (async () => null),
);

let temporizador: ReturnType<typeof setTimeout> | undefined;

async function recargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    const respuesta = await bitacoraService.consultar({
      entidad: filtroEntidad.value || undefined,
      idRegistro: filtroIdRegistro.value ?? undefined,
      idUsuario: filtroIdUsuario.value ?? undefined,
      accion: filtroAccion.value || undefined,
      pagina: pagina.value,
      limite: limite.value,
    });
    entradas.value = respuesta.datos;
    total.value = respuesta.total;
  } catch (err) {
    error.value = obtenerMensajeError(err, 'No se pudo cargar la bitácora.');
  } finally {
    cargando.value = false;
  }
}

function reiniciarYRecargar(): void {
  pagina.value = 1;
  void recargar();
}

// Cambiar de entidad invalida el registro elegido: pertenecía a otro catálogo.
watch(filtroEntidad, () => {
  filtroIdRegistro.value = null;
});

watch([filtroEntidad, filtroIdRegistro, filtroIdUsuario], reiniciarYRecargar);
watch(filtroAccion, () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(reiniciarYRecargar, 350);
});

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / limite.value)));

function irAPagina(destino: number): void {
  if (destino < 1 || destino > totalPaginas.value) return;
  pagina.value = destino;
  void recargar();
}

function etiquetaEntidad(valor: string): string {
  return obtenerEntidadBitacora(valor)?.etiqueta ?? valor;
}

function resumirDetalles(detalles: Record<string, unknown> | null): string {
  if (!detalles) return '—';
  return Object.entries(detalles)
    .map(([clave, valor]) => `${clave}: ${Array.isArray(valor) ? valor.join(', ') : String(valor)}`)
    .join(' · ');
}

onMounted(recargar);
</script>

<template>
  <div class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen">
    <div class="border-b border-surface-alt pb-gutter-sm">
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface">
        Bitácora
      </h1>
      <p class="font-body-lg text-body-lg text-secondary mt-2">
        Registro de auditoría del sistema: quién hizo qué, sobre qué registro y cuándo.
      </p>
    </div>

    <div class="bg-pure-white rounded-primary border border-surface-alt p-gutter-sm grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-sm">
      <div>
        <label class="block font-label-sm text-label-sm text-tertiary uppercase mb-1" for="filtro-usuario">
          Usuario que ejecutó la acción
        </label>
        <SelectorBusqueda
          id="filtro-usuario"
          v-model="filtroIdUsuario"
          etiqueta-accesible="usuario que ejecutó la acción"
          placeholder="Buscar por nombre o correo..."
          :buscar="BUSCADOR_USUARIOS.buscar"
          :resolver-etiqueta="BUSCADOR_USUARIOS.resolverEtiqueta"
        />
      </div>

      <div>
        <label class="block font-label-sm text-label-sm text-tertiary uppercase mb-1" for="filtro-entidad">
          Tipo de entidad afectada
        </label>
        <select
          id="filtro-entidad"
          v-model="filtroEntidad"
          class="h-touch-target w-full px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
        >
          <option value="">Todas las entidades</option>
          <option v-for="entidad in ENTIDADES_BITACORA" :key="entidad.valor" :value="entidad.valor">
            {{ entidad.etiqueta }}
          </option>
        </select>
      </div>

      <div>
        <label class="block font-label-sm text-label-sm text-tertiary uppercase mb-1" for="filtro-registro">
          Registro afectado
        </label>
        <SelectorBusqueda
          id="filtro-registro"
          v-model="filtroIdRegistro"
          etiqueta-accesible="registro afectado"
          placeholder="Buscar por nombre o título..."
          placeholder-deshabilitado="Elija primero un tipo de entidad"
          :deshabilitado="!entidadSeleccionada"
          :buscar="buscarRegistro"
          :resolver-etiqueta="resolverRegistro"
        />
      </div>

      <div>
        <label class="block font-label-sm text-label-sm text-tertiary uppercase mb-1" for="filtro-accion">
          Acción
        </label>
        <input
          id="filtro-accion"
          v-model="filtroAccion"
          type="text"
          placeholder="Ej. PUBLICAR"
          class="h-touch-target w-full px-3 rounded-secondary border border-outline bg-pure-white text-on-surface font-body-md text-body-md placeholder:text-secondary focus:border-2 focus:border-on-surface focus:outline-none"
        />
      </div>
    </div>

    <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">{{ error }}</p>

    <div class="bg-pure-white rounded-primary border border-surface-alt overflow-hidden flex flex-col">
      <div class="overflow-x-auto w-full">
        <table class="w-full min-w-[900px] text-left border-collapse">
          <thead>
            <tr class="bg-on-surface">
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">Fecha y hora</th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">Acción</th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">Entidad afectada</th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">Usuario</th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">Detalles</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-alt font-body-md text-body-md text-on-surface">
            <tr v-if="cargando">
              <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">Cargando...</td>
            </tr>
            <tr v-else-if="entradas.length === 0">
              <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">
                No hay entradas que coincidan con los filtros actuales.
              </td>
            </tr>
            <tr v-for="entrada in entradas" v-else :key="entrada.id" class="hover:bg-surface-container-low transition-colors">
              <td class="py-gutter-sm px-gutter-lg whitespace-nowrap text-secondary">{{ formatearFecha(entrada.fechaHora) }}</td>
              <td class="py-gutter-sm px-gutter-lg"><code class="text-body-md">{{ entrada.accion }}</code></td>
              <td class="py-gutter-sm px-gutter-lg text-secondary">{{ etiquetaEntidad(entrada.entidad) }}</td>
              <td class="py-gutter-sm px-gutter-lg">{{ entrada.nombreUsuario ?? '—' }}</td>
              <td class="py-gutter-sm px-gutter-lg text-secondary max-w-md truncate" :title="resumirDetalles(entrada.detalles)">
                {{ resumirDetalles(entrada.detalles) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="border-t border-surface-alt p-gutter-sm bg-pure-white flex items-center justify-between gap-gutter-sm">
        <span class="font-body-md text-body-md text-secondary">{{ total }} {{ total === 1 ? 'entrada' : 'entradas' }}</span>
        <div class="flex items-center gap-gutter-sm">
          <button
            type="button"
            :disabled="pagina <= 1"
            class="h-touch-target px-gutter-sm rounded-secondary border border-outline text-on-surface font-label-sm text-label-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-colors"
            @click="irAPagina(pagina - 1)"
          >
            Anterior
          </button>
          <span class="font-body-md text-body-md text-secondary whitespace-nowrap">Página {{ pagina }} de {{ totalPaginas }}</span>
          <button
            type="button"
            :disabled="pagina >= totalPaginas"
            class="h-touch-target px-gutter-sm rounded-secondary border border-outline text-on-surface font-label-sm text-label-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-colors"
            @click="irAPagina(pagina + 1)"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
