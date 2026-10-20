<script setup lang="ts">
// src/components/portal/ErrorPortal.vue
//
// Estado de error. Dos variantes, porque no son el mismo problema:
//
//   - Un 404 ("esta sección no está disponible") no se arregla
//     reintentando, así que se ofrece volver a la portada del portal.
//   - Cualquier otro error sí puede ser pasajero, y lo que hace falta es
//     un botón de reintentar.
//
// En pantalla nunca aparecen el código, la ruta ni la marca de tiempo del
// cuerpo del error: eso ya fue a la consola desde el composable.

import { RouterLink } from 'vue-router';
import { TEXTOS } from '@/lib/portalPublico.config';

defineProps<{
  mensaje: string;
  /** Un 404: no hay nada que reintentar. */
  noDisponible?: boolean;
}>();

defineEmits<{ (evento: 'reintentar'): void }>();
</script>

<template>
  <div
    role="alert"
    class="rounded-primary border border-outline-variant bg-surface-container-lowest p-gutter-lg text-center"
  >
    <span class="material-symbols-outlined text-3xl text-primary" aria-hidden="true">
      {{ noDisponible ? 'search_off' : 'cloud_off' }}
    </span>

    <p class="mt-2 font-headline-sm text-headline-sm text-on-surface">{{ mensaje }}</p>

    <div class="mt-gutter-sm flex justify-center">
      <RouterLink
        v-if="noDisponible"
        :to="{ name: 'portal-secciones' }"
        class="inline-flex h-touch-target items-center justify-center rounded-primary bg-primary-container px-gutter-lg font-label-sm text-label-sm text-pure-white transition-colors hover:bg-primary"
      >
        {{ TEXTOS.volverALaPortada }}
      </RouterLink>

      <button
        v-else
        type="button"
        class="inline-flex h-touch-target items-center justify-center gap-2 rounded-primary bg-primary-container px-gutter-lg font-label-sm text-label-sm text-pure-white transition-colors hover:bg-primary"
        @click="$emit('reintentar')"
      >
        <span class="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
        {{ TEXTOS.reintentar }}
      </button>
    </div>
  </div>
</template>
