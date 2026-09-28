<script setup lang="ts">
// Badge de estado de un documento. Estaba duplicado en el listado y en el
// detalle; se extrajo aquí para que la pantalla de Inicio lo reutilice tal
// cual en vez de repetir las clases una tercera vez.
//
// Forma pill en neutros, según DESIGN.md: el rojo primario queda reservado
// a errores y acciones destacadas, nunca a un estado informativo.
import { computed } from 'vue';
import { ETIQUETAS_ESTADO_DOCUMENTO } from '@/lib/documentos.config';
import type { EstadoDocumento } from '@/types/documento.types';

const props = defineProps<{ estado: EstadoDocumento }>();

const publicado = computed(() => props.estado === 'PUBLICADO');
</script>

<template>
  <span
    class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border whitespace-nowrap"
    :class="
      publicado
        ? 'bg-secondary-container text-on-surface border-secondary-fixed-dim'
        : 'bg-surface-container-high text-on-surface border-surface-dim'
    "
  >
    <span
      class="w-1.5 h-1.5 rounded-full mr-1.5"
      :class="publicado ? 'bg-secondary' : 'bg-outline'"
    ></span>
    {{ ETIQUETAS_ESTADO_DOCUMENTO[estado] }}
  </span>
</template>
