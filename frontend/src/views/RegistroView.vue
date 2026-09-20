<script setup lang="ts">
// RF-10 / RF-21 — Autoregistro ciudadano. La cuenta queda creada con el
// rol 'Usuario' pero NO puede iniciar sesión hasta confirmar el correo
// (RF-22), por eso el éxito muestra un aviso en vez de redirigir.
//
// Validación en tiempo real con el mismo patrón que el formulario de
// Usuario en Gestión de Usuarios: cada campo muestra su error cuando la
// persona lo tocó, el mensaje desaparece solo al corregir el valor y el
// botón queda deshabilitado mientras algo esté inválido o vacío. Las
// reglas son las mismas de Usuario, con una diferencia deliberada: el
// correo es personal, de cualquier dominio válido, no institucional.
import { computed, reactive, ref } from 'vue';
import authService from '@/services/auth.service';
import {
  normalizarCorreo,
  validarContrasena,
  validarCorreoPersonal,
  validarIdentificacion,
  validarNombreCompleto,
} from '@/lib/validaciones';

const nombreCompleto = ref('');
const identificacion = ref('');
const correo = ref('');
const contrasena = ref('');
const mostrarContrasena = ref(false);

const cargando = ref(false);
const error = ref<string | null>(null);
const registrado = ref(false);

// ---------- Validación en tiempo real ----------

type CampoValidado = 'nombreCompleto' | 'identificacion' | 'correo' | 'contrasena';

// Un campo sólo muestra su error después de que la persona lo tocó; si
// no, el formulario se vería en rojo entero nada más abrirlo.
const camposTocados = reactive<Record<CampoValidado, boolean>>({
  nombreCompleto: false,
  identificacion: false,
  correo: false,
  contrasena: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

// Se recalcula con cada pulsación, así que el mensaje desaparece solo en
// cuanto el valor vuelve a ser válido.
const errores = computed<Record<CampoValidado, string | null>>(() => ({
  nombreCompleto: validarNombreCompleto(nombreCompleto.value),
  identificacion: validarIdentificacion(identificacion.value),
  correo: validarCorreoPersonal(correo.value),
  contrasena: validarContrasena(contrasena.value, 'La contraseña'),
}));

function errorVisible(campo: CampoValidado): string | null {
  return camposTocados[campo] ? errores.value[campo] : null;
}

const formularioValido = computed(() => Object.values(errores.value).every((e) => e === null));

function obtenerMensajeError(excepcion: unknown): string {
  const conRespuesta = excepcion as { response?: { data?: { mensaje?: string | string[] } } };
  const mensaje = conRespuesta?.response?.data?.mensaje;
  if (Array.isArray(mensaje)) return mensaje.join('. ');
  return mensaje ?? 'No se pudo completar el registro';
}

async function manejarRegistro(): Promise<void> {
  (Object.keys(camposTocados) as CampoValidado[]).forEach(marcarTocado);
  if (!formularioValido.value) return;

  cargando.value = true;
  error.value = null;
  try {
    await authService.registrarCiudadano({
      nombreCompleto: nombreCompleto.value.trim(),
      identificacion: identificacion.value.trim(),
      correo: normalizarCorreo(correo.value),
      contrasena: contrasena.value,
    });
    registrado.value = true;
  } catch (excepcion) {
    error.value = obtenerMensajeError(excepcion);
  } finally {
    cargando.value = false;
  }
}

const CLASE_INPUT =
  'block w-full px-3 rounded-primary border bg-pure-white text-on-background focus:border-2 focus:outline-none font-body-lg text-body-lg h-touch-target transition-colors';

function claseBorde(campo: CampoValidado): string {
  return errorVisible(campo) ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface';
}
</script>

<template>
  <div
    class="bg-surface-alt text-on-background min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop font-body-lg"
  >
    <div class="w-full max-w-md bg-pure-white rounded-primary border border-surface-alt overflow-hidden">
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

        <form v-else class="flex flex-col gap-gutter-lg" novalidate @submit.prevent="manejarRegistro">
          <div>
            <label for="nombre" class="block font-body-md text-body-md text-on-surface mb-2">
              Nombre completo
            </label>
            <input
              id="nombre"
              v-model="nombreCompleto"
              type="text"
              maxlength="150"
              autocomplete="name"
              :aria-invalid="errorVisible('nombreCompleto') !== null"
              aria-describedby="error-nombre"
              :class="[CLASE_INPUT, claseBorde('nombreCompleto')]"
              @input="marcarTocado('nombreCompleto')"
              @blur="marcarTocado('nombreCompleto')"
            />
            <p v-if="errorVisible('nombreCompleto')" id="error-nombre" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('nombreCompleto') }}
            </p>
          </div>

          <div>
            <label for="identificacion" class="block font-body-md text-body-md text-on-surface mb-2">
              Número de identificación
            </label>
            <input
              id="identificacion"
              v-model="identificacion"
              type="text"
              maxlength="12"
              :aria-invalid="errorVisible('identificacion') !== null"
              aria-describedby="error-identificacion"
              :class="[CLASE_INPUT, claseBorde('identificacion')]"
              @input="marcarTocado('identificacion')"
              @blur="marcarTocado('identificacion')"
            />
            <p v-if="errorVisible('identificacion')" id="error-identificacion" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('identificacion') }}
            </p>
            <p v-else class="font-body-md text-body-md text-tertiary mt-2">
              Sin guiones ni espacios. Extranjeros: número de pasaporte o DIMEX.
            </p>
          </div>

          <div>
            <label for="correo" class="block font-body-md text-body-md text-on-surface mb-2">
              Correo electrónico
            </label>
            <input
              id="correo"
              v-model="correo"
              type="email"
              autocomplete="username"
              placeholder="nombre@correo.com"
              :aria-invalid="errorVisible('correo') !== null"
              aria-describedby="error-correo"
              :class="[CLASE_INPUT, claseBorde('correo'), 'placeholder:text-secondary']"
              @input="marcarTocado('correo')"
              @blur="marcarTocado('correo')"
            />
            <p v-if="errorVisible('correo')" id="error-correo" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('correo') }}
            </p>
            <p v-else class="font-body-md text-body-md text-tertiary mt-2">
              Le enviaremos un enlace para confirmar su cuenta.
            </p>
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
                autocomplete="new-password"
                :aria-invalid="errorVisible('contrasena') !== null"
                aria-describedby="error-contrasena"
                :class="[CLASE_INPUT, claseBorde('contrasena'), 'pr-12']"
                @input="marcarTocado('contrasena')"
                @blur="marcarTocado('contrasena')"
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
            <p v-if="errorVisible('contrasena')" id="error-contrasena" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('contrasena') }}
            </p>
            <p v-else class="font-body-md text-body-md text-tertiary mt-2">
              Mínimo 8 caracteres, con al menos una mayúscula, un número y un carácter especial.
            </p>
          </div>

          <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
            {{ error }}
          </p>

          <button
            type="submit"
            :disabled="cargando || !formularioValido"
            class="w-full flex items-center justify-center bg-primary-container text-pure-white rounded-primary px-gutter-lg h-touch-target font-label-sm text-label-sm hover:bg-primary active:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ cargando ? 'Creando cuenta...' : 'Crear cuenta' }}
          </button>

          <p class="text-center font-body-md text-body-md text-secondary">
            ¿Ya tiene cuenta?
            <RouterLink
              :to="{ name: 'login' }"
              class="inline-flex items-center align-middle h-touch-target px-1 rounded-secondary text-deep-onyx font-semibold underline"
            >
              Inicie sesión
            </RouterLink>
          </p>
        </form>
      </div>
    </div>
  </div>
</template>
