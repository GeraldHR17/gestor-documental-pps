<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAutenticacion } from '@/composables/useAutenticacion';

const route = useRoute();
const router = useRouter();
const { iniciarSesion, cargando, error } = useAutenticacion();

const correo = ref('');
const contrasena = ref('');
const mostrarContrasena = ref(false);

async function manejarIniciarSesion(): Promise<void> {
  try {
    await iniciarSesion(correo.value, contrasena.value);

    // Si el guard del router interrumpió una navegación para pedir
    // credenciales, se devuelve a la persona a donde iba originalmente.
    const destino = route.query.redirigir;
    if (typeof destino === 'string' && destino.startsWith('/')) {
      router.replace(destino);
      return;
    }

    router.replace({ name: 'dashboard' });
  } catch {
    // El mensaje de error ya queda expuesto de forma reactiva vía `error`.
  }
}
</script>

<template>
  <div
    class="bg-surface-alt text-on-background min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop font-body-lg"
  >
    <!-- Card: radio 8px, borde 1px surface-alt, sin sombra (la jerarquía
         la da el escalón de superficie, no la elevación). -->
    <div
      class="w-full max-w-md bg-pure-white rounded-primary border border-surface-alt overflow-hidden flex flex-col"
    >
      <!-- Encabezado -->
      <div
        class="px-gutter-lg pt-gutter-lg pb-gutter-sm text-center border-b border-surface-alt flex flex-col items-center"
      >
        <div
          class="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center mb-gutter-sm"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-primary text-3xl"
            >account_balance</span
          >
        </div>
        <h1 class="font-headline-md text-headline-md text-on-surface mb-2">Gestión Municipal</h1>
        <p class="font-headline-sm text-headline-sm text-on-surface-variant">Acceso Seguro</p>
        <p class="font-body-lg text-body-lg text-secondary mt-2">Inicie sesión para continuar</p>
      </div>

      <!-- Formulario -->
      <div class="p-gutter-lg flex-1">
        <form class="flex flex-col gap-gutter-lg" @submit.prevent="manejarIniciarSesion">
          <div>
            <label for="correo" class="block font-body-md text-body-md text-on-surface mb-2">
              Correo Electrónico Institucional
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="material-symbols-outlined text-secondary">mail</span>
              </div>
              <input
                id="correo"
                v-model="correo"
                type="email"
                required
                autocomplete="username"
                placeholder="usuario@municipio.gob"
                class="block w-full pl-10 pr-3 border border-outline rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg h-touch-target"
              />
            </div>
          </div>

          <div>
            <label for="contrasena" class="block font-body-md text-body-md text-on-surface mb-2"
              >Contraseña</label
            >
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span class="material-symbols-outlined text-secondary">lock</span>
              </div>
              <input
                id="contrasena"
                v-model="contrasena"
                :type="mostrarContrasena ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="••••••••"
                class="block w-full pl-10 pr-12 border border-outline rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg h-touch-target"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 w-touch-target rounded-secondary flex items-center justify-center text-secondary hover:text-on-surface transition-colors"
                :aria-label="mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                @click="mostrarContrasena = !mostrarContrasena"
              >
                <span class="material-symbols-outlined">{{
                  mostrarContrasena ? 'visibility_off' : 'visibility'
                }}</span>
              </button>
            </div>
            <div class="mt-2 flex justify-end">
              <!-- Botón terciario/ghost: sin fondo, deep-onyx y subrayado
                   permanente (DESIGN.md > Components > Buttons). -->
              <router-link
                :to="{ name: 'recuperar-contrasena' }"
                class="inline-flex items-center h-touch-target px-2 rounded-secondary font-body-md text-body-md text-deep-onyx underline transition-colors hover:text-primary"
              >
                Olvidé mi contraseña
              </router-link>
            </div>
          </div>

          <p
            v-if="error"
            role="alert"
            aria-live="assertive"
            class="text-error font-body-md text-body-md"
          >
            {{ error }}
          </p>

          <div>
            <!-- Botón primario: fondo primary-container, texto blanco,
                 oscurecido a `primary` en hover/pressed. -->
            <button
              type="submit"
              :disabled="cargando"
              class="w-full flex items-center justify-center gap-2 bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors border-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>{{ cargando ? 'Ingresando...' : 'Iniciar Sesión' }}</span>
              <span v-if="!cargando" class="material-symbols-outlined text-[18px]">login</span>
            </button>
          </div>

          <p class="text-center font-body-md text-body-md text-secondary">
            ¿No tiene cuenta?
            <router-link :to="{ name: 'registro' }" class="inline-flex items-center align-middle h-touch-target px-1 rounded-secondary text-deep-onyx font-semibold underline">
              Regístrese como ciudadano
            </router-link>
          </p>
        </form>
      </div>

      <!-- Pie -->
      <div
        class="px-gutter-lg pb-gutter-lg pt-gutter-sm bg-surface-container-low flex justify-center items-center gap-2 border-t border-surface-alt"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-tertiary text-[16px]"
          >shield</span
        >
        <span class="font-label-sm text-label-sm text-tertiary uppercase"
          >Seguridad Protegida por JWT</span
        >
      </div>
    </div>
  </div>
</template>
