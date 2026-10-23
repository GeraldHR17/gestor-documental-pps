<script setup lang="ts">
// Zona de carga del PDF: clic-para-seleccionar y arrastrar-y-soltar. Los
// dos caminos terminan en la misma función (`procesar`), que a su vez
// delega en `inspeccionarArchivoPdf`: así el archivo soltado pasa por
// exactamente las mismas comprobaciones que el elegido con clic —
// extensión, mime, tamaño y firma `%PDF-` — y no hay dos criterios.
//
// Cuando el archivo es válido, la zona se convierte en la tarjeta del
// archivo (nombre, tamaño, páginas, "carga completada") con el enlace
// "Reemplazar"; si no lo es, el motivo concreto aparece en rojo debajo.
import { computed, ref } from 'vue';
import {
  TAMANO_MAXIMO_ARCHIVO_MB,
  formatearTamano,
  inspeccionarArchivoPdf,
  type ArchivoPdfInspeccionado,
} from '@/lib/documentos.config';

const props = defineProps<{
  modelValue: ArchivoPdfInspeccionado | null;
  /** Texto de la tarjeta bajo la barra, ej. "Validación superada...". */
  mensajeValidacion?: string;
  deshabilitado?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [valor: ArchivoPdfInspeccionado | null] }>();

const entradaArchivo = ref<HTMLInputElement | null>(null);
const arrastrandoEncima = ref(false);
const inspeccionando = ref(false);
const error = ref<string | null>(null);

const resumenArchivo = computed(() => {
  if (!props.modelValue) return '';
  const { archivo, numeroPaginas } = props.modelValue;
  const paginas =
    numeroPaginas === null
      ? 'páginas no determinadas'
      : `${numeroPaginas} ${numeroPaginas === 1 ? 'página' : 'páginas'}`;
  return `${formatearTamano(archivo.size)} · ${paginas} · carga completada`;
});

async function procesar(archivo: File | null): Promise<void> {
  if (props.deshabilitado) return;

  inspeccionando.value = true;
  error.value = null;
  try {
    const inspeccion = await inspeccionarArchivoPdf(archivo);
    if (inspeccion.error) {
      error.value = inspeccion.error;
      emit('update:modelValue', null);
      return;
    }
    emit('update:modelValue', inspeccion.resultado ?? null);
  } finally {
    inspeccionando.value = false;
    // Se vacía el input para que volver a elegir el MISMO archivo dispare
    // `change` de nuevo (el navegador no lo emite si el valor no cambió).
    if (entradaArchivo.value) entradaArchivo.value.value = '';
  }
}

function manejarSeleccion(evento: Event): void {
  const entrada = evento.target as HTMLInputElement;
  void procesar(entrada.files?.[0] ?? null);
}

function manejarSoltar(evento: DragEvent): void {
  arrastrandoEncima.value = false;
  // Con varios archivos se toma el primero: el documento lleva un solo PDF.
  void procesar(evento.dataTransfer?.files?.[0] ?? null);
}

function abrirSelector(): void {
  if (!props.deshabilitado) entradaArchivo.value?.click();
}

function reemplazar(): void {
  emit('update:modelValue', null);
  error.value = null;
  abrirSelector();
}
</script>

<template>
  <div>
    <input
      ref="entradaArchivo"
      type="file"
      accept="application/pdf,.pdf"
      class="sr-only"
      aria-label="Seleccionar archivo PDF"
      :disabled="deshabilitado"
      @change="manejarSeleccion"
    />

    <!-- Tarjeta del archivo validado -->
    <div
      v-if="modelValue"
      class="rounded-primary border-2 border-dashed border-outline p-gutter-sm flex items-center gap-gutter-sm"
    >
      <div
        class="w-12 h-12 shrink-0 rounded-secondary bg-panel text-pure-white font-label-sm text-label-sm flex items-center justify-center"
        aria-hidden="true"
      >
        PDF
      </div>
      <div class="min-w-0 flex-1 flex flex-col gap-1">
        <p class="font-body-lg text-body-lg font-semibold text-on-surface truncate">
          {{ modelValue.archivo.name }}
        </p>
        <p class="font-body-md text-body-md text-secondary">{{ resumenArchivo }}</p>
        <!-- Barra "completada": el archivo ya está en memoria y validado;
             la subida real ocurre al guardar, y es una sola petición.
             El relleno usa on-surface (el color de la tinta) y no panel:
             en modo oscuro tiene que aclararse con el texto. -->
        <div class="h-1.5 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
          <div class="h-full w-full bg-on-surface"></div>
        </div>
      </div>
      <button
        type="button"
        class="shrink-0 font-label-sm text-label-sm text-on-surface underline hover:text-acento transition-colors"
        :disabled="deshabilitado"
        @click="reemplazar"
      >
        Reemplazar
      </button>
    </div>

    <!-- Zona de arrastre / clic -->
    <div
      v-else
      role="button"
      tabindex="0"
      :aria-disabled="deshabilitado"
      class="rounded-primary border-2 border-dashed p-gutter-lg flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors"
      :class="[
        error ? 'border-error' : arrastrandoEncima ? 'border-on-surface bg-surface-container-low' : 'border-outline hover:bg-surface-container-low',
        deshabilitado ? 'opacity-60 cursor-not-allowed' : '',
      ]"
      @click="abrirSelector"
      @keydown.enter.prevent="abrirSelector"
      @keydown.space.prevent="abrirSelector"
      @dragover.prevent="arrastrandoEncima = true"
      @dragenter.prevent="arrastrandoEncima = true"
      @dragleave.prevent="arrastrandoEncima = false"
      @drop.prevent="manejarSoltar"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[36px] text-secondary">
        upload_file
      </span>
      <p class="font-body-lg text-body-lg text-on-surface">
        {{ inspeccionando ? 'Verificando el archivo...' : 'Arrastre el PDF aquí o haga clic para seleccionarlo' }}
      </p>
      <p class="font-body-md text-body-md text-secondary">
        Sólo archivos PDF, hasta {{ TAMANO_MAXIMO_ARCHIVO_MB }} MB.
      </p>
    </div>

    <p v-if="error" role="alert" aria-live="assertive" class="font-body-md text-body-md text-error mt-2">
      {{ error }}
    </p>
    <p v-else-if="modelValue && mensajeValidacion" class="font-body-md text-body-md text-on-surface mt-2 flex items-center gap-2">
      <span aria-hidden="true" class="material-symbols-outlined text-[18px]">check_circle</span>
      {{ mensajeValidacion }}
    </p>
  </div>
</template>
