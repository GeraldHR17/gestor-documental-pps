<script setup lang="ts">
// Formulario de categoría ITSP. Lo propio frente a los catálogos planos es
// el selector de "categoría padre": al crear, dejarlo vacío crea una
// categoría raíz y elegir una raíz crea una subsección. El nivel no se pide
// nunca, lo deriva el backend del padre, así que aquí no hay campo para él.
//
// El código tampoco se escribe: lo asigna el backend (máximo + 1 de su
// nivel) y forma parte de la URL pública que se pega en WordPress. Al crear
// sólo se muestra el previsto; al editar se ve en solo lectura. Por la
// misma razón, al editar una raíz no se ofrece padre, y al editar una
// subsección sólo se puede mover a otra raíz, avisando antes de que su
// código y su URL cambiarán (spec-ajustes-posdespliegue §9.1, RF-8 a RF-10).
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useCategoriasItsp } from '@/composables/useCategoriasItsp';
import { categoriasItspService } from '@/services/catalogos.service';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import type { GuardarCategoriaItspDto } from '@/types/catalogo.types';
import {
  bloquearNegativos,
  sanearNoNegativo,
  validarDescripcionCatalogo,
  validarNombreCatalogo,
} from '@/lib/validaciones';

/** Límite de la columna `nombre` en categorias_itsp: VARCHAR(200). */
const LONGITUD_MAXIMA_NOMBRE = 200;

const props = defineProps<{ id?: string }>();
const router = useRouter();

const { categoriasRaiz, listar, crear, actualizar, obtenerSiguienteCodigo } = useCategoriasItsp();
const { notificarExito, notificarError } = useNotificaciones();

const modoEdicion = computed(() => props.id !== undefined);
const idCategoria = computed(() => (props.id ? Number(props.id) : null));

const cargando = ref(false);
const guardando = ref(false);
const error = ref<string | null>(null);

const nombre = ref('');
const descripcion = ref('');
const idCategoriaPadre = ref<number | null>(null);
const orden = ref(0);

/** Al editar: el código guardado y el padre con el que se cargó. */
const codigoActual = ref('');
const idPadreOriginal = ref<number | null>(null);

/** Al editar, el nivel no cambia: lo fija la categoría cargada. */
const esRaizEnEdicion = computed(() => modoEdicion.value && idPadreOriginal.value === null);

const cambiaDePadre = computed(
  () =>
    modoEdicion.value &&
    !esRaizEnEdicion.value &&
    idCategoriaPadre.value !== idPadreOriginal.value,
);

// ---------- Código previsto al crear ----------

const codigoPrevisto = ref<string | null>(null);
let consultaPrevista = 0;

/**
 * Sólo orientativo: si otra persona crea antes, el código final puede ser
 * el siguiente. Si la consulta falla, el formulario sigue sirviendo: el
 * texto se queda en "Se asignará automáticamente".
 */
async function actualizarCodigoPrevisto(): Promise<void> {
  if (modoEdicion.value) return;
  const consulta = ++consultaPrevista;
  try {
    const previsto = await obtenerSiguienteCodigo(idCategoriaPadre.value);
    // Descarta respuestas viejas si la persona cambió de padre entre medio.
    if (consulta === consultaPrevista) codigoPrevisto.value = previsto;
  } catch (err) {
    if (consulta === consultaPrevista) codigoPrevisto.value = null;
    console.error('No se pudo consultar el código previsto', err);
  }
}

watch(idCategoriaPadre, () => {
  if (!modoEdicion.value) void actualizarCodigoPrevisto();
});

// `min="0"` sólo frena las flechas del control: escribir "-3" a mano sigue
// pasando. Se bloquea el signo en el teclado y se corrige lo que llegue
// pegado, para que el orden nunca pueda ser negativo.
function sanearOrden(evento: Event): void {
  const valor = sanearNoNegativo(evento);
  const numero = Number(valor);
  if (valor !== '' && Number.isFinite(numero) && numero < 0) orden.value = 0;
}

