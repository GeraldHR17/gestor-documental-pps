<script setup lang="ts">
// Badge Activo/Inactivo de cualquier registro del sistema interno:
// usuarios, catálogos planos y categorías ITSP. Activo en verde e
// Inactivo en rojo (spec-ajustes-niveles-y-estados, C-1). Antes estaba
// copiado, con las mismas clases, en cada una de esas vistas.
import InsigniaEstado from '@/components/InsigniaEstado.vue';

defineProps<{ estado: 'ACTIVO' | 'INACTIVO' }>();
</script>

<template>
  <InsigniaEstado
    :tono="estado === 'ACTIVO' ? 'exito' : 'peligro'"
    :texto="estado === 'ACTIVO' ? 'Activo' : 'Inactivo'"
  />
</template>
