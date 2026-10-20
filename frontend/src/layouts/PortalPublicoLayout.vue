<script setup lang="ts">
// src/layouts/PortalPublicoLayout.vue
//
// Cáscara del portal público. NO es AppShellLayout: ese trae barra
// lateral, menú de usuario y cierre de sesión, que dentro del iframe
// serían a la vez inútiles y desconcertantes para un ciudadano que nunca
// ha iniciado sesión.
//
// El contenido va en una "tarjeta institucional" —superficie blanca sobre
// el gris claro del sistema, radio de 8 px, borde de 1 px y 24 px de
// margen interno— por una razón concreta: la portada de WordPress donde
// esto se embebe es casi negra, y sin un borde deliberado el panel claro
// parecería un recorte pegado encima en vez de un bloque colocado a
// propósito (spec 16.2).
//
// El encabezado propio con el nombre de la sección está porque el
// visitante puede llegar con scroll y ver solo este marco, sin el título
// que WordPress pinta más arriba: el bloque tiene que explicarse solo.

import { RouterView } from 'vue-router';
</script>

<template>
  <div class="min-h-screen bg-surface px-margin-mobile py-gutter-sm md:px-margin-desktop">
    <div
      class="mx-auto max-w-5xl rounded-primary border border-surface-alt bg-pure-white p-gutter-lg"
    >
      <RouterView />
    </div>

    <!-- Pie mínimo: identifica de dónde sale la información sin competir
         con la cabecera del sitio que contiene el iframe. -->
    <p class="mx-auto mt-gutter-sm max-w-5xl text-center font-body-md text-body-md text-secondary">
      Información publicada por la Municipalidad de Palmares
    </p>
  </div>
</template>
