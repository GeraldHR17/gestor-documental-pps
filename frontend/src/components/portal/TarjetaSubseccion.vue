<script setup lang="ts">
// src/components/portal/TarjetaSubseccion.vue
//
// Recuadro seleccionable de una subsección (RFP-02, RFP-03).
//
// Es un <RouterLink>, que genera un <a> de verdad, y no un <div @click>:
// así se activa con Enter sin escribir una línea de código, sale en la
// lista de enlaces del lector de pantalla y se puede abrir en otra
// pestaña. El recuadro entero es el área de pulsación, muy por encima de
// los 44 px que exige DESIGN.md.
//
// Aspecto: recuadro del Observatorio (spec-ajustes-posdespliegue §9.2).

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
      class="group flex h-full flex-col rounded-lg border border-(--portal-borde) bg-(--portal-recuadro) p-4 transition-colors hover:border-(--portal-contexto)"
    >
      <span class="flex items-start justify-between gap-3">
        <span class="text-body-lg font-bold text-(--portal-texto)">
          {{ subseccion.nombre }}
        </span>
        <span
          class="material-symbols-outlined shrink-0 text-(--portal-texto-secundario) transition-transform group-hover:translate-x-1"
          aria-hidden="true"
          >arrow_forward</span
        >
      </span>

      <span v-if="subseccion.descripcion" class="mt-2 text-body-md text-(--portal-texto-secundario)">
        {{ subseccion.descripcion }}
      </span>

      <span class="mt-auto pt-gutter-sm text-body-md text-(--portal-texto-secundario)">
        {{ describirCantidad(subseccion.cantidadDocumentos) }}
      </span>
    </RouterLink>
  </li>
</template>