/**
 * Sólo raíces: la jerarquía es de dos niveles. Al editar, la propia
 * categoría nunca aparece, porque una raíz no tiene selector y una
 * subsección no es raíz. El servidor aplica las mismas reglas; se filtran
 * aquí para que la persona no las descubra por un error.
 */
const opcionesCategoriaPadre = computed(() =>
  categoriasRaiz.value.filter((categoria) => categoria.id !== idCategoria.value),
);

// ---------- Validación en tiempo real ----------

type CampoValidado = 'nombre' | 'descripcion';

const camposTocados = reactive<Record<CampoValidado, boolean>>({
  nombre: false,
  descripcion: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

const errores = computed<Record<CampoValidado, string | null>>(() => ({
  nombre: validarNombreCatalogo(nombre.value, LONGITUD_MAXIMA_NOMBRE),
  descripcion: validarDescripcionCatalogo(descripcion.value),
}));

function errorVisible(campo: CampoValidado): string | null {
  return camposTocados[campo] ? errores.value[campo] : null;
}

const formularioValido = computed(() => Object.values(errores.value).every((e) => e === null));

// ---------- Cambios sin guardar ----------

interface Instantanea {
  nombre: string;
  descripcion: string;
  idCategoriaPadre: number | null;
  orden: number;
}

function instantaneaActual(): Instantanea {
  return {
    nombre: nombre.value,
    descripcion: descripcion.value,
    idCategoriaPadre: idCategoriaPadre.value,
    orden: orden.value,
  };
}

const valoresIniciales = ref<Instantanea>(instantaneaActual());

const hayCambiosSinGuardar = computed(() => {
  const actual = instantaneaActual();
  const inicial = valoresIniciales.value;
  return (Object.keys(actual) as (keyof Instantanea)[]).some(
    (campo) => actual[campo] !== inicial[campo],
  );
});

const guardadoConExito = ref(false);
const mostrarModalSalir = ref(false);
let resolverSalida: ((salir: boolean) => void) | null = null;

onBeforeRouteLeave(async () => {
  if (guardadoConExito.value || !hayCambiosSinGuardar.value) return true;

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
  cargando.value = true;
  error.value = null;
  try {
    // La lista completa hace falta para llenar el desplegable de categoría
    // padre con las raíces.
    await listar();

    if (modoEdicion.value && idCategoria.value !== null) {
      const categoria = await categoriasItspService.obtener(idCategoria.value);
      nombre.value = categoria.nombre;
      codigoActual.value = categoria.codigo;
      descripcion.value = categoria.descripcion ?? '';
      idCategoriaPadre.value = categoria.idCategoriaPadre;
      idPadreOriginal.value = categoria.idCategoriaPadre;
      orden.value = categoria.orden;
    } else {
      void actualizarCodigoPrevisto();
    }

    valoresIniciales.value = instantaneaActual();
  } catch (err) {
    error.value = obtenerMensajeError(err, 'No se pudo cargar la información de la categoría.');
  } finally {
    cargando.value = false;
  }
}

const mostrarModalGuardar = ref(false);
const preparandoGuardado = ref(false);

/** Al mover una subsección: el código que tendría en la raíz nueva. */
const codigoNuevoPrevisto = ref<string | null>(null);

const tituloModalGuardar = computed(() => {
  if (cambiaDePadre.value) return 'Mover subsección';
  return modoEdicion.value ? 'Guardar cambios' : 'Crear categoría';
});
const mensajeModalGuardar = computed(() => {
  if (cambiaDePadre.value) {
    // Texto de RF-10, con los códigos reales.
    return `El código y la URL cambiarán de ${codigoActual.value} a ${codigoNuevoPrevisto.value}; el enlace en WordPress deberá actualizarse.`;
  }
  return modoEdicion.value
    ? '¿Confirma que desea guardar los cambios de esta categoría?'
    : '¿Confirma que desea crear esta categoría?';
});

async function solicitarGuardado(): Promise<void> {
  if (!formularioValido.value) return;

  if (cambiaDePadre.value) {
    // El aviso necesita el código nuevo antes de guardar: lo calcula el
    // servidor con las subsecciones actuales de la raíz destino.
    preparandoGuardado.value = true;
    try {
      codigoNuevoPrevisto.value = await obtenerSiguienteCodigo(idCategoriaPadre.value);
    } catch (err) {
      notificarError(err, 'No se pudo calcular el código nuevo de la subsección.');
      return;
    } finally {
      preparandoGuardado.value = false;
    }
  }

  mostrarModalGuardar.value = true;
}

function construirDatos(): GuardarCategoriaItspDto {
  const datos: GuardarCategoriaItspDto = {
    nombre: nombre.value.trim(),
    descripcion: descripcion.value.trim(),
    // Vaciar un <input type="number"> deja la cadena vacía, no un cero, y
    // el backend la rechazaría por no ser entero.
    orden: Number.isFinite(orden.value) ? orden.value : 0,
  };
  // Al crear, el padre decide el nivel. Al editar sólo se envía si la
  // subsección cambió de raíz: así la bitácora no lo anota como cambiado
  // cuando no lo fue.
  if (!modoEdicion.value || cambiaDePadre.value) {
    datos.idCategoriaPadre = idCategoriaPadre.value;
  }
  return datos;
}

async function confirmarGuardado(): Promise<void> {
  guardando.value = true;
  error.value = null;

  const datos = construirDatos();

  try {
    let mensajeExito: string;
    if (modoEdicion.value && idCategoria.value !== null) {
      const movida = cambiaDePadre.value;
      const guardada = await actualizar(idCategoria.value, datos);
      // El código final puede no ser el previsto si otra persona guardó
      // una subsección en esa raíz entre medio: se informa el real.
      mensajeExito = movida
        ? `Cambios guardados. El nuevo código es ${guardada.codigo}: actualice el enlace en WordPress.`
        : 'Cambios guardados correctamente.';
    } else {
      const creada = await crear(datos);
      mensajeExito = `Categoría creada con el código ${creada.codigo}.`;
    }

    guardadoConExito.value = true;
    mostrarModalGuardar.value = false;
    notificarExito(mensajeExito);
    router.push({ name: 'categorias-itsp' });
  } catch (err) {
    const mensajePorDefecto = modoEdicion.value
      ? 'No se pudo actualizar la categoría.'
      : 'No se pudo crear la categoría.';
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
  router.push({ name: 'categorias-itsp' });
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
        {{ modoEdicion ? 'Editar categoría ITSP' : 'Nueva categoría ITSP' }}
      </h1>
      <p v-if="!modoEdicion" class="font-body-lg text-body-lg text-secondary mt-2">
        Deje la categoría padre vacía para crear una categoría raíz, o elija una para crear una
        subsección.
      </p>
    </div>

    <div v-if="cargando" class="text-secondary font-body-lg text-body-lg">Cargando...</div>

    <form
      v-else
      class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-lg max-w-2xl"
      novalidate
      @submit.prevent="solicitarGuardado"
    >
      <div>
        <label for="nombre" class="block font-body-md text-body-md text-on-surface mb-2">
          Nombre de la categoría
        </label>
        <input
          id="nombre"
          v-model="nombre"
          type="text"
          :maxlength="LONGITUD_MAXIMA_NOMBRE"
          :aria-invalid="errorVisible('nombre') !== null"
          aria-describedby="error-nombre"
          class="w-full h-touch-target px-3 border rounded-primary bg-pure-white text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
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
          Máximo {{ LONGITUD_MAXIMA_NOMBRE }} caracteres.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-sm">
        <!-- El código no se escribe: lo asigna el sistema. Al editar se
             muestra como texto en un campo de solo lectura (no
             deshabilitado: un campo gris de bajo contraste se leería peor). -->
        <div v-if="modoEdicion">
          <label for="codigo" class="block font-body-md text-body-md text-on-surface mb-2">
            Código
          </label>
          <input
            id="codigo"
            :value="codigoActual"
            type="text"
            readonly
            aria-readonly="true"
            aria-describedby="ayuda-codigo"
            class="w-full h-touch-target px-3 border border-outline rounded-primary bg-surface-container-low text-on-surface focus:border-2 focus:border-on-surface focus:outline-none font-body-lg text-body-lg"
          />
          <p id="ayuda-codigo" class="font-body-md text-body-md text-secondary mt-2">
            Lo asigna el sistema y forma parte de la dirección pública; no se puede cambiar.
          </p>
        </div>
        <div v-else>
          <p class="block font-body-md text-body-md text-on-surface mb-2">Código</p>
          <p
            class="h-touch-target flex items-center font-body-lg text-body-lg text-secondary"
            aria-live="polite"
          >
            Se asignará automáticamente<template v-if="codigoPrevisto">
              (previsto: {{ codigoPrevisto }})</template
            >
          </p>
          <p class="font-body-md text-body-md text-secondary mt-2">
            El código previsto puede cambiar si otra persona crea una categoría antes.
          </p>
        </div>

        <div>
          <label for="orden" class="block font-body-md text-body-md text-on-surface mb-2">
            Orden de despliegue
          </label>
          <input
            id="orden"
            v-model.number="orden"
            type="number"
            min="0"
            inputmode="numeric"
            @keydown="bloquearNegativos"
            @input="sanearOrden"
            class="w-full h-touch-target px-3 border border-outline rounded-primary bg-pure-white text-on-surface focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg"
          />
          <p class="font-body-md text-body-md text-secondary mt-2">
            Menor número, aparece primero.
          </p>
        </div>
      </div>

      <!-- Una raíz sigue siendo raíz: al editarla no se ofrece padre. -->
      <div v-if="esRaizEnEdicion">
        <p class="block font-body-md text-body-md text-on-surface mb-2">Categoría padre</p>
        <p class="font-body-md text-body-md text-secondary">
          Es una categoría raíz. No puede convertirse en subsección: su código y su dirección pública
          dejarían de tener sentido.
        </p>
      </div>
      <div v-else>
        <label for="idCategoriaPadre" class="block font-body-md text-body-md text-on-surface mb-2">
          Categoría padre
        </label>
        <select
          id="idCategoriaPadre"
          v-model="idCategoriaPadre"
          aria-describedby="ayuda-padre"
          class="w-full h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <!-- Una subsección no puede pasar a raíz: al editarla no hay "ninguna". -->
          <option v-if="!modoEdicion" :value="null">Ninguna — es una categoría raíz</option>
          <option v-for="raiz in opcionesCategoriaPadre" :key="raiz.id" :value="raiz.id">
            {{ raiz.nombre }}
          </option>
        </select>
        <p
          v-if="cambiaDePadre"
          id="ayuda-padre"
          class="font-body-md text-body-md text-on-surface mt-2"
        >
          Al moverla a otra categoría raíz cambiarán su código y su dirección pública. Antes de
          guardar se mostrará el código nuevo.
        </p>
        <p v-else id="ayuda-padre" class="font-body-md text-body-md text-secondary mt-2">
          Sólo las categorías raíz pueden aparecer en esta lista.
        </p>
      </div>

      <div>
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
          class="w-full px-3 py-2 border rounded-primary bg-pure-white text-on-surface focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
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
          class="w-full sm:w-auto h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
          @click="manejarCancelar"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="guardando || preparandoGuardado || !formularioValido"
          class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {{ guardando || preparandoGuardado ? 'Guardando...' : 'Guardar' }}
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
