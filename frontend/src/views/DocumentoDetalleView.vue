<script setup lang="ts">
// Detalle del documento (CU-017): metadatos, visor PDF embebido, historial
// completo de versiones y las acciones de estado según permisos.
//
// El visor NO apunta al endpoint con un `<iframe src="/documentos/1/visualizar">`:
// esa petición la haría el navegador por su cuenta, sin la cabecera
// Authorization, y devolvería 401. En su lugar se pide el PDF como blob a
// través del cliente HTTP —que sí adjunta el token y sabe renovarlo— y se
// muestra el `blob:` resultante. Lo mismo vale para la descarga.
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import documentosService, { TRANSICIONES_PERMITIDAS } from '@/services/documentos.service';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import { useAutenticacion } from '@/composables/useAutenticacion';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import ZonaCargaPdf from '@/components/ZonaCargaPdf.vue';
import {
  ETIQUETAS_ESTADO_DOCUMENTO,
  formatearFecha,
  formatearTamano,
  type ArchivoPdfInspeccionado,
} from '@/lib/documentos.config';
import {
  LONGITUD_MAXIMA_COMENTARIO_VERSION,
  validarComentarioVersion,
} from '@/lib/validaciones';
import type { DocumentoDto } from '@/types/documento.types';

type AccionEstado = 'publicar' | 'despublicar' | 'inactivar';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { notificarExito, notificarError } = useNotificaciones();
const { tienePermiso } = useAutenticacion();

const idDocumento = computed(() => Number(props.id));

const documento = ref<DocumentoDto | null>(null);
const cargando = ref(false);
const error = ref<string | null>(null);

const puedeEditar = computed(
  () => tienePermiso('documentos.editar') && documento.value?.estado !== 'INACTIVO',
);
const puedeCargarVersion = computed(
  () => tienePermiso('versiones.cargar') && documento.value?.estado !== 'INACTIVO',
);

function puedeEjecutar(accion: AccionEstado): boolean {
  if (!documento.value) return false;
  const permiso =
    accion === 'inactivar' ? tienePermiso('documentos.inactivar') : tienePermiso('documentos.publicar');
  return permiso && TRANSICIONES_PERMITIDAS[accion].includes(documento.value.estado);
}

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    documento.value = await documentosService.obtener(idDocumento.value);
    versionSeleccionada.value = documento.value.versionVigente?.numeroVersion ?? null;
  } catch (err) {
    error.value = obtenerMensajeError(err, 'No se pudo cargar el documento.');
  } finally {
    cargando.value = false;
  }
}

// ---------- Visor PDF (RF-027) ----------

const versionSeleccionada = ref<number | null>(null);
const urlVisor = ref<string | null>(null);
const cargandoVisor = ref(false);
const errorVisor = ref<string | null>(null);

/**
 * Un `blob:` ocupa memoria hasta que se revoca explícitamente. Se libera el
 * anterior en cada cambio de versión y al desmontar la vista; sin esto,
 * recorrer un historial largo dejaría un PDF retenido por cada versión
 * visitada.
 */
function liberarUrlVisor(): void {
  if (urlVisor.value) {
    URL.revokeObjectURL(urlVisor.value);
    urlVisor.value = null;
  }
}

async function cargarVisor(): Promise<void> {
  if (versionSeleccionada.value === null) return;

  cargandoVisor.value = true;
  errorVisor.value = null;
  liberarUrlVisor();

  try {
    const blob = await documentosService.obtenerBlobVisualizacion(
      idDocumento.value,
      versionSeleccionada.value,
    );
    urlVisor.value = URL.createObjectURL(blob);
  } catch (err) {
    errorVisor.value = obtenerMensajeError(err, 'No se pudo cargar la vista previa del documento.');
  } finally {
    cargandoVisor.value = false;
  }
}

watch(versionSeleccionada, cargarVisor);
onBeforeUnmount(liberarUrlVisor);

// ---------- Descarga (RF-028) ----------

const descargando = ref(false);

async function descargar(numeroVersion: number, nombreArchivo: string): Promise<void> {
  descargando.value = true;
  try {
    const blob = await documentosService.obtenerBlobDescarga(idDocumento.value, numeroVersion);

    // Se dispara desde un enlace temporal en memoria porque el endpoint
    // exige la cabecera Authorization: un `<a href>` al endpoint la
    // omitiría y devolvería 401.
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);

    notificarExito('La descarga se inició correctamente.');
  } catch (err) {
    notificarError(err, 'No se pudo descargar el archivo.');
  } finally {
    descargando.value = false;
  }
}

// ---------- Nueva versión (RF-022) ----------

const mostrarFormularioVersion = ref(false);
// La zona de carga ya entrega el archivo validado (o null).
const archivoVersion = ref<ArchivoPdfInspeccionado | null>(null);
const comentarioVersion = ref('');
const guardandoVersion = ref(false);
const mostrarModalVersion = ref(false);

