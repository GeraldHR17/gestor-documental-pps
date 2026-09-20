<script setup lang="ts">
// Formulario de categoría ITSP. Lo propio frente a los catálogos planos es
// el selector de "categoría padre": dejarlo vacío crea una categoría raíz,
// elegir una raíz crea una subsección. El nivel no se pide nunca, lo deriva
// el backend del padre, así que aquí no hay campo para él.
import { computed, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useCategoriasItsp } from '@/composables/useCategoriasItsp';
import { categoriasItspService } from '@/services/catalogos.service';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import {
  bloquearNegativos,
  sanearNoNegativo,
  validarCodigoCategoria,
  validarDescripcionCatalogo,
  validarNombreCatalogo,
} from '@/lib/validaciones';

/** Límite de la columna `nombre` en categorias_itsp: VARCHAR(200). */
const LONGITUD_MAXIMA_NOMBRE = 200;

const props = defineProps<{ id?: string }>();
const router = useRouter();

const { categorias, categoriasRaiz, listar, crear, actualizar } = useCategoriasItsp();
const { notificarExito, notificarError } = useNotificaciones();

const modoEdicion = computed(() => props.id !== undefined);
const idCategoria = computed(() => (props.id ? Number(props.id) : null));

const cargando = ref(false);
const guardando = ref(false);
const error = ref<string | null>(null);

const nombre = ref('');
const codigo = ref('');
const descripcion = ref('');
const idCategoriaPadre = ref<number | null>(null);
const orden = ref(0);

// `min="0"` sólo frena las flechas del control: escribir "-3" a mano sigue
// pasando. Se bloquea el signo en el teclado y se corrige lo que llegue
// pegado, para que el orden nunca pueda ser negativo.
function sanearOrden(evento: Event): void {
  const valor = sanearNoNegativo(evento);
  const numero = Number(valor);
  if (valor !== '' && Number.isFinite(numero) && numero < 0) orden.value = 0;
}

/**
 * Una categoría no puede ser su propia madre, y una raíz que ya tiene
 * subsecciones no puede colgarse de otra (produciría un tercer nivel). Se
 * filtran aquí las opciones imposibles para que la persona no descubra la
 * regla recién al recibir el error del servidor, que igual la aplica.
 */
const tieneSubsecciones = computed(() => {
  // Sólo tiene sentido al editar. Al crear, `idCategoria` es null y toda
  // categoría raíz tiene `idCategoriaPadre` null, así que comparar sin este
  // resguardo daría "true" siempre y dejaría el selector de padre
  // deshabilitado justo cuando más se necesita.
  if (!modoEdicion.value) return false;
  return categorias.value.some((categoria) => categoria.idCategoriaPadre === idCategoria.value);
});

const opcionesCategoriaPadre = computed(() =>
  categoriasRaiz.value.filter((categoria) => categoria.id !== idCategoria.value),
);

// ---------- Validación en tiempo real ----------

type CampoValidado = 'nombre' | 'codigo' | 'descripcion';

