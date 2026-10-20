<script setup lang="ts">
// src/components/portal/EsqueletoPortal.vue
//
// Estado de carga. Es un esqueleto y no un "Cargando...": deja la página
// con la forma que va a tener, de modo que al llegar los datos nada salta
// de sitio.
//
// `aria-busy` y el texto para lector de pantalla van juntos a propósito:
// sin ellos, quien navega con lector oiría una región vacía y no sabría
// que hay algo en camino.

import { TEXTOS } from '@/lib/portalPublico.config';

withDefaults(
  defineProps<{
    /** `tarjetas` pinta recuadros en rejilla; `filas`, renglones de lista. */
    forma?: 'tarjetas' | 'filas';
    cuantos?: number;
  }>(),
  { forma: 'tarjetas', cuantos: 4 },
);
</script>

<template>
  <div aria-busy="true" aria-live="polite">
    <span class="sr-only">{{ TEXTOS.cargando }}</span>

    <ul v-if="forma === 'tarjetas'" class="grid gap-gutter-sm sm:grid-cols-2" role="presentation">
      <li
        v-for="n in cuantos"
        :key="n"
        class="rounded-primary border border-surface-alt bg-pure-white p-gutter-lg"
      >
        <div class="h-5 w-2/3 animate-pulse rounded-sm bg-surface-container-high"></div>
        <div class="mt-3 h-4 w-full animate-pulse rounded-sm bg-surface-container"></div>
        <div class="mt-2 h-4 w-1/3 animate-pulse rounded-sm bg-surface-container"></div>
      </li>
    </ul>

    <ul v-else class="divide-y divide-surface-alt" role="presentation">
      <li v-for="n in cuantos" :key="n" class="py-gutter-sm">
        <div class="h-5 w-3/4 animate-pulse rounded-sm bg-surface-container-high"></div>
        <div class="mt-3 flex gap-2">
          <div class="h-6 w-24 animate-pulse rounded-secondary bg-surface-container"></div>
          <div class="h-6 w-32 animate-pulse rounded-secondary bg-surface-container"></div>
        </div>
      </li>
    </ul>
  </div>
</template>
