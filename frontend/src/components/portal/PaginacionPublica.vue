<script setup lang="ts">
// src/components/portal/PaginacionPublica.vue
//
// "Anterior / Siguiente" sobre la paginación que ya trae el backend
// (página, límite y total). No se inventa nada en el cliente.
//
// Los botones se DESHABILITAN en los extremos en vez de ocultarse: un
// control que aparece y desaparece mueve el resto de la página y, en
// teclado, cambia el orden de tabulación de una pulsación a la
// siguiente. El resumen va en aria-live para que al cambiar de página el
// lector anuncie dónde quedó, que es la única pista que tiene.

import { computed } from 'vue';

const props = defineProps<{
  pagina: number;
  limite: number;
  total: number;
  cargando?: boolean;
}>();

const emitir = defineEmits<{ (evento: 'ir', pagina: number): void }>();

const totalPaginas = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.limite))));
const hayAnterior = computed(() => props.pagina > 1);
const haySiguiente = computed(() => props.pagina < totalPaginas.value);

const desde = computed(() => (props.total === 0 ? 0 : (props.pagina - 1) * props.limite + 1));
const hasta = computed(() => Math.min(props.total, props.pagina * props.limite));
</script>

<template>
  <nav
    v-if="totalPaginas > 1"
    aria-label="Paginación de documentos"
    class="mt-gutter-lg flex flex-wrap items-center justify-between gap-gutter-sm border-t border-surface-alt pt-gutter-sm"
  >
    <p class="font-body-md text-body-md text-secondary" aria-live="polite">
      Documentos {{ desde }} a {{ hasta }} de {{ total }}
    </p>

    <div class="flex gap-2">
      <button
        type="button"
        :disabled="!hayAnterior || cargando"
        class="inline-flex h-touch-target items-center justify-center gap-1 rounded-primary border border-secondary bg-pure-white px-gutter-sm font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:border-outline-variant disabled:text-secondary disabled:opacity-60"
        @click="emitir('ir', pagina - 1)"
      >
        <span class="material-symbols-outlined text-base" aria-hidden="true">chevron_left</span>
        Anterior
      </button>

      <button
        type="button"
        :disabled="!haySiguiente || cargando"
        class="inline-flex h-touch-target items-center justify-center gap-1 rounded-primary border border-secondary bg-pure-white px-gutter-sm font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:border-outline-variant disabled:text-secondary disabled:opacity-60"
        @click="emitir('ir', pagina + 1)"
      >
        Siguiente
        <span class="material-symbols-outlined text-base" aria-hidden="true">chevron_right</span>
      </button>
    </div>
  </nav>
</template>
