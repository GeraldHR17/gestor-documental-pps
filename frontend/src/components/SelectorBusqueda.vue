<script setup lang="ts">
// Select con búsqueda (autocompletar) para elegir UN registro por su
// nombre. La persona escribe, se consulta el endpoint que corresponda con
// un pequeño retraso, y al elegir una opción el componente entrega sólo el
// identificador: el número nunca se muestra en pantalla.
//
// Quien lo usa aporta la función `buscar` (qué endpoint, cómo mapear) y,
// si hay un valor preseleccionado (por ejemplo desde la URL), la función
// `resolverEtiqueta` para mostrar su nombre sin que la persona tenga que
// volver a buscarlo.
//
// Una opción puede venir `deshabilitada` con su `motivo`: se ve en la
// lista, pero no se puede elegir. Así quien busca una categoría que no
// admite documentos entiende por qué, en vez de no encontrarla
// (spec-ajustes-niveles-y-estados, ajuste 4).
import { computed, onBeforeUnmount, ref, watch } from 'vue';

export interface OpcionBusqueda {
  id: number;
  etiqueta: string;
  /** Línea secundaria opcional, ej. el correo debajo del nombre. */
  detalle?: string;
  /** Visible pero no elegible. */
  deshabilitada?: boolean;
  /** Por qué no se puede elegir; se muestra debajo. */
  motivo?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    buscar: (texto: string) => Promise<OpcionBusqueda[]>;
    resolverEtiqueta?: (id: number) => Promise<string | null>;
    placeholder?: string;
    etiquetaAccesible: string;
    deshabilitado?: boolean;
    /** Texto cuando está deshabilitado, ej. "Elija primero un tipo de entidad". */
    placeholderDeshabilitado?: string;
    /** `id` de la entrada, para asociarla a un <label for>. */
    idEntrada?: string;
  }>(),
  {
    placeholder: 'Escriba para buscar...',
    deshabilitado: false,
    resolverEtiqueta: undefined,
    placeholderDeshabilitado: undefined,
    idEntrada: undefined,
  },
);

const emit = defineEmits<{ 'update:modelValue': [valor: number | null] }>();

const texto = ref('');
const etiquetaSeleccionada = ref<string | null>(null);
const opciones = ref<OpcionBusqueda[]>([]);
const abierto = ref(false);
const buscando = ref(false);
const indiceActivo = ref(-1);
const entrada = ref<HTMLInputElement | null>(null);

let temporizador: ReturnType<typeof setTimeout> | undefined;
// Descarta respuestas que llegan tarde: si se escribió "an" y luego "ana",
// la respuesta de "an" no debe pisar la de "ana".
let secuencia = 0;

const haySeleccion = computed(() => props.modelValue !== null);

async function consultar(): Promise<void> {
  const termino = texto.value.trim();
  const actual = ++secuencia;
  buscando.value = true;
  try {
    const resultado = await props.buscar(termino);
    if (actual !== secuencia) return;
    opciones.value = resultado;
    abierto.value = true;
    indiceActivo.value = resultado.length ? 0 : -1;
  } catch {
    if (actual === secuencia) opciones.value = [];
  } finally {
    if (actual === secuencia) buscando.value = false;
  }
}

function manejarEntrada(): void {
  if (props.deshabilitado) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(consultar, 300);
}

function manejarFoco(): void {
  if (props.deshabilitado || haySeleccion.value) return;
  // Al enfocar sin texto se muestran las primeras opciones, para que la
  // lista sirva también como un select normal cuando el catálogo es corto.
  void consultar();
}

function elegir(opcion: OpcionBusqueda): void {
  if (opcion.deshabilitada) return;
  etiquetaSeleccionada.value = opcion.etiqueta;
  texto.value = '';
  opciones.value = [];
  abierto.value = false;
  emit('update:modelValue', opcion.id);
}

function limpiar(): void {
  etiquetaSeleccionada.value = null;
  texto.value = '';
  opciones.value = [];
  abierto.value = false;
  emit('update:modelValue', null);
}

function manejarTecla(evento: KeyboardEvent): void {
  if (!abierto.value || opciones.value.length === 0) {
    if (evento.key === 'Escape') abierto.value = false;
    return;
  }
  if (evento.key === 'ArrowDown') {
    evento.preventDefault();
    indiceActivo.value = (indiceActivo.value + 1) % opciones.value.length;
  } else if (evento.key === 'ArrowUp') {
    evento.preventDefault();
    indiceActivo.value = (indiceActivo.value - 1 + opciones.value.length) % opciones.value.length;
  } else if (evento.key === 'Enter') {
    evento.preventDefault();
    const opcion = opciones.value[indiceActivo.value];
    if (opcion) elegir(opcion);
  } else if (evento.key === 'Escape') {
    abierto.value = false;
  }
}

