<script setup lang="ts">
// src/components/portal/MigasDePanPublicas.vue
//
// Navegación de retorno dentro del iframe (RFP-10). Importa más de lo que
// parece: el portal va embebido en una página de WordPress, así que el
// botón "atrás" del navegador puede sacar al visitante del sitio entero
// en vez de subir un nivel. Estas migas son el único camino de vuelta
// fiable.
//
// Va en <nav aria-label> porque sin la etiqueta un lector de pantalla
// anuncia "navegación" a secas y en la página hay más de una región.

import { RouterLink } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';

export interface Miga {
  texto: string;
  /** Sin destino = es la página actual, y se marca con aria-current. */
  destino?: RouteLocationRaw;
}

defineProps<{ migas: Miga[] }>();
</script>

<template>
  <nav aria-label="Ruta de navegación" class="mb-gutter-sm">
    <ol class="flex flex-wrap items-center gap-x-2 gap-y-1 font-body-md text-body-md">
      <li v-for="(miga, indice) in migas" :key="indice" class="flex items-center gap-x-2">
        <span
          v-if="indice > 0"
          class="material-symbols-outlined text-base text-secondary"
          aria-hidden="true"
          >chevron_right</span
        >

        <RouterLink
          v-if="miga.destino"
          :to="miga.destino"
          class="rounded-sm text-primary underline underline-offset-2 hover:text-primary-container"
        >
          {{ miga.texto }}
        </RouterLink>

        <span v-else aria-current="page" class="text-secondary">{{ miga.texto }}</span>
      </li>
    </ol>
  </nav>
</template>
