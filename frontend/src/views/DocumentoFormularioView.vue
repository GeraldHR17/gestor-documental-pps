<script setup lang="ts">
// Edición de metadatos de un documento (CU-012). El alta va aparte, en el
// asistente de tres pasos (DocumentoRegistroView), porque involucra cargar
// el archivo; aquí el PDF no se toca: cambiarlo es crear una versión nueva
// (RF-022) desde el detalle.
//
// Mismo patrón de UX que el resto: validación en tiempo real, modal de
// confirmación PREVIA al guardado, aviso de "salir sin guardar" y toast.
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useDocumentos } from '@/composables/useDocumentos';
import { useClasificacionDocumental } from '@/composables/useClasificacionDocumental';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import SelectorMultiple from '@/components/SelectorMultiple.vue';
import SelectorBusqueda, { type OpcionBusqueda } from '@/components/SelectorBusqueda.vue';
import documentosService from '@/services/documentos.service';
import {
  LONGITUD_MAXIMA_DESCRIPCION_DOCUMENTO,
  LONGITUD_MAXIMA_TITULO_DOCUMENTO,
  validarAnioDocumento,
  validarDescripcionDocumento,
  validarTituloDocumento,
  bloquearNegativos,
} from '@/lib/validaciones';

const props = defineProps<{ id: string }>();
const router = useRouter();

const { actualizar } = useDocumentos();
const clasificacion = useClasificacionDocumental();
const { notificarExito, notificarError } = useNotificaciones();

const idDocumento = computed(() => Number(props.id));

const cargando = ref(false);
const guardando = ref(false);
const error = ref<string | null>(null);

const titulo = ref('');
const descripcion = ref('');
const anio = ref(String(new Date().getFullYear()));
const idCategoria = ref<number | null>(null);
const idTipoDocumento = ref<number | null>(null);
const idDependencia = ref<number | null>(null);
const etiquetas = ref<number[]>([]);


// ---------- Validación en tiempo real ----------

type CampoValidado = 'titulo' | 'descripcion' | 'anio' | 'categoria' | 'tipo';

