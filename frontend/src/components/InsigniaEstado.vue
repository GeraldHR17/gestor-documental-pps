<script setup lang="ts">
// Insignia de estado: la única forma de píldora del sistema interno
// (DESIGN.md). Es la base de BadgeEstadoDocumento y BadgeEstadoRegistro;
// antes las mismas clases estaban copiadas en cada vista.
//
// Desde spec-ajustes-niveles-y-estados (decisión del PO) los estados
// llevan color: verde (éxito), amarillo (advertencia) y rojo (peligro).
// El texto se mantiene siempre: el color no es la única señal, y la
// insignia se lee igual sin distinguir colores. Los tokens tienen su
// variante para el modo oscuro en main.css.
//
// Las tablas atenúan las filas inactivas con opacity-60 en todas las
// celdas MENOS la `.celda-estado`: atenuada, la insignia «Inactivo»
// bajaría a 3:1 en modo claro, por debajo del 4.5:1 exigido.

import type { TonoEstado } from '@/types/estado.types';

const props = defineProps<{ tono: TonoEstado; texto: string }>();

// Clases completas, no armadas por concatenación: Tailwind solo genera las
// utilidades que encuentra escritas tal cual en el código.
const CLASES_POR_TONO: Record<TonoEstado, { insignia: string; punto: string }> = {
  exito: {
    insignia: 'bg-exito-contenedor text-on-exito-contenedor border-exito-borde',
    punto: 'bg-exito',
  },
  advertencia: {
    insignia: 'bg-advertencia-contenedor text-on-advertencia-contenedor border-advertencia-borde',
    punto: 'bg-advertencia',
  },
  peligro: {
    insignia: 'bg-peligro-contenedor text-on-peligro-contenedor border-peligro-borde',
    punto: 'bg-peligro',
  },
};
</script>

<template>
  <span
    class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border whitespace-nowrap"
    :class="CLASES_POR_TONO[props.tono].insignia"
  >
    <span
      class="w-1.5 h-1.5 rounded-full mr-1.5"
      :class="CLASES_POR_TONO[props.tono].punto"
      aria-hidden="true"
    ></span>
    {{ texto }}
  </span>
</template>
