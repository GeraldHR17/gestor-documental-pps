<script setup lang="ts">
// Selección múltiple para las relaciones N:M del documento (dependencias y
// etiquetas). Se usa una lista de casillas dentro de una caja con scroll y
// no un `<select multiple>` nativo: ese exige mantener Ctrl presionado para
// añadir sin perder lo ya elegido, algo que no se ve en pantalla y que hace
// que la gente deseleccione sin querer.
import { computed } from 'vue';

interface OpcionSeleccionable {
  id: number;
  nombre: string;
}

const props = defineProps<{
  modelValue: number[];
  opciones: OpcionSeleccionable[];
  etiquetaGrupo: string;
  textoVacio: string;
  deshabilitado?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [valor: number[]] }>();

const seleccionadas = computed(() =>
  props.opciones.filter((opcion) => props.modelValue.includes(opcion.id)),
);

function alternar(id: number): void {
  if (props.deshabilitado) return;

  emit(
    'update:modelValue',
    props.modelValue.includes(id)
      ? props.modelValue.filter((seleccionado) => seleccionado !== id)
      : [...props.modelValue, id],
  );
}
</script>

<template>
  <fieldset :disabled="deshabilitado">
    <legend class="block font-body-md text-body-md text-on-surface mb-2">
      {{ etiquetaGrupo }} <span class="text-secondary">(opcional)</span>
    </legend>

    <p v-if="opciones.length === 0" class="font-body-md text-body-md text-secondary">
      {{ textoVacio }}
    </p>

    <template v-else>
      <div
        class="max-h-48 overflow-y-auto rounded-primary border border-outline bg-surface-container-lowest divide-y divide-surface-alt"
      >
        <label
          v-for="opcion in opciones"
          :key="opcion.id"
          class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-container-low transition-colors"
        >
          <input
            type="checkbox"
            class="w-4 h-4 accent-primary-container"
            :checked="modelValue.includes(opcion.id)"
            @change="alternar(opcion.id)"
          />
          <span class="font-body-md text-body-md text-on-surface">{{ opcion.nombre }}</span>
        </label>
      </div>

      <!-- Resumen de lo elegido: la caja tiene scroll, así que sin esto
           habría que recorrerla entera para saber qué está marcado. -->
      <div v-if="seleccionadas.length" class="flex flex-wrap gap-2 mt-2">
        <span
          v-for="opcion in seleccionadas"
          :key="opcion.id"
          class="inline-flex items-center gap-1 px-3 py-1 rounded-full font-label-sm text-label-sm bg-secondary-container text-on-surface border border-secondary-fixed-dim"
        >
          {{ opcion.nombre }}
          <button
            type="button"
            class="material-symbols-outlined text-[14px] leading-none hover:text-error"
            :aria-label="'Quitar ' + opcion.nombre"
            @click="alternar(opcion.id)"
          >
            close
          </button>
        </span>
      </div>
    </template>
  </fieldset>
</template>
