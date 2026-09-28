<script setup lang="ts">
// Rediseño Etapa B (captura del PO): split-screen de 2 columnas. Este
// archivo es exclusivamente maquetación/estilos — la lógica de
// autenticación (iniciarSesion, error, cargando) es la misma de siempre,
// sin tocar.
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAutenticacion } from '@/composables/useAutenticacion';

const route = useRoute();
const router = useRouter();
const { iniciarSesion, cargando, error } = useAutenticacion();

const correo = ref('');
const contrasena = ref('');
const mostrarContrasena = ref(false);

// Llegada controlada tras expirar la sesión (8 horas absolutas): el
// interceptor HTTP redirige aquí con este motivo, y se explica por qué se
// pide volver a entrar en vez de mostrar un error crudo.
const sesionExpirada = computed(() => route.query.motivo === 'sesion-expirada');

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
  <div class="min-h-screen flex flex-col md:flex-row">
    <!-- Panel de marca. En desktop ocupa exactamente la mitad del viewport:
         `md:w-1/2` sin ancho máximo — el tope fijo anterior era justo lo que
         rompía la proporción en pantallas anchas. En mobile (<768px) es el
         mismo bloque colapsado a una barra compacta: solo el logo y el
         nombre, sin el bloque de texto grande. Deliberadamente NO hay un
         segundo encabezado aparte: un único elemento de logo, siempre dentro
         del panel, para que nunca quede flotando fuera de las dos columnas.
         Usa `bg-on-surface`, el mismo token del panel lateral del área
         autenticada: así el fondo oscuro de la marca es idéntico antes y
         después de entrar, en vez del gris algo más claro de antes. -->
    <div
      class="w-full md:w-1/2 shrink-0 bg-on-surface flex flex-col justify-between px-margin-mobile py-gutter-sm md:p-margin-desktop"
    >
      <!-- Logo e institución en la misma fila, como en el mockup del PO.
           El ícono es el mismo `account_balance` del login previo al
           rediseño, con los colores invertidos: allá era ícono rojo sobre
           círculo rosa claro; aquí es ícono blanco sobre cuadrado rojo. -->
      <div class="flex items-center gap-3">
        <div
          class="w-12 h-12 md:w-14 md:h-14 rounded-md bg-primary-container flex items-center justify-center shrink-0"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-pure-white text-[28px]"
            >account_balance</span
          >
        </div>
        <div class="min-w-0">
          <p class="font-body-lg text-body-lg font-bold text-pure-white">Municipalidad de Palmares</p>
          <p
            class="hidden md:block font-body-md text-body-md text-inverse-on-surface mt-1"
            style="opacity: 0.7"
          >
            Departamento de Tecnologías de la Información
          </p>
        </div>
      </div>

      <div class="hidden md:block">
        <h1 class="font-headline-lg text-headline-lg text-pure-white mb-gutter-sm">
          Sistema Integral de Gestión Documental
        </h1>
        <p class="font-body-lg text-body-lg text-inverse-on-surface" style="opacity: 0.85">
          Acceso restringido a funcionarios autorizados. Toda operación queda registrada en la bitácora
          institucional.
        </p>
      </div>

      <p class="hidden md:block font-body-md text-body-md text-inverse-on-surface" style="opacity: 0.6">
        Autenticación JWT · Control de acceso por roles (RBAC)
      </p>
    </div>

    <!-- Columna del formulario: la otra mitad exacta. -->
    <div
      class="flex-1 md:w-1/2 bg-surface-alt flex items-center justify-center p-margin-mobile md:p-margin-desktop"
    >
      <!-- Contenido de la tarjeta según "Contenido del Login.png" del PO.
           `overflow-hidden` es lo que permite que la franja de pie llegue a
           los bordes redondeados de la tarjeta, por eso el relleno vive en
           el bloque interno y no en la tarjeta. -->
      <div
        class="w-full max-w-[440px] bg-surface-container-lowest rounded-lg overflow-hidden flex flex-col"
        style="box-shadow: var(--shadow-modal)"
      >
        <div class="p-gutter-lg flex flex-col gap-gutter-lg">
          <div>
            <h2 class="font-headline-sm text-headline-sm text-on-surface font-bold">Iniciar sesión</h2>
            <p class="font-body-md text-body-md text-on-surface-variant mt-1">
              Utilice su cuenta institucional.
            </p>
          </div>

          <p
            v-if="sesionExpirada"
            role="status"
            class="font-body-md text-body-md text-on-surface bg-surface-container-low border border-surface-alt rounded-primary p-gutter-sm flex items-start gap-2"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[20px] shrink-0">schedule</span>
            Su sesión expiró por seguridad (8 horas desde el inicio). Vuelva a iniciar sesión para continuar.
          </p>

          <form class="flex flex-col gap-gutter-sm" @submit.prevent="manejarIniciarSesion">
            <div>
              <label for="correo" class="block font-body-md text-body-md text-on-surface mb-2">
                Correo Electrónico Institucional
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span aria-hidden="true" class="material-symbols-outlined text-secondary">mail</span>
                </div>
                <input
                  id="correo"
                  v-model="correo"
                  type="email"
                  required
                  autocomplete="username"
                  placeholder="usuario@munipalmares.go.cr"
                  class="block w-full pl-10 pr-3 border border-outline rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg h-touch-target"
                />
              </div>
            </div>

            <div>
              <label for="contrasena" class="block font-body-md text-body-md text-on-surface mb-2">
                Contraseña
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span aria-hidden="true" class="material-symbols-outlined text-secondary">lock</span>
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
              class="bg-error-container text-on-error-container rounded-primary px-3 py-2 font-body-md text-body-md"
            >
              {{ error }}
            </p>

            <button
              type="submit"
              :disabled="cargando"
              class="w-full flex items-center justify-center gap-2 bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors border-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>{{ cargando ? 'Ingresando...' : 'Iniciar Sesión' }}</span>
              <span v-if="!cargando" class="material-symbols-outlined text-[18px]">login</span>
            </button>

          </form>
        </div>

        <!-- Pie de la tarjeta -->
        <div
          class="px-gutter-lg pb-gutter-lg pt-gutter-sm bg-surface-container-low flex justify-center items-center gap-2 border-t border-surface-alt"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-tertiary text-[16px]">shield</span>
          <span class="font-label-sm text-label-sm text-tertiary uppercase">Seguridad Protegida por JWT</span>
        </div>
      </div>
    </div>
  </div>
</template>