const errorComentarioVersion = computed(() => validarComentarioVersion(comentarioVersion.value));
const formularioVersionValido = computed(
  () => archivoVersion.value !== null && errorComentarioVersion.value === null,
);

function cerrarFormularioVersion(): void {
  mostrarFormularioVersion.value = false;
  archivoVersion.value = null;
  comentarioVersion.value = '';
}

function solicitarNuevaVersion(): void {
  if (!formularioVersionValido.value) return;
  mostrarModalVersion.value = true;
}

async function confirmarNuevaVersion(): Promise<void> {
  if (!archivoVersion.value) return;

  guardandoVersion.value = true;
  try {
    documento.value = await documentosService.crearVersion(
      idDocumento.value,
      archivoVersion.value.archivo,
      comentarioVersion.value.trim() || undefined,
    );
    // El visor pasa a mostrar la versión recién cargada, que es la vigente.
    versionSeleccionada.value = documento.value.versionVigente?.numeroVersion ?? null;
    mostrarModalVersion.value = false;
    cerrarFormularioVersion();
    notificarExito('La nueva versión se cargó correctamente.');
  } catch (err) {
    notificarError(err, 'No se pudo cargar la nueva versión.');
    mostrarModalVersion.value = false;
  } finally {
    guardandoVersion.value = false;
  }
}

// ---------- Transiciones de estado ----------

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

async function confirmarAccion(): Promise<void> {
  const accion = accionPendiente.value;
  if (!accion) return;

  procesandoAccion.value = true;
  try {
    documento.value = await documentosService.cambiarEstado(idDocumento.value, accion);
    notificarExito(TEXTOS_ACCION[accion].exito);
    accionPendiente.value = null;
  } catch (err) {
    notificarError(err, `No se pudo ${TEXTOS_ACCION[accion].verbo} el documento.`);
  } finally {
    procesandoAccion.value = false;
  }
}

function volverAlListado(): void {
  router.push({ name: 'documentos' });
}

// cargar() fija versionSeleccionada, y su watcher es quien dispara el
// visor: llamarlo también aquí pediría el mismo PDF dos veces.
onMounted(cargar);
</script>

