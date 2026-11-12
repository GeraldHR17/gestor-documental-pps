<script setup lang="ts">
// Raíz de la aplicación. Toda la estructura visible la aportan las rutas:
// las públicas se pintan solas (login, recuperación, verificación) y las
// autenticadas se montan dentro de AppShellLayout.
//
// ToastContainer va aquí, fuera del RouterView, para que sea el mismo
// contenedor en toda la aplicación y los mensajes de resultado sobrevivan a
// los cambios de ruta.
import ToastContainer from '@/components/ToastContainer.vue';
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import PanelAcercaDe from '@/components/PanelAcercaDe.vue';
import { usePanelAcercaDe } from '@/composables/usePanelAcercaDe';

const route = useRoute();
const panelAcercaDe = usePanelAcercaDe();
const enPortalPublico = computed(() => route.meta.sinSesion === true);

function alPresionarTecla(evento: KeyboardEvent): void {
  if (enPortalPublico.value) return;
  panelAcercaDe.procesarTecla(evento);
}

onMounted(() => window.addEventListener('keydown', alPresionarTecla));
onBeforeUnmount(() => window.removeEventListener('keydown', alPresionarTecla));
</script>

<template>
  <RouterView />
  <ToastContainer />
  <PanelAcercaDe
    v-if="panelAcercaDe.abierto.value && !enPortalPublico"
    @cerrar="panelAcercaDe.cerrar"
  />
</template>
