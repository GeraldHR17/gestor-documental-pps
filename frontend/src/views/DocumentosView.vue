<script setup lang="ts">
// Listado de documentos (MF-03). Mismo patrón ya verificado en Gestión de
// Usuarios y en los catálogos: filtros arriba, tabla con badges neutros,
// modal de confirmación PREVIA a cada transición de estado y toast de
// resultado DESPUÉS.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDocumentos } from '@/composables/useDocumentos';
import { useClasificacionDocumental } from '@/composables/useClasificacionDocumental';
import { useNotificaciones } from '@/composables/useNotificaciones';
import { useAutenticacion } from '@/composables/useAutenticacion';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import BadgeEstadoDocumento from '@/components/BadgeEstadoDocumento.vue';
import { bloquearNegativos } from '@/lib/validaciones';
import { ETIQUETAS_ESTADO_DOCUMENTO, formatearFecha } from '@/lib/documentos.config';
import { TRANSICIONES_PERMITIDAS } from '@/services/documentos.service';
import type { DocumentoDto, EstadoDocumento } from '@/types/documento.types';

type AccionEstado = 'publicar' | 'despublicar' | 'inactivar';

const { documentos, total, pagina, limite, cargando, error, listar, cambiarEstado } =
  useDocumentos();
const clasificacion = useClasificacionDocumental();
const { notificarExito, notificarError } = useNotificaciones();
const { tienePermiso } = useAutenticacion();

const puedeCrear = computed(() => tienePermiso('documentos.crear'));
const puedeEditar = computed(() => tienePermiso('documentos.editar'));
const puedePublicar = computed(() => tienePermiso('documentos.publicar'));
const puedeInactivar = computed(() => tienePermiso('documentos.inactivar'));

const textoBusqueda = ref('');
const filtroCategoria = ref<number | null>(null);
const filtroTipo = ref<number | null>(null);
const filtroDependencia = ref<number | null>(null);
const filtroAnio = ref<string>('');
const route = useRoute();

/**
 * El estado puede venir preaplicado desde otra pantalla (p. ej. el botón
 * "Revisar cola" de Inicio enlaza con ?estado=BORRADOR). Se acepta sólo si
 * es uno de los tres estados reales, para que un valor arbitrario en la URL
 * no deje el selector en un estado imposible.
 */
const ESTADOS_VALIDOS: EstadoDocumento[] = ['BORRADOR', 'PUBLICADO', 'INACTIVO'];
const estadoDeLaUrl = ESTADOS_VALIDOS.find((estado) => estado === route.query.estado) ?? null;

const filtroEstado = ref<EstadoDocumento | null>(estadoDeLaUrl);
const paginaActual = ref(1);

let temporizadorBusqueda: ReturnType<typeof setTimeout> | undefined;

function recargar(): void {
  const anio = Number(filtroAnio.value);

  listar({
    texto: textoBusqueda.value || undefined,
    idCategoriaItsp: filtroCategoria.value ?? undefined,
    idTipoDocumento: filtroTipo.value ?? undefined,
    idDependencia: filtroDependencia.value ?? undefined,
    anio: Number.isInteger(anio) && anio > 0 ? anio : undefined,
    estado: filtroEstado.value ?? undefined,
    pagina: paginaActual.value,
  }).catch(() => {
    // El mensaje ya quedó en `error`, que la plantilla muestra; aquí sólo
    // se evita que la promesa rechazada llegue sin manejar a la consola.
  });
}

function reiniciarYRecargar(): void {
  paginaActual.value = 1;
  recargar();
}

function manejarBuscar(): void {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(reiniciarYRecargar, 350);
}

watch([filtroCategoria, filtroTipo, filtroDependencia, filtroEstado], reiniciarYRecargar);
watch(filtroAnio, () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(reiniciarYRecargar, 350);
});

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / limite.value)));

function irAPagina(destino: number): void {
  if (destino < 1 || destino > totalPaginas.value) return;
  paginaActual.value = destino;
  recargar();
}

/** Opciones planas del filtro de categoría: raíces y subsecciones indentadas. */
const opcionesCategoria = computed(() =>
  clasificacion.arbolCategorias.value.flatMap((raiz) => [
    { id: raiz.id, etiqueta: raiz.nombre },
    ...raiz.hijos.map((hijo) => ({ id: hijo.id, etiqueta: `\u00A0\u00A0\u00A0\u00A0${hijo.nombre}` })),
  ]),
);

// ---------- Transiciones de estado ----------

const documentoPendiente = ref<DocumentoDto | null>(null);
const accionPendiente = ref<AccionEstado | null>(null);
const procesandoAccion = ref(false);