function cerrarConRetraso(): void {
  // Se pospone para que el clic sobre una opción alcance a registrarse
  // antes de que la lista desaparezca por el blur del input.
  setTimeout(() => {
    abierto.value = false;
  }, 150);
}

// Valor preseleccionado desde fuera (ej. la URL): se resuelve su nombre.
watch(
  () => props.modelValue,
  async (valor) => {
    if (valor === null) {
      etiquetaSeleccionada.value = null;
      return;
    }
    if (etiquetaSeleccionada.value !== null) return;
    etiquetaSeleccionada.value = (await props.resolverEtiqueta?.(valor)) ?? 'Registro seleccionado';
  },
  { immediate: true },
);

// Si el contexto cambia (ej. otro tipo de entidad), quien usa el
// componente pone modelValue en null y aquí se limpia lo visible.
watch(
  () => props.deshabilitado,
  (deshabilitado) => {
    if (deshabilitado) {
      texto.value = '';
      opciones.value = [];
      abierto.value = false;
    }
  },
);

onBeforeUnmount(() => clearTimeout(temporizador));
</script>

<template>
  <div class="relative">
    <!-- Valor elegido: se muestra como una "ficha" con botón para quitarlo -->
    <div
      v-if="haySeleccion"
      class="h-touch-target px-3 rounded-secondary border border-on-surface bg-surface-container-lowest flex items-center gap-2 font-body-md text-body-md text-on-surface"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[18px] text-secondary">check</span>
      <span class="flex-1 min-w-0 truncate">{{ etiquetaSeleccionada ?? 'Cargando...' }}</span>
      <button
        type="button"
        class="shrink-0 w-8 h-8 rounded-secondary inline-flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
        :aria-label="'Quitar ' + etiquetaAccesible"
        :disabled="deshabilitado"
        @click="limpiar"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <template v-else>
      <input
        :id="idEntrada"
        ref="entrada"
        v-model="texto"
        type="text"
        role="combobox"
        autocomplete="off"
        :aria-label="etiquetaAccesible"
        :aria-expanded="abierto"
        aria-autocomplete="list"
        :disabled="deshabilitado"
        :placeholder="deshabilitado ? (placeholderDeshabilitado ?? placeholder) : placeholder"
        class="h-touch-target w-full px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md placeholder:text-secondary focus:border-2 focus:border-on-surface focus:outline-none disabled:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-70"
        @input="manejarEntrada"
        @focus="manejarFoco"
        @keydown="manejarTecla"
        @blur="cerrarConRetraso"
      />
      <ul
        v-if="abierto"
        role="listbox"
        class="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto bg-surface-container-lowest rounded-primary border border-surface-alt divide-y divide-surface-alt"
        style="box-shadow: var(--shadow-dropdown)"
      >
        <li v-if="buscando" class="px-3 py-2 font-body-md text-body-md text-secondary">Buscando...</li>
        <li v-else-if="opciones.length === 0" class="px-3 py-2 font-body-md text-body-md text-secondary">
          Sin resultados.
        </li>
        <li
          v-for="(opcion, indice) in opciones"
          v-else
          :key="opcion.id"
          role="option"
          :aria-selected="indice === indiceActivo"
          :aria-disabled="opcion.deshabilitada ? 'true' : undefined"
          class="px-3 py-2 font-body-md text-body-md"
          :class="[
            opcion.deshabilitada ? 'cursor-not-allowed text-secondary' : 'cursor-pointer text-on-surface',
            indice === indiceActivo ? 'bg-surface-container-low' : 'hover:bg-surface-container-low',
          ]"
          @mousedown.prevent="elegir(opcion)"
          @mousemove="indiceActivo = indice"
        >
          <!-- Sin truncar: una ruta de categorías larga tiene que leerse entera. -->
          <span class="block break-words">{{ opcion.etiqueta }}</span>
          <span v-if="opcion.detalle" class="block truncate text-secondary">{{ opcion.detalle }}</span>
          <span v-if="opcion.deshabilitada && opcion.motivo" class="block text-secondary italic">
            No disponible: {{ opcion.motivo }}
          </span>
        </li>
      </ul>
    </template>
  </div>
</template>