const camposTocados = reactive<Record<CampoValidado, boolean>>({
  nombre: false,
  codigo: false,
  descripcion: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

const errores = computed<Record<CampoValidado, string | null>>(() => ({
  nombre: validarNombreCatalogo(nombre.value, LONGITUD_MAXIMA_NOMBRE),
  codigo: validarCodigoCategoria(codigo.value),
  descripcion: validarDescripcionCatalogo(descripcion.value),
}));

function errorVisible(campo: CampoValidado): string | null {
  return camposTocados[campo] ? errores.value[campo] : null;
}

const formularioValido = computed(() => Object.values(errores.value).every((e) => e === null));

// ---------- Cambios sin guardar ----------

interface Instantanea {
  nombre: string;
  codigo: string;
  descripcion: string;
  idCategoriaPadre: number | null;
  orden: number;
}

function instantaneaActual(): Instantanea {
  return {
    nombre: nombre.value,
    codigo: codigo.value,
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
    // La lista completa hace falta para dos cosas: llenar el desplegable de
    // categoría padre y saber si esta categoría ya tiene subsecciones.
    await listar();

    if (modoEdicion.value && idCategoria.value !== null) {
      const categoria = await categoriasItspService.obtener(idCategoria.value);
      nombre.value = categoria.nombre;
      codigo.value = categoria.codigo ?? '';
      descripcion.value = categoria.descripcion ?? '';
      idCategoriaPadre.value = categoria.idCategoriaPadre;
      orden.value = categoria.orden;
    }

    valoresIniciales.value = instantaneaActual();
  } catch (err) {
    error.value = obtenerMensajeError(err, 'No se pudo cargar la información de la categoría.');
  } finally {
    cargando.value = false;
  }
}

const mostrarModalGuardar = ref(false);

const tituloModalGuardar = computed(() =>
  modoEdicion.value ? 'Guardar cambios' : 'Crear categoría',
);
const mensajeModalGuardar = computed(() =>
  modoEdicion.value
    ? '¿Confirma que desea guardar los cambios de esta categoría?'
    : '¿Confirma que desea crear esta categoría?',
);

function solicitarGuardado(): void {
  if (!formularioValido.value) return;
  mostrarModalGuardar.value = true;
}

async function confirmarGuardado(): Promise<void> {
  guardando.value = true;
  error.value = null;

  const datos = {
    nombre: nombre.value.trim(),
    codigo: codigo.value.trim(),
    descripcion: descripcion.value.trim(),
    idCategoriaPadre: idCategoriaPadre.value,
    // Vaciar un <input type="number"> deja la cadena vacía, no un cero, y
    // el backend la rechazaría por no ser entero.
    orden: Number.isFinite(orden.value) ? orden.value : 0,
  };

  try {
    if (modoEdicion.value && idCategoria.value !== null) {
      await actualizar(idCategoria.value, datos);
    } else {
      await crear(datos);
    }

    guardadoConExito.value = true;
    mostrarModalGuardar.value = false;
    notificarExito(
      modoEdicion.value ? 'Cambios guardados correctamente.' : 'Categoría creada correctamente.',
    );
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
      <p class="font-body-lg text-body-lg text-secondary mt-2">
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
        <div>
          <label for="codigo" class="block font-body-md text-body-md text-on-surface mb-2">
            Código <span class="text-secondary">(opcional)</span>
          </label>
          <input
            id="codigo"
            v-model="codigo"
            type="text"
            maxlength="50"
            placeholder="ITSP-01-01"
            :aria-invalid="errorVisible('codigo') !== null"
            aria-describedby="error-codigo"
            class="w-full h-touch-target px-3 border rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
            :class="
              errorVisible('codigo')
                ? 'border-error focus:border-error'
                : 'border-outline focus:border-on-surface'
            "
            @input="marcarTocado('codigo')"
            @blur="marcarTocado('codigo')"
          />
          <p
            v-if="errorVisible('codigo')"
            id="error-codigo"
            class="font-body-md text-body-md text-error mt-2"
          >
            {{ errorVisible('codigo') }}
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

      <div>
        <label for="idCategoriaPadre" class="block font-body-md text-body-md text-on-surface mb-2">
          Categoría padre
        </label>
        <select
          id="idCategoriaPadre"
          v-model="idCategoriaPadre"
          :disabled="tieneSubsecciones"
          class="w-full h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option :value="null">Ninguna — es una categoría raíz</option>
          <option v-for="raiz in opcionesCategoriaPadre" :key="raiz.id" :value="raiz.id">
            {{ raiz.nombre }}
          </option>
        </select>
        <p v-if="tieneSubsecciones" class="font-body-md text-body-md text-secondary mt-2">
          Esta categoría ya tiene subsecciones, por lo que debe permanecer como raíz: la jerarquía
          ITSP admite dos niveles.
        </p>
        <p v-else class="font-body-md text-body-md text-secondary mt-2">
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