const TEXTOS_ACCION: Record<AccionEstado, { titulo: string; verbo: string; exito: string }> = {
  publicar: {
    titulo: 'Publicar documento',
    verbo: 'publicar',
    exito: 'El documento se publicó correctamente.',
  },
  despublicar: {
    titulo: 'Despublicar documento',
    verbo: 'despublicar',
    exito: 'El documento volvió a borrador correctamente.',
  },
  inactivar: {
    titulo: 'Inactivar documento',
    verbo: 'inactivar',
    exito: 'El documento se inactivó correctamente.',
  },
};

function puedeEjecutar(accion: AccionEstado, documento: DocumentoDto): boolean {
  const permiso = accion === 'inactivar' ? puedeInactivar.value : puedePublicar.value;
  return permiso && TRANSICIONES_PERMITIDAS[accion].includes(documento.estado);
}

function solicitarAccion(accion: AccionEstado, documento: DocumentoDto): void {
  accionPendiente.value = accion;
  documentoPendiente.value = documento;
}

function cancelarAccion(): void {
  accionPendiente.value = null;
  documentoPendiente.value = null;
}

async function confirmarAccion(): Promise<void> {
  const documento = documentoPendiente.value;
  const accion = accionPendiente.value;
  if (!documento || !accion) return;

  procesandoAccion.value = true;
  try {
    await cambiarEstado(documento.id, accion);
    notificarExito(TEXTOS_ACCION[accion].exito);
    cancelarAccion();
  } catch (err) {
    notificarError(err, `No se pudo ${TEXTOS_ACCION[accion].verbo} el documento.`);
  } finally {
    procesandoAccion.value = false;
  }
}