<template>
  <div
    class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen"
  >
    <div v-if="cargando" class="text-secondary font-body-lg text-body-lg">Cargando...</div>

    <p
      v-else-if="error"
      role="alert"
      aria-live="assertive"
      class="text-error font-body-md text-body-md"
    >
      {{ error }}
    </p>

    <template v-else-if="documento">
      <!-- Encabezado y acciones -->
      <div
        class="flex flex-col lg:flex-row lg:items-start justify-between gap-gutter-sm border-b border-surface-alt pb-gutter-sm"
      >
        <div class="min-w-0">
          <button
            type="button"
            class="font-label-sm text-label-sm text-secondary hover:text-on-surface transition-colors inline-flex items-center gap-1 mb-2"
            @click="volverAlListado"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[16px]">arrow_back</span>
            Volver al listado
          </button>
          <h1
            class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
          >
            {{ documento.titulo }}
          </h1>
          <div class="flex items-center gap-gutter-sm mt-2 flex-wrap">
            <span
              class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border whitespace-nowrap"
              :class="
                documento.estado === 'PUBLICADO'
                  ? 'bg-secondary-container text-on-surface border-secondary-fixed-dim'
                  : 'bg-surface-container-high text-on-surface border-surface-dim'
              "
            >
              <span
                class="w-1.5 h-1.5 rounded-full mr-1.5"
                :class="documento.estado === 'PUBLICADO' ? 'bg-secondary' : 'bg-outline'"
              ></span>
              {{ ETIQUETAS_ESTADO_DOCUMENTO[documento.estado] }}
            </span>
            <span class="font-body-md text-body-md text-secondary">
              {{ documento.cantidadVersiones }}
              {{ documento.cantidadVersiones === 1 ? 'versión' : 'versiones' }}
            </span>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-gutter-sm">
          <router-link
            v-if="puedeEditar"
            :to="{ name: 'documento-editar', params: { id: documento.id } }"
            class="h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[18px]">edit</span>
            Editar metadatos
          </router-link>
          <button
            v-if="puedeCargarVersion"
            type="button"
            class="h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
            @click="mostrarFormularioVersion = !mostrarFormularioVersion"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[18px]">upload_file</span>
            Nueva versión
          </button>
          <button
            v-if="puedeEjecutar('publicar')"
            type="button"
            class="h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary transition-colors flex items-center gap-2"
            @click="accionPendiente = 'publicar'"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[18px]">public</span>
            Publicar
          </button>
          <button
            v-if="puedeEjecutar('despublicar')"
            type="button"
            class="h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
            @click="accionPendiente = 'despublicar'"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[18px]">public_off</span>
            Despublicar
          </button>
          <button
            v-if="puedeEjecutar('inactivar')"
            type="button"
            class="h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
            @click="accionPendiente = 'inactivar'"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[18px]">block</span>
            Inactivar
          </button>
        </div>
      </div>

      <!-- Formulario plegable de nueva versión -->
      <form
        v-if="mostrarFormularioVersion"
        class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm"
        novalidate
        @submit.prevent="solicitarNuevaVersion"
      >
        <h2 class="font-headline-sm text-headline-sm text-on-surface">Cargar nueva versión</h2>
        <p class="font-body-md text-body-md text-secondary">
          La versión actual no se reemplaza: la nueva se agrega al historial y pasa a ser la
          vigente.
        </p>

        <!-- Misma zona de carga que el asistente de registro: clic o
             arrastrar, y las mismas cuatro validaciones. -->
        <ZonaCargaPdf v-model="archivoVersion" mensaje-validacion="Archivo validado." />

        <div>
          <label for="comentario-version" class="block font-body-md text-body-md text-on-surface mb-2">
            Comentario de la versión <span class="text-secondary">(opcional)</span>
          </label>
          <input
            id="comentario-version"
            v-model="comentarioVersion"
            type="text"
            :maxlength="LONGITUD_MAXIMA_COMENTARIO_VERSION"
            class="w-full h-touch-target px-3 border rounded-primary bg-pure-white text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
            :class="
              errorComentarioVersion
                ? 'border-error focus:border-error'
                : 'border-outline focus:border-on-surface'
            "
          />
          <p v-if="errorComentarioVersion" class="font-body-md text-body-md text-error mt-2">
            {{ errorComentarioVersion }}
          </p>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-end gap-gutter-sm">
          <button
            type="button"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
            @click="cerrarFormularioVersion"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="guardandoVersion || !formularioVersionValido"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ guardandoVersion ? 'Cargando...' : 'Cargar versión' }}
          </button>
        </div>
      </form>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-gutter-lg">
        <!-- Metadatos -->
        <section
          class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm"
        >
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Metadatos</h2>
          <dl class="flex flex-col gap-gutter-sm font-body-md text-body-md">
            <div>
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Categoría ITSP</dt>
              <dd class="text-on-surface">
                <span v-if="documento.nombreCategoriaRaiz" class="text-secondary">
                  {{ documento.nombreCategoriaRaiz }} ›
                </span>
                {{ documento.nombreCategoriaItsp }}
              </dd>
            </div>
            <div>
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Tipo documental</dt>
              <dd class="text-on-surface">{{ documento.nombreTipoDocumento }}</dd>
            </div>
            <div>
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Año</dt>
              <dd class="text-on-surface">{{ documento.anio }}</dd>
            </div>
            <div>
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Descripción</dt>
              <dd class="text-on-surface whitespace-pre-line">{{ documento.descripcion ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Dependencia</dt>
              <dd class="text-on-surface">{{ documento.nombreDependencia ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Etiquetas</dt>
              <dd class="flex flex-wrap gap-1 mt-1">
                <span v-if="documento.etiquetas.length === 0" class="text-secondary">—</span>
                <span
                  v-for="etiqueta in documento.etiquetas"
                  :key="etiqueta.id"
                  class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm bg-surface-container-high text-on-surface border border-surface-dim"
                >
                  {{ etiqueta.nombre }}
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Registrado por</dt>
              <dd class="text-on-surface">
                {{ documento.nombreUsuarioCreador ?? '—' }}
                <span class="text-secondary block">
                  {{ formatearFecha(documento.fechaCreacion) }}
                </span>
              </dd>
            </div>
            <div v-if="documento.fechaPublicacion">
              <dt class="text-tertiary font-label-sm text-label-sm uppercase">Publicado el</dt>
              <dd class="text-on-surface">{{ formatearFecha(documento.fechaPublicacion) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Visor PDF -->
        <section
          class="xl:col-span-2 bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm"
        >
          <div class="flex items-center justify-between gap-gutter-sm flex-wrap">
            <h2 class="font-headline-sm text-headline-sm text-on-surface">Vista previa</h2>
            <select
              v-if="documento.versiones && documento.versiones.length > 1"
              v-model="versionSeleccionada"
              aria-label="Versión a visualizar"
              class="h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
            >
              <option v-for="version in documento.versiones" :key="version.id" :value="version.numeroVersion">
                Versión {{ version.numeroVersion }}{{ version.esVigente ? ' (vigente)' : '' }}
              </option>
            </select>
          </div>

          <p v-if="cargandoVisor" class="font-body-md text-body-md text-secondary">
            Cargando vista previa...
          </p>
          <p
            v-else-if="errorVisor"
            role="alert"
            class="font-body-md text-body-md text-error"
          >
            {{ errorVisor }}
          </p>
          <p
            v-else-if="!urlVisor"
            class="font-body-md text-body-md text-secondary"
          >
            Este documento aún no tiene ninguna versión cargada.
          </p>
          <iframe
            v-else
            :src="urlVisor"
            title="Vista previa del documento"
            class="w-full h-[70vh] rounded-primary border border-surface-alt bg-surface-container-low"
          ></iframe>
        </section>
      </div>

      <!-- Historial de versiones (RF-023) -->
      <section class="bg-pure-white rounded-primary border border-surface-alt overflow-hidden">
        <div class="p-gutter-lg border-b border-surface-alt">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Historial de versiones</h2>
          <p class="font-body-md text-body-md text-secondary mt-1">
            Todas las versiones siguen siendo consultables y descargables, no sólo la vigente.
          </p>
        </div>
        <div class="overflow-x-auto w-full">
          <table class="w-full min-w-[820px] text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low border-b border-surface-alt">
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase">
                  Versión
                </th>
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase">
                  Archivo
                </th>
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase">
                  Cargada por
                </th>
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase">
                  Integridad
                </th>
                <th
                  class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-tertiary uppercase text-right"
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-alt font-body-md text-body-md text-on-surface">
              <tr v-if="!documento.versiones || documento.versiones.length === 0">
                <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">
                  Aún no se ha cargado ninguna versión.
                </td>
              </tr>
              <tr
                v-for="version in documento.versiones"
                :key="version.id"
                class="hover:bg-surface-container-low transition-colors"
              >
                <td class="py-gutter-sm px-gutter-lg whitespace-nowrap">
                  <span class="font-semibold">v{{ version.numeroVersion }}</span>
                  <span
                    v-if="version.esVigente"
                    class="ml-2 inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm bg-secondary-container text-on-surface border border-secondary-fixed-dim"
                  >
                    Vigente
                  </span>
                </td>
                <td class="py-gutter-sm px-gutter-lg max-w-xs">
                  <span class="block truncate">{{ version.nombreArchivoOriginal }}</span>
                  <span class="text-secondary">
                    {{ formatearTamano(version.tamanoBytes) }}
                    <template v-if="version.numeroPaginas !== null">
                      · {{ version.numeroPaginas }} {{ version.numeroPaginas === 1 ? 'página' : 'páginas' }}
                    </template>
                  </span>
                  <span v-if="version.comentarioVersion" class="block text-secondary">
                    {{ version.comentarioVersion }}
                  </span>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-secondary">
                  <span class="block text-on-surface">{{ version.nombreUsuarioCarga ?? '—' }}</span>
                  {{ formatearFecha(version.fechaCarga) }}
                </td>
                <td class="py-gutter-sm px-gutter-lg text-secondary">
                  <span class="block">{{ version.algoritmoHash }}</span>
                  <!-- El hash completo va en `title`: 64 caracteres
                       ensancharían la tabla sin aportar a simple vista. -->
                  <code class="text-body-md" :title="version.hashArchivo">
                    {{ version.hashArchivo.slice(0, 12) }}…
                  </code>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-right space-x-1 whitespace-nowrap">
                  <button
                    type="button"
                    title="Ver esta versión"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                    @click="versionSeleccionada = version.numeroVersion"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">
                      visibility
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Descargar esta versión"
                    :disabled="descargando"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center disabled:opacity-40"
                    @click="descargar(version.numeroVersion, version.nombreArchivoOriginal)"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[20px]">
                      download
                    </span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Confirmación PREVIA a la transición de estado -->
      <ModalConfirmacion
        v-if="accionPendiente"
        :titulo="TEXTOS_ACCION[accionPendiente].titulo"
        :procesando="procesandoAccion"
        @cancelar="accionPendiente = null"
        @confirmar="confirmarAccion"
      >
        ¿Confirma que desea {{ TEXTOS_ACCION[accionPendiente].verbo }}
        <strong class="text-on-surface">{{ documento.titulo }}</strong
        >?
      </ModalConfirmacion>

      <!-- Confirmación PREVIA a la carga de la nueva versión -->
      <ModalConfirmacion
        v-if="mostrarModalVersion"
        titulo="Cargar nueva versión"
        :procesando="guardandoVersion"
        @cancelar="mostrarModalVersion = false"
        @confirmar="confirmarNuevaVersion"
      >
        ¿Confirma que desea cargar
        <strong class="text-on-surface">{{ archivoVersion?.archivo.name }}</strong>
        como versión {{ (documento.versionVigente?.numeroVersion ?? 0) + 1 }} de este documento?
      </ModalConfirmacion>
    </template>
  </div>
</template>
