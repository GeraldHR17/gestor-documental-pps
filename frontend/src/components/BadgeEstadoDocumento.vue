<script setup lang="ts">
// Badge de estado de un documento (listado, detalle e Inicio).
//
// Publicado en verde, Borrador en amarillo e Inactivo en rojo, el mismo
// rojo que un registro Inactivo (spec-ajustes-niveles-y-estados, C-2). La
// forma y el texto son los de InsigniaEstado.
import { computed } from 'vue';
import InsigniaEstado from '@/components/InsigniaEstado.vue';
import type { TonoEstado } from '@/types/estado.types';
import { ETIQUETAS_ESTADO_DOCUMENTO } from '@/lib/documentos.config';
import type { EstadoDocumento } from '@/types/documento.types';

const props = defineProps<{ estado: EstadoDocumento }>();

const TONO_POR_ESTADO: Record<EstadoDocumento, TonoEstado> = {
  PUBLICADO: 'exito',
  BORRADOR: 'advertencia',
  INACTIVO: 'peligro',
};

const tono = computed(() => TONO_POR_ESTADO[props.estado]);
</script>

<template>
  <InsigniaEstado :tono="tono" :texto="ETIQUETAS_ESTADO_DOCUMENTO[estado]" />
</template>