const camposTocados = reactive<Record<CampoValidado, boolean>>({
  titulo: false,
  descripcion: false,
  anio: false,
  categoria: false,
  tipo: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

const errores = computed<Record<CampoValidado, string | null>>(() => ({
  titulo: validarTituloDocumento(titulo.value),
  descripcion: validarDescripcionDocumento(descripcion.value),
  anio: validarAnioDocumento(anio.value),
  categoria: validarCategoria(),
  tipo: idTipoDocumento.value === null ? 'Debe seleccionar un tipo documental.' : null,
}));

/**
 * Una sola categoría, de cualquier nivel (spec-ajustes-niveles-y-estados
 * §9.3): reemplaza la cascada raíz → subsección. Las que no admiten
 * documentos aparecen deshabilitadas con el motivo.
 */
function validarCategoria(): string | null {
  if (idCategoria.value === null) return 'Debe seleccionar una categoría ITSP.';
  const motivo = clasificacion.motivoNoClasificable(idCategoria.value);
  return motivo ? `Esta categoría no admite documentos: ${motivo}.` : null;
}

function buscarCategorias(texto: string): Promise<OpcionBusqueda[]> {
  return Promise.resolve(
    clasificacion.buscarEn(clasificacion.opcionesClasificacion.value, texto),
  );
}

function resolverRutaCategoria(id: number): Promise<string | null> {
  return Promise.resolve(clasificacion.rutaDe(id));
}

watch(idCategoria, () => marcarTocado('categoria'));

function errorVisible(campo: CampoValidado): string | null {
  return camposTocados[campo] ? errores.value[campo] : null;
}

const formularioValido = computed(() => Object.values(errores.value).every((e) => e === null));

// ---------- Cambios sin guardar ----------

function instantaneaActual(): string {
  return JSON.stringify({
    titulo: titulo.value,
    descripcion: descripcion.value,
    anio: anio.value,
    idCategoria: idCategoria.value,
    idTipoDocumento: idTipoDocumento.value,
    idDependencia: idDependencia.value,
    etiquetas: [...etiquetas.value].sort((a, b) => a - b),
  });
}

const valoresIniciales = ref<string>(instantaneaActual());
const hayCambiosSinGuardar = computed(() => instantaneaActual() !== valoresIniciales.value);
const guardadoConExito = ref(false);

const mostrarModalSalir = ref(false);
let resolverSalida: ((salir: boolean) => void) | null = null;

onBeforeRouteLeave(async () => {
  if (guardadoConExito.value || !hayCambiosSinGuardar.value) return true;
  mostrarModalSalir.value = true;
  return await new Promise<boolean>((resolve) => {
    resolverSalida = resolve;
  });
});

function responderSalida(salir: boolean): void {
  mostrarModalSalir.value = false;
  resolverSalida?.(salir);
  resolverSalida = null;
}

// ---------- Carga y guardado ----------

async function cargarDatosIniciales(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    // Los catálogos primero: sin el árbol cargado no se puede ubicar la
    // categoría del documento en su par (raíz, subsección).
    await clasificacion.cargar();
    const documento = await documentosService.obtener(idDocumento.value);

    titulo.value = documento.titulo;
    descripcion.value = documento.descripcion ?? '';
    anio.value = String(documento.anio);
    idTipoDocumento.value = documento.idTipoDocumento;
    idDependencia.value = documento.idDependencia;
    etiquetas.value = documento.etiquetas.map((fila) => fila.id);

    idCategoria.value = documento.idCategoriaItsp;

    valoresIniciales.value = instantaneaActual();
  } catch (err) {
    error.value = obtenerMensajeError(err, 'No se pudo cargar la información del documento.');
  } finally {
    cargando.value = false;
  }
}

const mostrarModalGuardar = ref(false);

function solicitarGuardado(): void {
  if (!formularioValido.value) return;
  mostrarModalGuardar.value = true;
}

async function confirmarGuardado(): Promise<void> {
  if (idCategoria.value === null || idTipoDocumento.value === null) return;

  guardando.value = true;
  error.value = null;

  try {
    const documento = await actualizar(idDocumento.value, {
      titulo: titulo.value.trim(),
      descripcion: descripcion.value.trim() || undefined,
      anio: Number(anio.value),
      idCategoriaItsp: idCategoria.value,
      idTipoDocumento: idTipoDocumento.value,
      idDependencia: idDependencia.value,
      etiquetas: etiquetas.value,
    });

    guardadoConExito.value = true;
    mostrarModalGuardar.value = false;
    notificarExito('Cambios guardados correctamente.');
    router.push({ name: 'documento-detalle', params: { id: documento.id } });
  } catch (err) {
    const mensajePorDefecto = 'No se pudo actualizar el documento.';
    error.value = obtenerMensajeError(err, mensajePorDefecto);
    notificarError(err, mensajePorDefecto);
    mostrarModalGuardar.value = false;
  } finally {
    guardando.value = false;
  }
}

function manejarCancelar(): void {
  router.push({ name: 'documento-detalle', params: { id: idDocumento.value } });
}

onMounted(cargarDatosIniciales);
</script>

<template>
  <div
    class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen"
  >
    <div class="border-b border-surface-alt pb-gutter-sm">
      <h1
        class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
      >
        Editar documento
      </h1>
      <p class="font-body-lg text-body-lg text-secondary mt-2">
        Los cambios afectan sólo a los metadatos; las versiones cargadas se conservan.
      </p>
    </div>

    <div v-if="cargando" class="text-secondary font-body-lg text-body-lg">Cargando...</div>

    <form
      v-else
      class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-lg max-w-3xl"
      novalidate
      @submit.prevent="solicitarGuardado"
    >
      <div>
        <label for="titulo" class="block font-body-md text-body-md text-on-surface mb-2">Título</label>
        <input
          id="titulo"
          v-model="titulo"
          type="text"
          :maxlength="LONGITUD_MAXIMA_TITULO_DOCUMENTO"
          :aria-invalid="errorVisible('titulo') !== null"
          class="w-full h-touch-target px-3 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
          :class="errorVisible('titulo') ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface'"
          @input="marcarTocado('titulo')"
          @blur="marcarTocado('titulo')"
        />
        <p v-if="errorVisible('titulo')" class="font-body-md text-body-md text-error mt-2">
          {{ errorVisible('titulo') }}
        </p>
        <p v-else class="font-body-md text-body-md text-secondary mt-2">
          Máximo {{ LONGITUD_MAXIMA_TITULO_DOCUMENTO }} caracteres.
        </p>
      </div>

      <div>
        <label for="descripcion" class="block font-body-md text-body-md text-on-surface mb-2">
          Descripción <span class="text-secondary">(opcional)</span>
        </label>
        <textarea
          id="descripcion"
          v-model="descripcion"
          rows="3"
          :maxlength="LONGITUD_MAXIMA_DESCRIPCION_DOCUMENTO"
          :aria-invalid="errorVisible('descripcion') !== null"
          class="w-full px-3 py-2 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
          :class="errorVisible('descripcion') ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface'"
          @input="marcarTocado('descripcion')"
          @blur="marcarTocado('descripcion')"
        ></textarea>
        <p v-if="errorVisible('descripcion')" class="font-body-md text-body-md text-error mt-2">
          {{ errorVisible('descripcion') }}
        </p>
        <p v-else class="font-body-md text-body-md text-secondary mt-2">
          {{ descripcion.length }} / {{ LONGITUD_MAXIMA_DESCRIPCION_DOCUMENTO }} caracteres.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-gutter-lg">
        <div>
          <label for="anio" class="block font-body-md text-body-md text-on-surface mb-2">Año</label>
          <input
            id="anio"
            v-model="anio"
            type="number"
            inputmode="numeric"
            min="0"
            @keydown="bloquearNegativos"
            :aria-invalid="errorVisible('anio') !== null"
            class="w-full h-touch-target px-3 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
            :class="errorVisible('anio') ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface'"
            @input="marcarTocado('anio')"
            @blur="marcarTocado('anio')"
          />
          <p v-if="errorVisible('anio')" class="font-body-md text-body-md text-error mt-2">
            {{ errorVisible('anio') }}
          </p>
        </div>

        <div>
          <label for="tipo" class="block font-body-md text-body-md text-on-surface mb-2">Tipo documental</label>
          <select
            id="tipo"
            v-model="idTipoDocumento"
            :aria-invalid="errorVisible('tipo') !== null"
            class="w-full h-touch-target px-3 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
            :class="errorVisible('tipo') ? 'border-error' : 'border-outline focus:border-on-surface'"
            @change="marcarTocado('tipo')"
            @blur="marcarTocado('tipo')"
          >
            <option :value="null">Seleccione un tipo</option>
            <option v-for="tipo in clasificacion.tiposDocumentos.value" :key="tipo.id" :value="tipo.id">
              {{ tipo.nombre }}
            </option>
          </select>
          <p v-if="errorVisible('tipo')" class="font-body-md text-body-md text-error mt-2">
            {{ errorVisible('tipo') }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-gutter-lg">
        <div class="sm:col-span-2">
          <label for="categoria" class="block font-body-md text-body-md text-on-surface mb-2">
            Categoría ITSP
          </label>
          <SelectorBusqueda
            v-model="idCategoria"
            id-entrada="categoria"
            etiqueta-accesible="Categoría ITSP"
            placeholder="Escriba para buscar o elija de la lista"
            :buscar="buscarCategorias"
            :resolver-etiqueta="resolverRutaCategoria"
          />
          <p v-if="errorVisible('categoria')" class="font-body-md text-body-md text-error mt-2">
            {{ errorVisible('categoria') }}
          </p>
          <p v-else class="font-body-md text-body-md text-secondary mt-2">
            Se muestra la ruta completa. Las categorías que no admiten documentos aparecen
            deshabilitadas, con el motivo.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-gutter-lg">
        <div>
          <label for="dependencia" class="block font-body-md text-body-md text-on-surface mb-2">
            Dependencia <span class="text-secondary">(opcional)</span>
          </label>
          <select
            id="dependencia"
            v-model="idDependencia"
            class="w-full h-touch-target px-3 border border-outline rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg"
          >
            <option :value="null">Sin dependencia</option>
            <option v-for="dependencia in clasificacion.dependencias.value" :key="dependencia.id" :value="dependencia.id">
              {{ dependencia.nombre }}
            </option>
          </select>
        </div>
        <SelectorMultiple
          v-model="etiquetas"
          :opciones="clasificacion.etiquetas.value"
          etiqueta-grupo="Etiquetas"
          texto-vacio="No hay etiquetas activas registradas en el catálogo."
        />
      </div>

      <p class="font-body-md text-body-md text-secondary bg-surface-container-low rounded-primary p-gutter-sm">
        Para reemplazar el archivo debe cargar una nueva versión desde el detalle del documento; el
        historial se conserva completo.
      </p>

      <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
        {{ error }}
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-surface-alt">
        <button
          type="button"
          class="w-full sm:w-auto h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
          @click="manejarCancelar"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="guardando || !formularioValido"
          class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </button>
      </div>
    </form>

    <ModalConfirmacion
      v-if="mostrarModalGuardar"
      titulo="Guardar cambios"
      mensaje="¿Confirma que desea guardar los cambios de este documento?"
      :procesando="guardando"
      @cancelar="mostrarModalGuardar = false"
      @confirmar="confirmarGuardado"
    />

    <ModalConfirmacion
      v-if="mostrarModalSalir"
      titulo="Cambios sin guardar"
      mensaje="Tiene cambios sin guardar. Si sale ahora, esta información se perderá. ¿Desea salir de todas formas?"
      texto-confirmar="Salir"
      texto-cancelar="Cancelar"
      @cancelar="responderSalida(false)"
      @confirmar="responderSalida(true)"
    />
  </div>
</template>
