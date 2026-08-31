<script setup lang="ts">
// RF-10 / RF-21 — Autoregistro ciudadano. La cuenta queda creada con el
// rol 'Usuario' pero NO puede iniciar sesión hasta confirmar el correo
// (RF-22), por eso el éxito muestra un aviso en vez de redirigir.
import { ref } from 'vue';
import authService from '@/services/auth.service';

const nombreCompleto = ref('');
const identificacion = ref('');
const correo = ref('');
const contrasena = ref('');
const mostrarContrasena = ref(false);

const cargando = ref(false);
const error = ref<string | null>(null);
const registrado = ref(false);

function obtenerMensajeError(excepcion: unknown): string {
  const conRespuesta = excepcion as { response?: { data?: { mensaje?: string | string[] } } };
  const mensaje = conRespuesta?.response?.data?.mensaje;
  if (Array.isArray(mensaje)) return mensaje.join('. ');
  return mensaje ?? 'No se pudo completar el registro';
}

async function manejarRegistro(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    await authService.registrarCiudadano({
      nombreCompleto: nombreCompleto.value,
      identificacion: identificacion.value,
      correo: correo.value,
      contrasena: contrasena.value,
    });
    registrado.value = true;
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
      class="w-full max-w-md bg-pure-white rounded-primary border border-surface-alt overflow-hidden"
    >
      <div class="px-gutter-lg pt-gutter-lg pb-gutter-sm text-center border-b border-surface-alt">
        <h1 class="font-headline-md text-headline-md text-on-background mb-2">Registro Ciudadano</h1>
        <p class="font-body-md text-body-md text-tertiary">
          Cree su cuenta para consultar los documentos publicados.
        </p>
      </div>

      <div class="p-gutter-lg">
        <div v-if="registrado" class="flex flex-col gap-4 text-center">
          <span aria-hidden="true" class="material-symbols-outlined text-primary text-5xl">
            mark_email_read
          </span>
          <p class="font-body-md text-body-md text-on-surface">
            Registro exitoso. Le enviamos un enlace de verificación a
            <strong>{{ correo }}</strong
            >. Debe confirmarlo antes de poder iniciar sesión.
          </p>
          <RouterLink
            :to="{ name: 'login' }"
            class="w-full flex items-center justify-center bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors"
          >
            Volver al inicio de sesión
          </RouterLink>
        </div>

        <form v-else class="flex flex-col gap-gutter-lg" @submit.prevent="manejarRegistro">
          <div>
            <label for="nombre" class="block font-body-md text-body-md text-on-surface mb-2">
              Nombre completo
            </label>
            <input
              id="nombre"
              v-model="nombreCompleto"
              type="text"
              required
              minlength="3"
              maxlength="150"
              autocomplete="name"
              class="block w-full px-3 rounded-primary border border-outline bg-pure-white text-on-background focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg h-touch-target"
            />
          </div>

          <div>
            <label for="identificacion" class="block font-body-md text-body-md text-on-surface mb-2">
              Número de identificación
            </label>
            <input
              id="identificacion"
              v-model="identificacion"
              type="text"
              required
              minlength="9"
              maxlength="30"
              class="block w-full px-3 rounded-primary border border-outline bg-pure-white text-on-background focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg h-touch-target"
            />
          </div>

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
              class="block w-full px-3 rounded-primary border border-outline bg-pure-white text-on-background focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg h-touch-target"
            />
          </div>

          <div>
            <label for="contrasena" class="block font-body-md text-body-md text-on-surface mb-2">
              Contraseña
            </label>
            <div class="relative">
              <input
                id="contrasena"
                v-model="contrasena"
                :type="mostrarContrasena ? 'text' : 'password'"
                required
                autocomplete="new-password"
                class="block w-full pl-3 pr-12 rounded-primary border border-outline bg-pure-white text-on-background focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg h-touch-target"
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

          <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
            {{ error }}
          </p>

          <button
            type="submit"
            :disabled="cargando"
            class="w-full flex items-center justify-center bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ cargando ? 'Creando cuenta...' : 'Crear cuenta' }}
          </button>

          <p class="text-center font-body-md text-body-md text-secondary">
            ¿Ya tiene cuenta?
            <RouterLink :to="{ name: 'login' }" class="inline-flex items-center align-middle h-touch-target px-1 rounded-secondary text-deep-onyx font-semibold underline">
              Inicie sesión
            </RouterLink>
          </p>
        </form>
      </div>
    </div>
  </div>
</template>
