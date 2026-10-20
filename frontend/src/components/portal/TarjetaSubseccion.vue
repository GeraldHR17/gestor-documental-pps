<script setup lang="ts">
// src/components/portal/TarjetaSubseccion.vue
//
// Recuadro seleccionable de una subsección (RFP-02, RFP-03).
//
// Es un <RouterLink>, que genera un <a> de verdad, y no un <div @click>:
// así se activa con Enter sin escribir una línea de código, sale en la
// lista de enlaces del lector de pantalla y se puede abrir en otra
// pestaña. La tarjeta entera es el área de pulsación, muy por encima de
// los 44 px que exige DESIGN.md.

import { RouterLink } from 'vue-router';
import { describirCantidad } from '@/lib/portalPublico.config';
import type { SubseccionPublicaDto } from '@/types/portalPublico.types';

defineProps<{
  subseccion: SubseccionPublicaDto;
  codigoSeccion: string;
}>();
</script>

<template>
  <li>
    <RouterLink
      :to="{
        name: 'portal-subseccion',
        params: { seccion: codigoSeccion.toLowerCase(), subseccion: subseccion.codigo.toLowerCase() },
      }"
      class="group flex h-full flex-col rounded-primary border border-surface-alt bg-pure-white p-gutter-lg transition-colors hover:border-outline hover:bg-surface-container-low"
    >
      <span class="flex items-start justify-between gap-3">
        <span class="font-headline-sm text-headline-sm text-on-surface">
          {{ subseccion.nombre }}
        </span>
        <span
          class="material-symbols-outlined shrink-0 text-primary transition-transform group-hover:translate-x-1"
          aria-hidden="true"
          >arrow_forward</span
        >
      </span>

      <span
        v-if="subseccion.descripcion"
        class="mt-2 font-body-md text-body-md text-secondary"
      >
        {{ subseccion.descripcion }}
      </span>

      <span class="mt-auto pt-gutter-sm font-label-sm text-label-sm text-secondary">
        {{ describirCantidad(subseccion.cantidadDocumentos) }}
      </span>
    </RouterLink>
  </li>
</template>
