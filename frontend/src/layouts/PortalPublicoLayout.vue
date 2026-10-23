<script setup lang="ts">
// src/layouts/PortalPublicoLayout.vue
//
// Cáscara del portal público. NO es AppShellLayout: ese trae barra
// lateral, menú de usuario y cierre de sesión, que dentro del iframe
// serían a la vez inútiles y desconcertantes para un ciudadano que nunca
// ha iniciado sesión.
//
// Estilo del Observatorio Municipal de Datos (spec-ajustes-posdespliegue
// §9.2, que sustituye al "panel claro" de spec-portal-publico §16): la
// portada de WordPress donde esto se embebe es casi negra y el
// Observatorio ya vive ahí con tarjeta gris oscuro, recuadros con borde
// claro, botones rojos redondeados y Poppins. El portal copia ese aspecto
// para no parecer un recorte de otro sitio.
//
// - `tema-portal` declara las variables --portal-* (main.css). No redefine
//   ningún token global: el modo oscuro del sistema interno no lo toca.
// - El acento #ba0911 es el del Observatorio, distinto a propósito del
//   #d30505 interno (C-7).
// - La tarjeta mide como máximo 820 px (D-10): con 560, como el
//   Observatorio, los botones de cada documento caerían siempre debajo y
//   la lista sería el doble de alta en un iframe de 580 px de alto.
// - Poppins se importa SOLO aquí: el CSS de la fuente va en el chunk del
//   portal y el sistema interno no la descarga.
//
// El encabezado propio de cada vista está porque el visitante puede llegar
// con scroll y ver solo este marco, sin el título que WordPress pinta más
// arriba: el bloque tiene que explicarse solo.

import { RouterView } from 'vue-router';

import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
</script>

<template>
  <div class="tema-portal min-h-screen bg-(--portal-fondo) p-5 max-[480px]:p-3">
    <div
      class="mx-auto w-full max-w-[820px] rounded-2xl border border-(--portal-borde) bg-(--portal-tarjeta) p-7 shadow-(--portal-sombra) max-[480px]:rounded-[14px] max-[480px]:p-5"
    >
      <RouterView />
    </div>

    <!-- Pie mínimo: identifica de dónde sale la información sin competir
         con la cabecera del sitio que contiene el iframe. -->
    <p
      class="mx-auto mt-gutter-sm max-w-[820px] text-center text-body-md text-(--portal-texto-secundario)"
    >
      Información publicada por la Municipalidad de Palmares
    </p>
  </div>
</template>
