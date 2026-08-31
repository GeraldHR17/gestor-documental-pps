<script setup lang="ts">
// RF-21 / RF-23 — Destino del enlace enviado por CorreoService
// (`${FRONTEND_URL}/verificar-correo?token=...`). Confirma el token al
// montar; si ya venció, permite pedir uno nuevo sin salir de la pantalla.
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import authService from '@/services/auth.service';

const route = useRoute();

type EstadoVerificacion = 'verificando' | 'exito' | 'fallo' | 'sin-token';

const estado = ref<EstadoVerificacion>('verificando');
const mensaje = ref('');
const correoReenvio = ref('');
const reenviando = ref(false);
const mensajeReenvio = ref<string | null>(null);

onMounted(async () => {
  const token = route.query.token;
  if (typeof token !== 'string' || !token) {
    estado.value = 'sin-token';
    mensaje.value = 'El enlace de verificación está incompleto.';
    return;
  }

  try {
    const respuesta = await authService.confirmarVerificacionCorreo({ token });
    estado.value = 'exito';
    mensaje.value = respuesta.mensaje;
  } catch (excepcion) {
    const conRespuesta = excepcion as { response?: { data?: { mensaje?: string } } };
    estado.value = 'fallo';
    mensaje.value =
      conRespuesta?.response?.data?.mensaje ??
      'El enlace de verificación no es válido o ha expirado.';
  }
});

async function manejarReenvio(): Promise<void> {
  reenviando.value = true;
  try {
    const respuesta = await authService.reenviarVerificacionCorreo({ correo: correoReenvio.value });
    mensajeReenvio.value = respuesta.mensaje;
  } catch {
    mensajeReenvio.value = 'No se pudo procesar la solicitud. Intente más tarde.';
  } finally {
    reenviando.value = false;
  }
}
</script>

<template>
  <div
    class="bg-surface-alt text-on-background min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop font-body-lg"
  >
    <div
      class="w-full max-w-md bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col items-center gap-4 text-center"
    >
      <span
        aria-hidden="true"
        class="material-symbols-outlined text-5xl"
        :class="estado === 'exito' ? 'text-primary' : estado === 'verificando' ? 'text-secondary' : 'text-error'"
      >
        {{
          estado === 'exito' ? 'verified' : estado === 'verificando' ? 'hourglass_top' : 'error'
        }}
      </span>

      <h1 class="font-headline-md text-headline-md text-on-background">
        {{ estado === 'exito' ? 'Correo verificado' : 'Verificación de correo' }}
      </h1>

      <p role="status" aria-live="polite" class="font-body-md text-body-md text-secondary">
        {{ estado === 'verificando' ? 'Verificando su correo electrónico...' : mensaje }}
      </p>

      <RouterLink
        v-if="estado === 'exito'"
        :to="{ name: 'login' }"
        class="w-full flex items-center justify-center bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors"
      >
        Iniciar sesión
      </RouterLink>

      <!-- RF-23: reenviar el enlace cuando el original ya no sirve -->
      <form
        v-if="estado === 'fallo' || estado === 'sin-token'"
        class="w-full flex flex-col gap-3 pt-2 border-t border-surface-alt mt-2"
        @submit.prevent="manejarReenvio"
      >
        <label for="correo-reenvio" class="font-label-sm text-label-sm text-on-surface text-left">
          Solicitar un enlace nuevo
        </label>
        <input
          id="correo-reenvio"
          v-model="correoReenvio"
          type="email"
          required
          placeholder="correo@ejemplo.com"
          class="block w-full px-3 rounded-primary border border-outline bg-pure-white text-on-background focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg h-touch-target"
        />
        <button
          type="submit"
          :disabled="reenviando"
          class="w-full flex items-center justify-center bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors disabled:opacity-60"
        >
          {{ reenviando ? 'Enviando...' : 'Reenviar verificación' }}
        </button>
        <p v-if="mensajeReenvio" role="status" aria-live="polite" class="font-body-md text-body-md text-secondary">
          {{ mensajeReenvio }}
        </p>
      </form>

      <RouterLink :to="{ name: 'login' }" class="inline-flex items-center align-middle h-touch-target px-1 rounded-secondary font-body-md text-body-md text-deep-onyx underline">
        Volver al inicio de sesión
      </RouterLink>
    </div>
  </div>
</template>
