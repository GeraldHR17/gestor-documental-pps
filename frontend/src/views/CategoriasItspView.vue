<script setup lang="ts">
// Catálogo de la taxonomía ITSP. A diferencia de los tres catálogos planos,
// aquí la tabla refleja la jerarquía con indentación (nivel 1 = raíz,
// nivel 2 = subsección). No hay árbol arrastrable: la relación se cambia
// desde el selector de "categoría padre" del formulario.
//
// El backend ya devuelve las filas en orden de despliegue, así que esta
// vista sólo indenta, no reordena.
import { onMounted, ref, watch } from 'vue';
import { useCategoriasItsp } from '@/composables/useCategoriasItsp';
import { useNotificaciones } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import type { CategoriaItspDto, EstadoCatalogo } from '@/types/catalogo.types';

const { categorias, cargando, error, listar, cambiarEstado } = useCategoriasItsp();
const { notificarExito, notificarError } = useNotificaciones();

const textoBusqueda = ref('');
const estadoFiltro = ref<EstadoCatalogo | null>(null);

const categoriaPendienteDeConfirmar = ref<CategoriaItspDto | null>(null);
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

async function confirmarCambioEstado(): Promise<void> {
  const categoria = categoriaPendienteDeConfirmar.value;
  if (!categoria) return;

  const nuevoEstado: EstadoCatalogo = categoria.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
  cambiandoEstado.value = true;
  try {
    await cambiarEstado(categoria.id, nuevoEstado);
    notificarExito(
      nuevoEstado === 'INACTIVO'
        ? 'Se inactivó la categoría correctamente.'
        : 'Se activó la categoría correctamente.',
    );
    categoriaPendienteDeConfirmar.value = null;
  } catch (err) {
    notificarError(
      err,
      nuevoEstado === 'INACTIVO'
        ? 'No se pudo inactivar la categoría.'
        : 'No se pudo activar la categoría.',
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
    <div
      class="flex flex-col md:flex-row md:items-end justify-between gap-gutter-sm border-b border-surface-alt pb-gutter-sm"
    >
      <div>
        <h1
          class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
        >
          Categorías ITSP
        </h1>
        <p class="font-body-lg text-body-lg text-secondary mt-2">
          Administre la taxonomía del Índice de Transparencia del Sector Público: categorías raíz y
          sus subsecciones.
        </p>
      </div>
      <router-link
        :to="{ name: 'categoria-itsp-nueva' }"
        class="h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">add</span>
        Nueva categoría
      </router-link>
    </div>

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
          placeholder="Buscar categoría..."
          aria-label="Buscar categoría"
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

    <div class="bg-pure-white rounded-primary border border-surface-alt overflow-hidden flex flex-col">
      <div class="overflow-x-auto w-full">
        <table class="w-full min-w-[760px] text-left border-collapse">
          <thead>
            <tr class="bg-on-surface">
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Categoría
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Código
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Nivel
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Estado
              </th>
              <th
                class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase text-right"
              >
                Acciones
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-alt font-body-md text-body-md text-on-surface">
            <tr v-if="cargando">
              <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">Cargando...</td>
            </tr>
            <tr v-else-if="categorias.length === 0">
              <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">
                No hay categorías que coincidan con los filtros actuales.
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="categoria in categorias"
                :key="categoria.id"
                class="hover:bg-surface-container-low transition-colors"
                :class="{ 'opacity-60': categoria.estado === 'INACTIVO' }"
              >
                <td class="py-gutter-sm px-gutter-lg">
                  <!-- La indentación es lo que comunica la jerarquía: las
                       subsecciones entran un nivel y llevan un conector. -->
                  <div
                    class="flex items-center gap-2 min-h-list-row"
                    :class="categoria.nivel === 2 ? 'pl-gutter-lg' : ''"
                  >
                    <span
                      v-if="categoria.nivel === 2"
                      aria-hidden="true"
                      class="material-symbols-outlined text-[18px] text-tertiary"
                      >subdirectory_arrow_right</span
                    >
                    <span
                      :class="
                        categoria.nivel === 1 ? 'font-semibold text-on-surface' : 'text-on-surface'
                      "
                    >
                      {{ categoria.nombre }}
                    </span>
                  </div>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-secondary whitespace-nowrap">
                  {{ categoria.codigo }}
                </td>
                <td class="py-gutter-sm px-gutter-lg text-secondary whitespace-nowrap">
                  {{ categoria.nivel === 1 ? 'Raíz' : 'Subsección' }}
                </td>
                <td class="py-gutter-sm px-gutter-lg">
                  <span
                    class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border whitespace-nowrap"
                    :class="
                      categoria.estado === 'ACTIVO'
                        ? 'bg-secondary-container text-on-surface border-secondary-fixed-dim'
                        : 'bg-surface-container-high text-on-surface border-surface-dim'
                    "
                  >
                    <span
                      class="w-1.5 h-1.5 rounded-full mr-1.5"
                      :class="categoria.estado === 'ACTIVO' ? 'bg-secondary' : 'bg-outline'"
                    ></span>
                    {{ categoria.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-right space-x-1 whitespace-nowrap">
                  <router-link
                    :to="{ name: 'categoria-itsp-editar', params: { id: categoria.id } }"
                    title="Editar"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">edit</span>
                  </router-link>
                  <button
                    type="button"
                    :title="categoria.estado === 'ACTIVO' ? 'Inactivar' : 'Activar'"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                    @click="categoriaPendienteDeConfirmar = categoria"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">
                      {{ categoria.estado === 'ACTIVO' ? 'block' : 'check_circle' }}
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
          {{ categorias.length }} {{ categorias.length === 1 ? 'categoría' : 'categorías' }}
        </span>
      </div>
    </div>

    <ModalConfirmacion
      v-if="categoriaPendienteDeConfirmar"
      :titulo="
        categoriaPendienteDeConfirmar.estado === 'ACTIVO'
          ? 'Inactivar categoría'
          : 'Activar categoría'
      "
      :procesando="cambiandoEstado"
      @cancelar="categoriaPendienteDeConfirmar = null"
      @confirmar="confirmarCambioEstado"
    >
      ¿Confirma que desea
      {{ categoriaPendienteDeConfirmar.estado === 'ACTIVO' ? 'inactivar' : 'activar' }}
      <strong class="text-on-surface">{{ categoriaPendienteDeConfirmar.nombre }}</strong
      >?
    </ModalConfirmacion>
  </div>
</template>
