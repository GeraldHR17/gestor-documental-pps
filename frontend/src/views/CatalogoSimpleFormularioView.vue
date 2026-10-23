<script setup lang="ts">
// Formulario de creación/edición para los tres catálogos planos. Igual que
// el de usuarios: el modo lo decide la presencia de `id` en la ruta, la
// validación corre en tiempo real, hay modal de confirmación PREVIA al
// guardado y aviso de "cambios sin guardar" al intentar salir.
import { computed, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useCatalogo } from '@/composables/useCatalogo';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import { validarDescripcionCatalogo, validarNombreCatalogo } from '@/lib/validaciones';

const props = defineProps<{ catalogo: string; id?: string }>();
const router = useRouter();

const { configuracion, servicio, crear, actualizar } = useCatalogo(props.catalogo);
const { notificarExito, notificarError } = useNotificaciones();

const modoEdicion = computed(() => props.id !== undefined);
const idRegistro = computed(() => (props.id ? Number(props.id) : null));

const cargando = ref(false);
const guardando = ref(false);
const error = ref<string | null>(null);

const nombre = ref('');
const descripcion = ref('');

// ---------- Validación en tiempo real ----------

type CampoValidado = 'nombre' | 'descripcion';

// Un campo sólo muestra su error después de que la persona lo tocó; si no,
// el formulario se vería en rojo nada más abrirlo.
const camposTocados = reactive<Record<CampoValidado, boolean>>({
  nombre: false,
  descripcion: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

// Se recalcula con cada pulsación, así que el mensaje desaparece solo en
// cuanto el valor vuelve a ser válido.
const errores = computed<Record<CampoValidado, string | null>>(() => ({
  nombre: validarNombreCatalogo(nombre.value, configuracion.longitudMaximaNombre),
  descripcion: configuracion.admiteDescripcion
    ? validarDescripcionCatalogo(descripcion.value)
    : null,
}));

function errorVisible(campo: CampoValidado): string | null {
  return camposTocados[campo] ? errores.value[campo] : null;
}

const formularioValido = computed(() => Object.values(errores.value).every((e) => e === null));

// ---------- Cambios sin guardar ----------

interface Instantanea {
  nombre: string;
  descripcion: string;
}

function instantaneaActual(): Instantanea {
  return { nombre: nombre.value, descripcion: descripcion.value };
}

// Se compara contra el estado inicial en vez de marcar "sucio" al primer
// cambio: si la persona escribe algo y lo deshace, no se le pregunta por
// cambios que ya no existen.
const valoresIniciales = ref<Instantanea>(instantaneaActual());

const hayCambiosSinGuardar = computed(() => {
  const actual = instantaneaActual();
  const inicial = valoresIniciales.value;
  return actual.nombre !== inicial.nombre || actual.descripcion !== inicial.descripcion;
});

// Tras guardar con éxito la salida es consecuencia de la propia acción: no
// debe dispararse el aviso de cambios sin guardar.
const guardadoConExito = ref(false);

const mostrarModalSalir = ref(false);
let resolverSalida: ((salir: boolean) => void) | null = null;

onBeforeRouteLeave(async () => {
  if (guardadoConExito.value || !hayCambiosSinGuardar.value) return true;

  // Devolver una promesa deja la navegación en espera hasta que la persona
  // decida en el modal. Cubre por igual el botón "Cancelar" (que navega por
  // el router), el menú lateral y la navegación del navegador.
  mostrarModalSalir.value = true;
  return await new Promise<boolean>((resolve) => {
    resolverSalida = resolve;
  });
});

function responderSalida(salir: boolean): void {
  mostrarModalSalir.value = false;
  resolverSalida?.(salir);
  resolverSalida = null;
}

// ---------- Carga y guardado ----------

async function cargarDatosIniciales(): Promise<void> {
  if (!modoEdicion.value || idRegistro.value === null) {
    valoresIniciales.value = instantaneaActual();
    return;
  }

  cargando.value = true;
  error.value = null;
  try {
    const registro = await servicio.obtener(idRegistro.value);
    nombre.value = registro.nombre;
    descripcion.value = registro.descripcion ?? '';
    valoresIniciales.value = instantaneaActual();
  } catch (err) {
    error.value = obtenerMensajeError(err, 'No se pudo cargar la información del registro.');
  } finally {
    cargando.value = false;
  }
}

const mostrarModalGuardar = ref(false);

const tituloModalGuardar = computed(() =>
  modoEdicion.value ? 'Guardar cambios' : 'Crear registro',
);
const mensajeModalGuardar = computed(() =>
  modoEdicion.value
    ? `¿Confirma que desea guardar los cambios de ${configuracion.articulo} ${configuracion.singular}?`
    : `¿Confirma que desea crear ${configuracion.articulo === 'el' ? 'este' : 'esta'} ${configuracion.singular}?`,
);

function solicitarGuardado(): void {
  if (!formularioValido.value) return;
  mostrarModalGuardar.value = true;
}

async function confirmarGuardado(): Promise<void> {
  guardando.value = true;
  error.value = null;

  // `descripcion` sólo viaja si el catálogo la tiene: etiquetas no tiene
  // esa columna y el backend descartaría el campo de todos modos.
  const datos = {
    nombre: nombre.value.trim(),
    ...(configuracion.admiteDescripcion ? { descripcion: descripcion.value.trim() } : {}),
  };

  try {
    if (modoEdicion.value && idRegistro.value !== null) {
      await actualizar(idRegistro.value, datos);
    } else {
      await crear(datos);
    }

    guardadoConExito.value = true;
    mostrarModalGuardar.value = false;
    notificarExito(
      modoEdicion.value
        ? 'Cambios guardados correctamente.'
        : `Se creó ${configuracion.articulo} ${configuracion.singular} correctamente.`,
    );
    router.push({ name: configuracion.nombreRutaLista });
  } catch (err) {
    const mensajePorDefecto = modoEdicion.value
      ? `No se pudo actualizar ${configuracion.articulo} ${configuracion.singular}.`
      : `No se pudo crear ${configuracion.articulo} ${configuracion.singular}.`;
    // Por partida doble a propósito: el toast avisa del resultado y
    // desaparece, pero el mensaje del formulario permanece mientras la
    // persona corrige el campo que lo provocó.
    error.value = obtenerMensajeError(err, mensajePorDefecto);
    notificarError(err, mensajePorDefecto);
    mostrarModalGuardar.value = false;
  } finally {
    guardando.value = false;
  }
}

// No navega "a mano": deja que el guard de salida decida si hay que
// preguntar antes, para no duplicar la lógica del aviso.
function manejarCancelar(): void {
  router.push({ name: configuracion.nombreRutaLista });
}

onMounted(cargarDatosIniciales);
</script>

<template>
  <div
    class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen"
  >
    <div class="border-b border-surface-alt pb-gutter-sm">
      <h1
        class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
      >
        {{ modoEdicion ? 'Editar' : 'Nuevo' }} {{ configuracion.singular }}
      </h1>
      <p class="font-body-lg text-body-lg text-secondary mt-2">
        {{ configuracion.descripcionPagina }}
      </p>
    </div>

    <div v-if="cargando" class="text-secondary font-body-lg text-body-lg">Cargando...</div>

    <form
      v-else
      class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-lg max-w-2xl"
      novalidate
      @submit.prevent="solicitarGuardado"
    >
      <div>
        <label for="nombre" class="block font-body-md text-body-md text-on-surface mb-2">
          {{ configuracion.etiquetaColumnaNombre }}
        </label>
        <input
          id="nombre"
          v-model="nombre"
          type="text"
          :maxlength="configuracion.longitudMaximaNombre"
          :aria-invalid="errorVisible('nombre') !== null"
          aria-describedby="error-nombre"
          class="w-full h-touch-target px-3 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
          :class="
            errorVisible('nombre')
              ? 'border-error focus:border-error'
              : 'border-outline focus:border-on-surface'
          "
          @input="marcarTocado('nombre')"
          @blur="marcarTocado('nombre')"
        />
        <p
          v-if="errorVisible('nombre')"
          id="error-nombre"
          class="font-body-md text-body-md text-error mt-2"
        >
          {{ errorVisible('nombre') }}
        </p>
        <p v-else class="font-body-md text-body-md text-secondary mt-2">
          Máximo {{ configuracion.longitudMaximaNombre }} caracteres.
        </p>
      </div>

      <div v-if="configuracion.admiteDescripcion">
        <label for="descripcion" class="block font-body-md text-body-md text-on-surface mb-2">
          Descripción <span class="text-secondary">(opcional)</span>
        </label>
        <textarea
          id="descripcion"
          v-model="descripcion"
          rows="3"
          maxlength="255"
          :aria-invalid="errorVisible('descripcion') !== null"
          aria-describedby="error-descripcion"
          class="w-full px-3 py-2 border rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
          :class="
            errorVisible('descripcion')
              ? 'border-error focus:border-error'
              : 'border-outline focus:border-on-surface'
          "
          @input="marcarTocado('descripcion')"
          @blur="marcarTocado('descripcion')"
        ></textarea>
        <p
          v-if="errorVisible('descripcion')"
          id="error-descripcion"
          class="font-body-md text-body-md text-error mt-2"
        >
          {{ errorVisible('descripcion') }}
        </p>
        <p v-else class="font-body-md text-body-md text-secondary mt-2">
          {{ descripcion.length }} / 255 caracteres.
        </p>
      </div>

      <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
        {{ error }}
      </p>

      <div
        class="flex flex-col sm:flex-row items-center justify-end gap-gutter-sm pt-gutter-sm border-t border-surface-alt"
      >
        <button
          type="button"
          class="w-full sm:w-auto h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
          @click="manejarCancelar"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="guardando || !formularioValido"
          class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </button>
      </div>
    </form>

    <!-- Confirmación PREVIA al guardado -->
    <ModalConfirmacion
      v-if="mostrarModalGuardar"
      :titulo="tituloModalGuardar"
      :mensaje="mensajeModalGuardar"
      :procesando="guardando"
      @cancelar="mostrarModalGuardar = false"
      @confirmar="confirmarGuardado"
    />

    <!-- Aviso de cambios sin guardar al intentar salir -->
    <ModalConfirmacion
      v-if="mostrarModalSalir"
      titulo="Cambios sin guardar"
      mensaje="Tiene cambios sin guardar. Si sale ahora, esta información se perderá. ¿Desea salir de todas formas?"
      texto-confirmar="Salir"
      texto-cancelar="Cancelar"
      @cancelar="responderSalida(false)"
      @confirmar="responderSalida(true)"
    />
  </div>
</template>
