<script setup lang="ts">
// Asistente de registro de documento (CU-011) en tres pasos: Archivo ->
// Metadatos -> Revisión. Sólo aplica al alta; la edición de metadatos
// (CU-012) sigue en DocumentoFormularioView, que no involucra archivo.
//
// Qué hace cada botón (definido en el pliego del pulido, sección D.1):
//  - "Guardar borrador" (paso 2): registra en BORRADOR y sale del asistente.
//  - "Guardar y publicar" (paso 2): avanza al paso 3, NO publica todavía.
//  - "Confirmar y publicar" (paso 3): registra Y publica en una sola
//    operación de la API (CU-011 seguido de CU-014).
//
// Mismo patrón de UX que el resto: validación en tiempo real, modal de
// confirmación PREVIA, aviso de "salir sin guardar" y toast DESPUÉS.
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useDocumentos } from '@/composables/useDocumentos';
import { useClasificacionDocumental } from '@/composables/useClasificacionDocumental';
import { useAutenticacion } from '@/composables/useAutenticacion';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import SelectorMultiple from '@/components/SelectorMultiple.vue';
import ZonaCargaPdf from '@/components/ZonaCargaPdf.vue';
import { formatearTamano, type ArchivoPdfInspeccionado } from '@/lib/documentos.config';
import {
  LONGITUD_MAXIMA_DESCRIPCION_DOCUMENTO,
  LONGITUD_MAXIMA_TITULO_DOCUMENTO,
  validarAnioDocumento,
  validarDescripcionDocumento,
  validarTituloDocumento,
  bloquearNegativos,
} from '@/lib/validaciones';

type Paso = 1 | 2 | 3;

const router = useRouter();
const { registrar } = useDocumentos();
const clasificacion = useClasificacionDocumental();
const { usuario, tienePermiso } = useAutenticacion();
const { notificarExito, notificarError } = useNotificaciones();

const puedePublicar = computed(() => tienePermiso('documentos.publicar'));

const paso = ref<Paso>(1);
const cargando = ref(false);
const guardando = ref(false);
const error = ref<string | null>(null);

// ---------- Paso 1: archivo ----------

const archivoInspeccionado = ref<ArchivoPdfInspeccionado | null>(null);

// ---------- Paso 2: metadatos ----------

const titulo = ref('');
const descripcion = ref('');
const anio = ref(String(new Date().getFullYear()));
const idCategoriaRaiz = ref<number | null>(null);
const idSubseccion = ref<number | null>(null);
const idTipoDocumento = ref<number | null>(null);
// Precargada con la dependencia de la persona autenticada, pero editable:
// se puede registrar en nombre de otra dependencia o sin ninguna.
const idDependencia = ref<number | null>(usuario.value?.idDependencia ?? null);
const etiquetas = ref<number[]>([]);

const subseccionesDisponibles = computed(() =>
  clasificacion.subseccionesDe(idCategoriaRaiz.value),
);

const idCategoriaEfectiva = computed(() =>
  subseccionesDisponibles.value.length > 0 ? idSubseccion.value : idCategoriaRaiz.value,
);

watch(idCategoriaRaiz, (nueva, anterior) => {
  if (anterior !== null && nueva !== anterior) idSubseccion.value = null;
});

type CampoValidado = 'titulo' | 'descripcion' | 'anio' | 'categoria' | 'subseccion' | 'tipo';

