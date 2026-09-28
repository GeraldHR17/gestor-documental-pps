<script setup lang="ts">
// Raíz de la aplicación. Toda la estructura visible la aportan las rutas:
// las públicas se pintan solas (login, recuperación, verificación) y las
// autenticadas se montan dentro de AppShellLayout.
//
// ToastContainer va aquí, fuera del RouterView, para que sea el mismo
// contenedor en toda la aplicación y los mensajes de resultado sobrevivan a
// los cambios de ruta.
import ToastContainer from '@/components/ToastContainer.vue';
</script>

<template>
  <RouterView />
  <ToastContainer />
</template>
