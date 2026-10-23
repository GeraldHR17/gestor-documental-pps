<script setup lang="ts">
// src/components/portal/VacioPortal.vue
//
// Estado vacío. No es un error y no debe parecerlo: que una subsección no
// tenga documentos todavía es normal en un índice de transparencia que se
// va llenando. Por eso va en gris y no en rojo, y explica en una línea
// que se puede volver más adelante.

defineProps<{
  titulo: string;
  detalle?: string;
  /** Material Symbols; por defecto, una carpeta vacía. */
  icono?: string;
}>();
</script>

<template>
  <div
    class="rounded-lg border border-dashed border-(--portal-borde) bg-(--portal-recuadro) p-gutter-lg text-center"
  >
    <span class="material-symbols-outlined text-3xl text-(--portal-texto-secundario)" aria-hidden="true">
      {{ icono ?? 'folder_open' }}
    </span>
    <p class="mt-2 text-body-lg font-bold text-(--portal-texto)">{{ titulo }}</p>
    <p v-if="detalle" class="mt-1 text-body-md text-(--portal-texto-secundario)">{{ detalle }}</p>
  </div>
</template>
