<script setup lang="ts">
// src/components/portal/EsqueletoPortal.vue
//
// Estado de carga. Es un esqueleto y no un "Cargando...": deja la página
// con la forma que va a tener, de modo que al llegar los datos nada salta
// de sitio. Los bloques son del color de los recuadros, nunca blancos:
// dentro del iframe oscuro, un bloque claro sería un destello.
//
// `aria-busy` y el texto para lector de pantalla van juntos a propósito:
// sin ellos, quien navega con lector oiría una región vacía y no sabría
// que hay algo en camino.

import { TEXTOS } from '@/lib/portalPublico.config';

withDefaults(
  defineProps<{
    /** `tarjetas` pinta recuadros en rejilla; `filas`, recuadros de documento en lista. */
    forma?: 'tarjetas' | 'filas';
    cuantos?: number;
  }>(),
  { forma: 'tarjetas', cuantos: 4 },
);
</script>

<template>
  <div aria-busy="true" aria-live="polite">
    <span class="sr-only">{{ TEXTOS.cargando }}</span>

    <ul
      class="grid gap-3"
      :class="forma === 'tarjetas' ? 'sm:grid-cols-2' : ''"
      role="presentation"
    >
      <li
        v-for="n in cuantos"
        :key="n"
        class="animate-pulse rounded-lg border border-(--portal-borde) bg-(--portal-recuadro) p-4"
      >
        <div class="h-5 w-2/3 rounded-sm bg-(--portal-esqueleto)"></div>
        <div class="mt-3 h-4 w-full rounded-sm bg-(--portal-esqueleto)"></div>
        <div class="mt-2 h-4 w-1/3 rounded-sm bg-(--portal-esqueleto)"></div>
      </li>
    </ul>
  </div>
</template>
