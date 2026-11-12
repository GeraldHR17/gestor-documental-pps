<script setup lang="ts">
import { useMensajeCarga } from '@/composables/useMensajeCarga';

const { mensaje } = useMensajeCarga();
</script>

<template>
  <span role="status" aria-live="polite">
    <span class="sr-only">Cargando…</span>
    <span aria-hidden="true">{{ mensaje }}</span>
  </span>
</template>
