<script setup lang="ts">
// Único punto de pintado de los mensajes de resultado. Se monta una sola vez
// en App.vue —fuera del RouterView— para que un aviso publicado justo antes
// de navegar (ej. "Sesión cerrada correctamente") no se pierda en el cambio
// de ruta.
import { useNotificaciones } from '@/composables/useNotificaciones';

const { notificaciones, descartar } = useNotificaciones();
</script>

<template>
  <!-- role="status" + aria-live="polite": el lector de pantalla anuncia el
       resultado cuando termina lo que esté leyendo, sin interrumpir. El
       contenedor existe siempre (aunque esté vacío) porque las regiones
       live deben estar en el DOM antes de recibir contenido. -->
  <div
    role="status"
    aria-live="polite"
    class="fixed bottom-gutter-lg right-gutter-lg z-50 flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none"
  >
    <div
      v-for="notificacion in notificaciones"
      :key="notificacion.id"
      class="pointer-events-auto flex items-start gap-2 rounded-primary border px-gutter-sm py-3"
      :class="
        notificacion.tipo === 'exito'
          ? 'bg-secondary-container text-on-secondary-container border-secondary-fixed-dim'
          : 'bg-error-container text-on-error-container border-error'
      "
      style="box-shadow: var(--shadow-dropdown)"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[20px] shrink-0">
        {{ notificacion.tipo === 'exito' ? 'check_circle' : 'error' }}
      </span>
      <p class="font-body-md text-body-md flex-1 min-w-0">{{ notificacion.mensaje }}</p>
      <button
        type="button"
        aria-label="Descartar mensaje"
        class="shrink-0 -my-1 -mr-1 w-8 h-8 rounded-secondary inline-flex items-center justify-center hover:bg-pure-white/40 transition-colors"
        @click="descartar(notificacion.id)"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  </div>
</template>
