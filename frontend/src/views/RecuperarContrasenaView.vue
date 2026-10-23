<script setup lang="ts">
// RF-11 — Recuperación de contraseña, en dos momentos según la URL:
//   sin ?token=  -> se solicita el enlace por correo
//   con ?token=  -> se define la contraseña nueva
// El backend responde siempre un mensaje genérico al solicitar, para no
// revelar si un correo está o no registrado (Sección 9, regla #4).
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import authService from '@/services/auth.service';

const route = useRoute();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : null));

const correo = ref('');
const nuevaContrasena = ref('');
const mostrarContrasena = ref(false);

const cargando = ref(false);
const error = ref<string | null>(null);
const mensaje = ref<string | null>(null);
const completado = ref(false);

function obtenerMensajeError(excepcion: unknown): string {
  const conRespuesta = excepcion as { response?: { data?: { mensaje?: string | string[] } } };
  const detalle = conRespuesta?.response?.data?.mensaje;
  if (Array.isArray(detalle)) return detalle.join('. ');
  return detalle ?? 'No se pudo completar la operación';
}

async function manejarSolicitud(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    const respuesta = await authService.solicitarRecuperacion({ correo: correo.value });
    mensaje.value = respuesta.mensaje;
  } catch (excepcion) {
    error.value = obtenerMensajeError(excepcion);
  } finally {
    cargando.value = false;
  }
}

async function manejarConfirmacion(): Promise<void> {
  if (!token.value) return;
  cargando.value = true;
  error.value = null;
  try {
    const respuesta = await authService.confirmarRecuperacion({
      token: token.value,
      nuevaContrasena: nuevaContrasena.value,
    });
    mensaje.value = respuesta.mensaje;
    completado.value = true;
  } catch (excepcion) {
    error.value = obtenerMensajeError(excepcion);
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <div
    class="bg-surface-alt text-on-background min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop font-body-lg"
  >
    <div
      class="w-full max-w-md bg-surface-container-lowest rounded-primary border border-surface-alt overflow-hidden"
    >
      <div class="px-gutter-lg pt-gutter-lg pb-gutter-sm text-center border-b border-surface-alt">
        <h1 class="font-headline-md text-headline-md text-on-background mb-2">
          Recuperar contraseña
        </h1>
        <p class="font-body-md text-body-md text-tertiary">
          {{
            token
              ? 'Defina su nueva contraseña.'
              : 'Le enviaremos un enlace para restablecerla.'
          }}
        </p>
      </div>

      <div class="p-gutter-lg flex flex-col gap-gutter-lg">
        <!-- Paso 2: definir contraseña nueva -->
        <form v-if="token && !completado" class="flex flex-col gap-gutter-lg" @submit.prevent="manejarConfirmacion">
          <div>
            <label for="nueva" class="block font-body-md text-body-md text-on-surface mb-2">
              Nueva contraseña
            </label>
            <div class="relative">
              <input
                id="nueva"
                v-model="nuevaContrasena"
                :type="mostrarContrasena ? 'text' : 'password'"
                required
                autocomplete="new-password"
                class="block w-full pl-3 pr-12 rounded-primary border border-outline bg-surface-container-lowest text-on-background focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg h-touch-target"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 w-touch-target rounded-secondary flex items-center justify-center text-secondary hover:text-on-surface transition-colors"
                :aria-label="mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                @click="mostrarContrasena = !mostrarContrasena"
              >
                <span class="material-symbols-outlined">
                  {{ mostrarContrasena ? 'visibility_off' : 'visibility' }}
                </span>
              </button>
            </div>
            <p class="font-body-md text-body-md text-tertiary mt-2">
              Mínimo 8 caracteres, con al menos una mayúscula, un número y un carácter especial.
            </p>
          </div>

          <button
            type="submit"
            :disabled="cargando"
            class="w-full flex items-center justify-center bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors disabled:opacity-60"
          >
            {{ cargando ? 'Guardando...' : 'Guardar nueva contraseña' }}
          </button>
        </form>

        <!-- Paso 1: solicitar el enlace -->
        <form v-else-if="!token" class="flex flex-col gap-gutter-lg" @submit.prevent="manejarSolicitud">
          <div>
            <label for="correo" class="block font-body-md text-body-md text-on-surface mb-2">
              Correo electrónico
            </label>
            <input
              id="correo"
              v-model="correo"
              type="email"
              required
              autocomplete="username"
              class="block w-full px-3 rounded-primary border border-outline bg-surface-container-lowest text-on-background focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg h-touch-target"
            />
          </div>

          <button
            type="submit"
            :disabled="cargando"
            class="w-full flex items-center justify-center bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors disabled:opacity-60"
          >
            {{ cargando ? 'Enviando...' : 'Enviar enlace de recuperación' }}
          </button>
        </form>

        <p
          v-if="mensaje"
          role="status"
          aria-live="polite"
          class="font-body-md text-body-md text-on-surface bg-surface-container-low border border-surface-alt rounded-primary p-4"
        >
          {{ mensaje }}
        </p>

        <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
          {{ error }}
        </p>

        <RouterLink
          :to="{ name: 'login' }"
          class="mx-auto inline-flex items-center align-middle h-touch-target px-1 rounded-secondary font-body-md text-body-md text-deep-onyx underline"
        >
          Volver al inicio de sesión
        </RouterLink>
      </div>
    </div>
  </div>
</template>
