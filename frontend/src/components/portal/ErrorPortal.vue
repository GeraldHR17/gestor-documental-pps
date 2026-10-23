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
//
// Botón en píldora roja, como el primario del Observatorio (P-3).

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
    class="rounded-lg border border-(--portal-borde) bg-(--portal-recuadro) p-gutter-lg text-center"
  >
    <span class="material-symbols-outlined text-3xl text-(--portal-error)" aria-hidden="true">
      {{ noDisponible ? 'search_off' : 'cloud_off' }}
    </span>

    <p class="mt-2 text-body-lg font-bold text-(--portal-texto)">{{ mensaje }}</p>

    <div class="mt-gutter-sm flex justify-center">
      <RouterLink
        v-if="noDisponible"
        :to="{ name: 'portal-secciones' }"
        class="inline-flex min-h-touch-target items-center justify-center rounded-full bg-(--portal-acento) px-gutter-lg text-base font-bold text-(--portal-texto) transition-colors hover:bg-(--portal-acento-hover)"
      >
        {{ TEXTOS.volverALaPortada }}
      </RouterLink>

      <button
        v-else
        type="button"
        class="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-full bg-(--portal-acento) px-gutter-lg text-base font-bold text-(--portal-texto) transition-colors hover:bg-(--portal-acento-hover)"
        @click="$emit('reintentar')"
      >
        <span class="material-symbols-outlined text-base" aria-hidden="true">refresh</span>
        {{ TEXTOS.reintentar }}
      </button>
    </div>
  </div>
</template>