onMounted(() => {
  clasificacion.cargar();
  recargar();
});
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
          Documentos
        </h1>
        <p class="font-body-lg text-body-lg text-secondary mt-2">
          Registre, versione y publique los documentos del índice de transparencia.
        </p>
      </div>
      <router-link
        v-if="puedeCrear"
        :to="{ name: 'documento-nuevo' }"
        class="h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">upload_file</span>
        Nuevo documento
      </router-link>
    </div>

    <!-- Filtros -->
    <div
      class="bg-pure-white rounded-primary border border-surface-alt p-gutter-sm flex flex-col gap-gutter-sm"
    >
      <div class="relative w-full">
        <span
          aria-hidden="true"
          class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          >search</span
        >
        <input
          v-model="textoBusqueda"
          type="text"
          placeholder="Buscar por título o descripción..."
          aria-label="Buscar documentos"
          class="w-full h-touch-target pl-10 pr-4 rounded-secondary border border-outline bg-pure-white focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg text-on-surface placeholder:text-secondary"
          @input="manejarBuscar"
        />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-sm">
        <select
          v-if="opcionesCategoria.length"
          v-model="filtroCategoria"
          aria-label="Filtrar por categoría ITSP"
          class="h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
        >
          <option :value="null">Todas las categorías</option>
          <option v-for="opcion in opcionesCategoria" :key="opcion.id" :value="opcion.id">
            {{ opcion.etiqueta }}
          </option>
        </select>

        <select
          v-if="clasificacion.tiposDocumentos.value.length"
          v-model="filtroTipo"
          aria-label="Filtrar por tipo documental"
          class="h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
        >
          <option :value="null">Todos los tipos</option>
          <option v-for="tipo in clasificacion.tiposDocumentos.value" :key="tipo.id" :value="tipo.id">
            {{ tipo.nombre }}
          </option>
        </select>

        <select
          v-if="clasificacion.dependencias.value.length"
          v-model="filtroDependencia"
          aria-label="Filtrar por dependencia"
          class="h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
        >
          <option :value="null">Todas las dependencias</option>
          <option
            v-for="dependencia in clasificacion.dependencias.value"
            :key="dependencia.id"
            :value="dependencia.id"
          >
            {{ dependencia.nombre }}
          </option>
        </select>

        <div class="flex gap-gutter-sm">
          <input
            v-model="filtroAnio"
            type="number"
            inputmode="numeric"
            min="0"
            @keydown="bloquearNegativos"
            placeholder="Año"
            aria-label="Filtrar por año"
            class="h-touch-target px-3 w-full rounded-secondary border border-outline bg-pure-white text-on-surface font-body-md text-body-md"
          />
          <select
            v-model="filtroEstado"
            aria-label="Filtrar por estado"
            class="h-touch-target px-3 w-full rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
          >
            <option :value="null">Todos</option>
            <option value="BORRADOR">Borrador</option>
            <option value="PUBLICADO">Publicado</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </div>
      </div>
    </div>

    <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
      {{ error }}
    </p>

    <!-- Tabla -->
    <div class="bg-pure-white rounded-primary border border-surface-alt overflow-hidden flex flex-col">
      <div class="overflow-x-auto w-full">
        <table class="w-full min-w-[900px] text-left border-collapse">
          <thead>
            <tr class="bg-on-surface">
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Documento
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Clasificación
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Año
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Versión
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
              <td colspan="6" class="py-8 px-gutter-lg text-center text-secondary">Cargando...</td>
            </tr>
            <tr v-else-if="documentos.length === 0">
              <td colspan="6" class="py-8 px-gutter-lg text-center text-secondary">
                No hay documentos que coincidan con los filtros actuales.
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="documento in documentos"
                :key="documento.id"
                class="hover:bg-surface-container-low transition-colors"
                :class="{ 'opacity-60': documento.estado === 'INACTIVO' }"
              >
                <td class="py-gutter-sm px-gutter-lg max-w-md">
                  <router-link
                    :to="{ name: 'documento-detalle', params: { id: documento.id } }"
                    class="flex items-center min-h-list-row font-semibold text-on-surface hover:underline"
                  >
                    {{ documento.titulo }}
                  </router-link>
                  <p class="text-secondary text-body-md">
                    Actualizado el {{ formatearFecha(documento.fechaActualizacion) }}
                  </p>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-secondary max-w-xs">
                  <span class="block text-on-surface">{{ documento.nombreCategoriaItsp }}</span>
                  <span class="block">{{ documento.nombreTipoDocumento }}</span>
                </td>
                <td class="py-gutter-sm px-gutter-lg">{{ documento.anio }}</td>
                <td class="py-gutter-sm px-gutter-lg text-secondary whitespace-nowrap">
                  v{{ documento.versionVigente?.numeroVersion ?? 0 }}
                  <span v-if="documento.cantidadVersiones > 1">
                    ({{ documento.cantidadVersiones }} en total)
                  </span>
                </td>
                <td class="py-gutter-sm px-gutter-lg">
                  <BadgeEstadoDocumento :estado="documento.estado" />
                </td>
                <td class="py-gutter-sm px-gutter-lg text-right space-x-1 whitespace-nowrap">
                  <router-link
                    :to="{ name: 'documento-detalle', params: { id: documento.id } }"
                    title="Ver detalle"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">
                      visibility
                    </span>
                  </router-link>
                  <router-link
                    v-if="puedeEditar && documento.estado !== 'INACTIVO'"
                    :to="{ name: 'documento-editar', params: { id: documento.id } }"
                    title="Editar metadatos"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">edit</span>
                  </router-link>
                  <button
                    v-if="puedeEjecutar('publicar', documento)"
                    type="button"
                    title="Publicar"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                    @click="solicitarAccion('publicar', documento)"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">public</span>
                  </button>
                  <button
                    v-if="puedeEjecutar('despublicar', documento)"
                    type="button"
                    title="Despublicar"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                    @click="solicitarAccion('despublicar', documento)"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">
                      public_off
                    </span>
                  </button>
                  <button
                    v-if="puedeEjecutar('inactivar', documento)"
                    type="button"
                    title="Inactivar"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                    @click="solicitarAccion('inactivar', documento)"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">block</span>
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div
        class="border-t border-surface-alt p-gutter-sm bg-pure-white flex items-center justify-between gap-gutter-sm"
      >
        <span class="font-body-md text-body-md text-secondary">
          {{ total }} {{ total === 1 ? 'documento' : 'documentos' }}
        </span>
        <div class="flex items-center gap-gutter-sm">
          <button
            type="button"
            :disabled="pagina <= 1"
            class="h-touch-target px-gutter-sm rounded-secondary border border-outline text-on-surface font-label-sm text-label-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container transition-colors"
            @click="irAPagina(pagina - 1)"
          >
            Anterior
          </button>
          <span class="font-body-md text-body-md text-secondary whitespace-nowrap">
            Página {{ pagina }} de {{ totalPaginas }}
          </span>
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

    <!-- Confirmación PREVIA a la transición de estado -->
    <ModalConfirmacion
      v-if="documentoPendiente && accionPendiente"
      :titulo="TEXTOS_ACCION[accionPendiente].titulo"
      :procesando="procesandoAccion"
      @cancelar="cancelarAccion"
      @confirmar="confirmarAccion"
    >
      ¿Confirma que desea {{ TEXTOS_ACCION[accionPendiente].verbo }}
      <strong class="text-on-surface">{{ documentoPendiente.titulo }}</strong
      >?
    </ModalConfirmacion>
  </div>
</template>
