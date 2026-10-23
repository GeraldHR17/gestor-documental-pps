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
//
// Botones secundarios del Observatorio: píldora de contorno (P-3).

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
    class="mt-gutter-lg flex flex-wrap items-center justify-between gap-gutter-sm border-t border-(--portal-borde) pt-gutter-sm"
  >
    <p class="text-body-md text-(--portal-texto-secundario)" aria-live="polite">
      Documentos {{ desde }} a {{ hasta }} de {{ total }}
    </p>

    <div class="flex gap-2 max-[480px]:w-full max-[480px]:flex-col">
      <button
        type="button"
        :disabled="!hayAnterior || cargando"
        class="inline-flex min-h-touch-target items-center justify-center gap-1 rounded-full border border-(--portal-borde) px-gutter-sm text-base font-bold text-(--portal-texto) transition-colors hover:bg-(--portal-hover-secundario) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        @click="emitir('ir', pagina - 1)"
      >
        <span class="material-symbols-outlined text-base" aria-hidden="true">chevron_left</span>
        Anterior
      </button>

      <button
        type="button"
        :disabled="!haySiguiente || cargando"
        class="inline-flex min-h-touch-target items-center justify-center gap-1 rounded-full border border-(--portal-borde) px-gutter-sm text-base font-bold text-(--portal-texto) transition-colors hover:bg-(--portal-hover-secundario) disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        @click="emitir('ir', pagina + 1)"
      >
        Siguiente
        <span class="material-symbols-outlined text-base" aria-hidden="true">chevron_right</span>
      </button>
    </div>
  </nav>
</template>
