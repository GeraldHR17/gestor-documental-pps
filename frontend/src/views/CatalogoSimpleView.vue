<script setup lang="ts">
// Vista única para los tres catálogos planos (tipos de documento,
// dependencias y etiquetas). Cuál se administra lo dice la prop `catalogo`,
// que fija cada ruta; los textos, el límite del nombre y si hay columna de
// descripción salen de `lib/catalogos.config.ts`.
//
// Sigue el mismo patrón ya verificado en Gestión de Usuarios: modal de
// confirmación PREVIA a inactivar/activar, y toast de resultado DESPUÉS.
import { computed, onMounted, ref, watch } from 'vue';
import { useCatalogo } from '@/composables/useCatalogo';
import { useNotificaciones } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import type { CatalogoDto, EstadoCatalogo } from '@/types/catalogo.types';

const props = defineProps<{ catalogo: string }>();

const { registros, cargando, error, configuracion, listar, cambiarEstado } = useCatalogo(
  props.catalogo,
);
const { notificarExito, notificarError } = useNotificaciones();

const textoBusqueda = ref('');
const estadoFiltro = ref<EstadoCatalogo | null>(null);

const registroPendienteDeConfirmar = ref<CatalogoDto | null>(null);
const cambiandoEstado = ref(false);

let temporizadorBusqueda: ReturnType<typeof setTimeout> | undefined;

function recargar(): void {
  listar({
    nombre: textoBusqueda.value || undefined,
    estado: estadoFiltro.value ?? undefined,
  });
}

function manejarBuscar(): void {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(recargar, 350);
}

watch(estadoFiltro, recargar);

const cantidadColumnas = computed(() => (configuracion.admiteDescripcion ? 4 : 3));

const accionPendiente = computed(() =>
  registroPendienteDeConfirmar.value?.estado === 'ACTIVO' ? 'inactivar' : 'activar',
);

function solicitarCambioEstado(registro: CatalogoDto): void {
  registroPendienteDeConfirmar.value = registro;
}

async function confirmarCambioEstado(): Promise<void> {
  const registro = registroPendienteDeConfirmar.value;
  if (!registro) return;

  const nuevoEstado: EstadoCatalogo = registro.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
  const { singular, articulo } = configuracion;
  cambiandoEstado.value = true;
  try {
    await cambiarEstado(registro.id, nuevoEstado);
    notificarExito(
      nuevoEstado === 'INACTIVO'
        ? `Se inactivó ${articulo} ${singular} correctamente.`
        : `Se activó ${articulo} ${singular} correctamente.`,
    );
    registroPendienteDeConfirmar.value = null;
  } catch (err) {
    notificarError(
      err,
      nuevoEstado === 'INACTIVO'
        ? `No se pudo inactivar ${articulo} ${singular}.`
        : `No se pudo activar ${articulo} ${singular}.`,
    );
  } finally {
    cambiandoEstado.value = false;
  }
}

onMounted(recargar);
</script>