const camposTocados = reactive<Record<CampoValidado, boolean>>({
  titulo: false,
  descripcion: false,
  anio: false,
  categoria: false,
  subseccion: false,
  tipo: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

const errores = computed<Record<CampoValidado, string | null>>(() => ({
  titulo: validarTituloDocumento(titulo.value),
  descripcion: validarDescripcionDocumento(descripcion.value),
  anio: validarAnioDocumento(anio.value),
  categoria: idCategoriaRaiz.value === null ? 'Debe seleccionar una categoría ITSP.' : null,
  subseccion:
    subseccionesDisponibles.value.length > 0 && idSubseccion.value === null
      ? 'Debe seleccionar una subsección.'
      : null,
  tipo: idTipoDocumento.value === null ? 'Debe seleccionar un tipo documental.' : null,
}));

function errorVisible(campo: CampoValidado): string | null {
  return camposTocados[campo] ? errores.value[campo] : null;
}

const metadatosValidos = computed(() => Object.values(errores.value).every((e) => e === null));

// ---------- Checklist "Requisitos para publicar" ----------
//
// Refleja el estado REAL del formulario: son exactamente los requisitos
// que exige la API para publicar (VP-03). La descripción no está porque
// no es obligatoria; la dependencia y las etiquetas tampoco.
const requisitos = computed(() => [
  { etiqueta: 'Archivo PDF válido', cumplido: archivoInspeccionado.value !== null },
  { etiqueta: 'Título y año', cumplido: errores.value.titulo === null && errores.value.anio === null },
  {
    etiqueta: 'Categoría ITSP',
    cumplido: errores.value.categoria === null && errores.value.subseccion === null,
  },
  { etiqueta: 'Tipo documental', cumplido: errores.value.tipo === null },
]);

const listoParaPublicar = computed(() => requisitos.value.every((r) => r.cumplido));

// ---------- Nombres para la revisión (paso 3) ----------

function nombreDe(lista: { id: number; nombre: string }[], id: number | null): string {
  return lista.find((fila) => fila.id === id)?.nombre ?? '—';
}

const resumen = computed(() => ({
  categoria: nombreDe(clasificacion.raicesSeleccionables.value, idCategoriaRaiz.value),
  subseccion: nombreDe(subseccionesDisponibles.value, idSubseccion.value),
  tipo: nombreDe(clasificacion.tiposDocumentos.value, idTipoDocumento.value),
  dependencia:
    idDependencia.value === null
      ? 'Sin dependencia'
      : nombreDe(clasificacion.dependencias.value, idDependencia.value),
  etiquetas: clasificacion.etiquetas.value
    .filter((etiqueta) => etiquetas.value.includes(etiqueta.id))
    .map((etiqueta) => etiqueta.nombre),
}));

// ---------- Cambios sin guardar ----------

function instantaneaActual(): string {
  return JSON.stringify({
    archivo: archivoInspeccionado.value?.archivo.name ?? null,
    titulo: titulo.value,
    descripcion: descripcion.value,
    anio: anio.value,
    idCategoriaRaiz: idCategoriaRaiz.value,
    idSubseccion: idSubseccion.value,
    idTipoDocumento: idTipoDocumento.value,
    idDependencia: idDependencia.value,
    etiquetas: [...etiquetas.value].sort((a, b) => a - b),
  });
}

const valoresIniciales = ref(instantaneaActual());
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

// ---------- Navegación entre pasos ----------

function irAMetadatos(): void {
  if (!archivoInspeccionado.value) return;
  paso.value = 2;
}

function irARevision(): void {
  // Marca todo como tocado para que, si algo falta, se vea en rojo.
  (Object.keys(camposTocados) as CampoValidado[]).forEach(marcarTocado);
  if (!metadatosValidos.value || !archivoInspeccionado.value) return;
  paso.value = 3;
}

function volverA(destino: Paso): void {
  paso.value = destino;
}

// ---------- Guardado ----------

type ModoGuardado = 'borrador' | 'publicar';
const modoPendiente = ref<ModoGuardado | null>(null);

function solicitarGuardado(modo: ModoGuardado): void {
  if (modo === 'borrador') {
    (Object.keys(camposTocados) as CampoValidado[]).forEach(marcarTocado);
    if (!metadatosValidos.value || !archivoInspeccionado.value) return;
  }
  modoPendiente.value = modo;
}

async function confirmarGuardado(): Promise<void> {
  const modo = modoPendiente.value;
  if (!modo || !archivoInspeccionado.value) return;
  if (idCategoriaEfectiva.value === null || idTipoDocumento.value === null) return;

  guardando.value = true;
  error.value = null;

  try {
    const documento = await registrar(
      {
        titulo: titulo.value.trim(),
        descripcion: descripcion.value.trim() || undefined,
        anio: Number(anio.value),
        idCategoriaItsp: idCategoriaEfectiva.value,
        idTipoDocumento: idTipoDocumento.value,
        idDependencia: idDependencia.value,
        etiquetas: etiquetas.value,
      },
      archivoInspeccionado.value.archivo,
      { publicarInmediatamente: modo === 'publicar' },
    );

    guardadoConExito.value = true;
    modoPendiente.value = null;
    notificarExito(
      modo === 'publicar'
        ? 'El documento se registró y publicó correctamente.'
        : 'El documento se guardó como borrador.',
    );
    router.push({ name: 'documento-detalle', params: { id: documento.id } });
  } catch (err) {
    const mensajePorDefecto =
      modo === 'publicar'
        ? 'No se pudo registrar y publicar el documento.'
        : 'No se pudo guardar el borrador.';
    error.value = obtenerMensajeError(err, mensajePorDefecto);
    notificarError(err, mensajePorDefecto);
    modoPendiente.value = null;
  } finally {
    guardando.value = false;
  }
}

function manejarCancelar(): void {
  router.push({ name: 'documentos' });
}

onMounted(async () => {
  cargando.value = true;
  try {
    await clasificacion.cargar();
    valoresIniciales.value = instantaneaActual();
  } finally {
    cargando.value = false;
  }
});

const PASOS: Array<{ numero: Paso; titulo: string; subtitulo: string }> = [
  { numero: 1, titulo: 'Archivo', subtitulo: 'PDF validado' },
  { numero: 2, titulo: 'Metadatos', subtitulo: 'Clasificación ITSP' },
  { numero: 3, titulo: 'Revisión', subtitulo: 'Confirmar y publicar' },
];
</script>

<template>
  <div
    class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen"
  >
    <div class="border-b border-surface-alt pb-gutter-sm">
      <h1
        class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
      >
        Nuevo documento
      </h1>
      <p class="font-body-lg text-body-lg text-secondary mt-2">
        Cargue el PDF, clasifíquelo y decida si queda como borrador o se publica de inmediato.
      </p>
    </div>

    <!-- Indicador de pasos -->
    <ol
      class="bg-surface-container-lowest rounded-primary border border-surface-alt grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-alt"
      aria-label="Pasos del registro"
    >
      <li
        v-for="item in PASOS"
        :key="item.numero"
        class="flex items-center gap-3 px-gutter-lg py-gutter-sm"
        :aria-current="paso === item.numero ? 'step' : undefined"
      >
        <span
          class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-label-sm text-label-sm"
          :class="
            paso > item.numero
              ? 'bg-panel text-pure-white'
              : paso === item.numero
                ? 'bg-primary-container text-pure-white'
                : 'bg-surface-container-high text-secondary'
          "
        >
          <span v-if="paso > item.numero" aria-hidden="true" class="material-symbols-outlined text-[18px]">
            check
          </span>
          <span v-else>{{ item.numero }}</span>
        </span>
        <div class="min-w-0">
          <p class="font-body-lg text-body-lg font-semibold text-on-surface">{{ item.titulo }}</p>
          <p class="font-body-md text-body-md text-secondary">{{ item.subtitulo }}</p>
        </div>
      </li>
    </ol>

    <div v-if="cargando" class="text-secondary font-body-lg text-body-lg">Cargando...</div>

    <div v-else class="grid grid-cols-1 xl:grid-cols-[1fr_20rem] gap-gutter-lg items-start">
      <!-- ================= Paso 1: Archivo ================= -->
      <section
        v-if="paso === 1"
        class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-lg"
      >
        <h2 class="font-headline-sm text-headline-sm text-on-surface">Archivo</h2>
        <ZonaCargaPdf
          v-model="archivoInspeccionado"
          mensaje-validacion="Validación superada: formato PDF permitido y tamaño dentro del límite institucional."
        />
        <div
          class="flex flex-col sm:flex-row items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-surface-alt"
        >
          <button
            type="button"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
            @click="manejarCancelar"
          >
            Cancelar
          </button>
          <button
            type="button"
            :disabled="!archivoInspeccionado"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            @click="irAMetadatos"
          >
            Continuar
          </button>
        </div>
      </section>

      <!-- ================= Paso 2: Metadatos ================= -->
      <form
        v-else-if="paso === 2"
        class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-lg"
        novalidate
        @submit.prevent="irARevision"
      >
        <h2 class="font-headline-sm text-headline-sm text-on-surface">Archivo y metadatos</h2>

        <ZonaCargaPdf
          v-model="archivoInspeccionado"
          mensaje-validacion="Validación superada: formato PDF permitido y tamaño dentro del límite institucional."
        />

        <div>
          <label for="titulo" class="block font-body-md text-body-md text-on-surface mb-2">
            Título del documento <span class="text-error" aria-hidden="true">*</span>
          </label>
          <input
            id="titulo"
            v-model="titulo"
            type="text"
            :maxlength="LONGITUD_MAXIMA_TITULO_DOCUMENTO"
            :aria-invalid="errorVisible('titulo') !== null"
            class="w-full h-touch-target px-3 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
            :class="
              errorVisible('titulo')
                ? 'border-error focus:border-error'
                : 'border-outline focus:border-on-surface'
            "
            @input="marcarTocado('titulo')"
            @blur="marcarTocado('titulo')"
          />
          <p v-if="errorVisible('titulo')" class="font-body-md text-body-md text-error mt-2">
            {{ errorVisible('titulo') }}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-gutter-lg">
          <div>
            <label for="categoria-raiz" class="block font-body-md text-body-md text-on-surface mb-2">
              Categoría ITSP <span class="text-error" aria-hidden="true">*</span>
            </label>
            <select
              id="categoria-raiz"
              v-model="idCategoriaRaiz"
              :aria-invalid="errorVisible('categoria') !== null"
              class="w-full h-touch-target px-3 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
              :class="errorVisible('categoria') ? 'border-error' : 'border-outline focus:border-on-surface'"
              @change="marcarTocado('categoria')"
              @blur="marcarTocado('categoria')"
            >
              <option :value="null">Seleccione una categoría</option>
              <option
                v-for="raiz in clasificacion.raicesSeleccionables.value"
                :key="raiz.id"
                :value="raiz.id"
              >
                {{ raiz.nombre }}
              </option>
            </select>
            <p v-if="errorVisible('categoria')" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('categoria') }}
            </p>
          </div>

          <div>
            <label for="subseccion" class="block font-body-md text-body-md text-on-surface mb-2">
              Subsección <span class="text-error" aria-hidden="true">*</span>
            </label>
            <select
              id="subseccion"
              v-model="idSubseccion"
              :disabled="subseccionesDisponibles.length === 0"
              :aria-invalid="errorVisible('subseccion') !== null"
              class="w-full h-touch-target px-3 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg disabled:opacity-60 disabled:cursor-not-allowed"
              :class="errorVisible('subseccion') ? 'border-error' : 'border-outline focus:border-on-surface'"
              @change="marcarTocado('subseccion')"
              @blur="marcarTocado('subseccion')"
            >
              <option :value="null">
                {{
                  idCategoriaRaiz === null
                    ? 'Seleccione primero una categoría'
                    : subseccionesDisponibles.length === 0
                      ? 'Esta categoría no tiene subsecciones'
                      : 'Seleccione una subsección'
                }}
              </option>
              <option
                v-for="subseccion in subseccionesDisponibles"
                :key="subseccion.id"
                :value="subseccion.id"
              >
                {{ subseccion.nombre }}
              </option>
            </select>
            <p v-if="errorVisible('subseccion')" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('subseccion') }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-gutter-lg">
          <div>
            <label for="tipo" class="block font-body-md text-body-md text-on-surface mb-2">
              Tipo documental <span class="text-error" aria-hidden="true">*</span>
            </label>
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

          <div>
            <label for="anio" class="block font-body-md text-body-md text-on-surface mb-2">
              Año <span class="text-error" aria-hidden="true">*</span>
            </label>
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
        </div>

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
          <p class="font-body-md text-body-md text-secondary mt-2">
            {{
              usuario?.idDependencia
                ? 'Precargada con su dependencia; puede cambiarla si registra en nombre de otra.'
                : 'Su cuenta no tiene dependencia asignada; puede elegir una si corresponde.'
            }}
          </p>
        </div>

        <SelectorMultiple
          v-model="etiquetas"
          :opciones="clasificacion.etiquetas.value"
          etiqueta-grupo="Palabras clave"
          texto-vacio="No hay etiquetas activas registradas en el catálogo."
        />

        <div>
          <label for="descripcion" class="block font-body-md text-body-md text-on-surface mb-2">
            Descripción pública <span class="text-secondary">(opcional)</span>
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

        <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
          {{ error }}
        </p>

        <div
          class="flex flex-col sm:flex-row items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-surface-alt"
        >
          <button
            type="button"
            class="w-full sm:w-auto h-touch-target px-gutter-lg font-label-sm text-label-sm text-on-surface underline hover:text-acento transition-colors"
            @click="manejarCancelar"
          >
            Cancelar
          </button>
          <button
            type="button"
            :disabled="guardando || !metadatosValidos || !archivoInspeccionado"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            @click="solicitarGuardado('borrador')"
          >
            Guardar borrador
          </button>
          <button
            v-if="puedePublicar"
            type="submit"
            :disabled="guardando || !listoParaPublicar"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Guardar y publicar
          </button>
        </div>
      </form>

      <!-- ================= Paso 3: Revisión ================= -->
      <section
        v-else
        class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-lg"
      >
        <h2 class="font-headline-sm text-headline-sm text-on-surface">Revisión</h2>
        <p class="font-body-md text-body-md text-secondary">
          Revise los datos antes de publicar. Al confirmar, el documento se registra y queda
          publicado de inmediato.
        </p>

        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm font-body-md text-body-md">
          <div class="sm:col-span-2">
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Archivo</dt>
            <dd class="text-on-surface">
              {{ archivoInspeccionado?.archivo.name }}
              <span class="text-secondary">
                · {{ formatearTamano(archivoInspeccionado?.archivo.size ?? 0) }}
                <template v-if="archivoInspeccionado?.numeroPaginas !== null">
                  · {{ archivoInspeccionado?.numeroPaginas }}
                  {{ archivoInspeccionado?.numeroPaginas === 1 ? 'página' : 'páginas' }}
                </template>
              </span>
            </dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Título</dt>
            <dd class="text-on-surface">{{ titulo }}</dd>
          </div>
          <div>
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Categoría ITSP</dt>
            <dd class="text-on-surface">
              <span class="text-secondary">{{ resumen.categoria }} ›</span> {{ resumen.subseccion }}
            </dd>
          </div>
          <div>
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Tipo documental</dt>
            <dd class="text-on-surface">{{ resumen.tipo }}</dd>
          </div>
          <div>
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Dependencia</dt>
            <dd class="text-on-surface">{{ resumen.dependencia }}</dd>
          </div>
          <div>
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Año</dt>
            <dd class="text-on-surface">{{ anio }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Palabras clave</dt>
            <dd class="flex flex-wrap gap-1 mt-1">
              <span v-if="resumen.etiquetas.length === 0" class="text-secondary">—</span>
              <span
                v-for="nombre in resumen.etiquetas"
                :key="nombre"
                class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm bg-surface-container-high text-on-surface border border-surface-dim"
              >
                {{ nombre }}
              </span>
            </dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-tertiary font-label-sm text-label-sm uppercase">Descripción pública</dt>
            <dd class="text-on-surface whitespace-pre-line">{{ descripcion.trim() || '—' }}</dd>
          </div>
        </dl>

        <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
          {{ error }}
        </p>

        <div
          class="flex flex-col sm:flex-row items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-surface-alt"
        >
          <button
            type="button"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
            @click="volverA(2)"
          >
            Volver
          </button>
          <button
            type="button"
            :disabled="guardando"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            @click="solicitarGuardado('publicar')"
          >
            Confirmar y publicar
          </button>
        </div>
      </section>

      <!-- ================= Panel lateral: requisitos ================= -->
      <aside
        class="bg-panel text-pure-white rounded-primary p-gutter-lg flex flex-col gap-gutter-sm xl:sticky xl:top-20"
        aria-label="Requisitos para publicar"
      >
        <h2 class="font-label-sm text-label-sm uppercase tracking-wide text-primary-fixed-dim">
          Requisitos para publicar
        </h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="requisito in requisitos"
            :key="requisito.etiqueta"
            class="flex items-center gap-3 font-body-md text-body-md"
          >
            <span
              class="w-5 h-5 rounded-full shrink-0 flex items-center justify-center border transition-colors"
              :class="requisito.cumplido ? 'bg-surface-container-lowest border-pure-white text-on-surface' : 'border-pure-white/50'"
              aria-hidden="true"
            >
              <span v-if="requisito.cumplido" class="material-symbols-outlined text-[14px]">check</span>
            </span>
            <span :class="requisito.cumplido ? '' : 'text-pure-white/70'">{{ requisito.etiqueta }}</span>
            <span class="sr-only">{{ requisito.cumplido ? 'cumplido' : 'pendiente' }}</span>
          </li>
        </ul>
        <p class="font-body-md text-body-md text-pure-white/70 pt-2 border-t border-pure-white/15">
          {{
            listoParaPublicar
              ? 'El documento cumple los requisitos y puede publicarse.'
              : 'Complete los requisitos para habilitar la publicación.'
          }}
        </p>
      </aside>
    </div>

    <!-- Confirmación PREVIA al guardado -->
    <ModalConfirmacion
      v-if="modoPendiente"
      :titulo="modoPendiente === 'publicar' ? 'Confirmar y publicar' : 'Guardar borrador'"
      :mensaje="
        modoPendiente === 'publicar'
          ? '¿Confirma que desea registrar este documento y publicarlo de inmediato?'
          : '¿Confirma que desea guardar este documento como borrador? Podrá publicarlo más adelante desde su detalle.'
      "
      :texto-confirmar="modoPendiente === 'publicar' ? 'Publicar' : 'Guardar'"
      :procesando="guardando"
      @cancelar="modoPendiente = null"
      @confirmar="confirmarGuardado"
    />

    <!-- Aviso de cambios sin guardar al intentar salir -->
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
