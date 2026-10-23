<script setup lang="ts">
// src/components/portal/PildoraContexto.vue
//
// La píldora turquesa del Observatorio ("TICS"), aquí con el nombre del
// nivel superior: dice dónde se está aunque se haya llegado por un enlace
// directo de WordPress.
//
// Forma de píldora: excepción a DESIGN.md, que la reserva a las insignias
// de estado, válida SOLO en las vistas públicas porque replican otro
// sistema (P-3). Va siempre sobre la tarjeta y nunca dentro de un
// recuadro: el turquesa da 5.31:1 sobre la tarjeta, pero 4.29:1 sobre un
// recuadro, por debajo de AA para texto (spec-ajustes-posdespliegue 12.2).

defineProps<{ texto: string }>();
</script>

<template>
  <p
    class="inline-block rounded-full border border-(--portal-borde) px-3 py-1 text-xs font-semibold tracking-[0.04em] text-(--portal-contexto) uppercase"
  >
    {{ texto }}
  </p>
</template>