<template>
  <div
    class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen"
  >
    <!-- Encabezado de página -->
    <div
      class="flex flex-col md:flex-row md:items-end justify-between gap-gutter-sm border-b border-surface-alt pb-gutter-sm"
    >
      <div>
        <h1
          class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
        >
          {{ configuracion.titulo }}
        </h1>
        <p class="font-body-lg text-body-lg text-secondary mt-2">
          {{ configuracion.descripcionPagina }}
        </p>
      </div>
      <router-link
        :to="{ name: configuracion.nombreRutaNueva }"
        class="h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">add</span>
        Nuevo registro
      </router-link>
    </div>

    <!-- Controles de búsqueda y filtro -->
    <div
      class="bg-pure-white rounded-primary border border-surface-alt p-gutter-sm flex flex-col md:flex-row gap-gutter-sm items-center justify-between"
    >
      <div class="relative w-full md:w-96">
        <span
          aria-hidden="true"
          class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          >search</span
        >
        <input
          v-model="textoBusqueda"
          type="text"
          :placeholder="'Buscar ' + configuracion.singular + '...'"
          :aria-label="'Buscar ' + configuracion.singular"
          class="w-full h-touch-target pl-10 pr-4 rounded-secondary border border-outline bg-pure-white focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg text-on-surface placeholder:text-secondary"
          @input="manejarBuscar"
        />
      </div>
      <select
        v-model="estadoFiltro"
        aria-label="Filtrar por estado"
        class="h-touch-target px-4 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md whitespace-nowrap w-full md:w-auto"
      >
        <option :value="null">Todos los estados</option>
        <option value="ACTIVO">Activo</option>
        <option value="INACTIVO">Inactivo</option>
      </select>
    </div>

    <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
      {{ error }}
    </p>

    <!-- Tabla -->
    <div class="bg-pure-white rounded-primary border border-surface-alt overflow-hidden flex flex-col">
      <div class="overflow-x-auto w-full">
        <table class="w-full min-w-[640px] text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low border-b border-surface-alt">
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase">
                {{ configuracion.etiquetaColumnaNombre }}
              </th>
              <th
                v-if="configuracion.admiteDescripcion"
                class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase"
              >
                Descripción
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase">
                Estado
              </th>
              <th
                class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase text-right"
              >
                Acciones
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-alt font-body-md text-body-md text-on-surface">
            <tr v-if="cargando">
              <td :colspan="cantidadColumnas" class="py-8 px-gutter-lg text-center text-secondary">
                Cargando...
              </td>
            </tr>
            <tr v-else-if="registros.length === 0">
              <td :colspan="cantidadColumnas" class="py-8 px-gutter-lg text-center text-secondary">
                No hay registros que coincidan con los filtros actuales.
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="registro in registros"
                :key="registro.id"
                class="hover:bg-surface-container-low transition-colors"
                :class="{ 'opacity-60': registro.estado === 'INACTIVO' }"
              >
                <td class="py-gutter-sm px-gutter-lg">
                  <div class="flex items-center min-h-list-row font-semibold text-on-surface">
                    {{ registro.nombre }}
                  </div>
                </td>
                <td
                  v-if="configuracion.admiteDescripcion"
                  class="py-gutter-sm px-gutter-lg text-secondary max-w-md"
                >
                  {{ registro.descripcion ?? '—' }}
                </td>
                <td class="py-gutter-sm px-gutter-lg">
                  <!-- Badge de estado: única forma pill del sistema, en
                       neutros; el rojo queda reservado a los errores. -->
                  <span
                    class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border whitespace-nowrap"
                    :class="
                      registro.estado === 'ACTIVO'
                        ? 'bg-secondary-container text-on-surface border-secondary-fixed-dim'
                        : 'bg-surface-container-high text-on-surface border-surface-dim'
                    "
                  >
                    <span
                      class="w-1.5 h-1.5 rounded-full mr-1.5"
                      :class="registro.estado === 'ACTIVO' ? 'bg-secondary' : 'bg-outline'"
                    ></span>
                    {{ registro.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-right space-x-1 whitespace-nowrap">
                  <!-- Botones de ícono: radio "Secondary standard" (6px) y
                       objetivo táctil de 44x44, no círculos. -->
                  <router-link
                    :to="{ name: configuracion.nombreRutaEdicion, params: { id: registro.id } }"
                    title="Editar"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">edit</span>
                  </router-link>
                  <button
                    type="button"
                    :title="registro.estado === 'ACTIVO' ? 'Inactivar' : 'Activar'"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                    @click="solicitarCambioEstado(registro)"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">
                      {{ registro.estado === 'ACTIVO' ? 'block' : 'check_circle' }}
                    </span>
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="border-t border-surface-alt p-gutter-sm bg-pure-white">
        <span class="font-body-md text-body-md text-secondary">
          {{ registros.length }} {{ registros.length === 1 ? 'registro' : 'registros' }}
        </span>
      </div>
    </div>

    <!-- Confirmación PREVIA al cambio de estado -->
    <ModalConfirmacion
      v-if="registroPendienteDeConfirmar"
      :titulo="accionPendiente === 'inactivar' ? 'Inactivar registro' : 'Activar registro'"
      :procesando="cambiandoEstado"
      @cancelar="registroPendienteDeConfirmar = null"
      @confirmar="confirmarCambioEstado"
    >
      ¿Confirma que desea {{ accionPendiente }}
      <strong class="text-on-surface">{{ registroPendienteDeConfirmar.nombre }}</strong
      >?
    </ModalConfirmacion>
  </div>
</template>
