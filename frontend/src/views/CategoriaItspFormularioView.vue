<script setup lang="ts">
// Formulario de categoría ITSP. Lo propio frente a los catálogos planos es
// el selector de "categoría padre": al crear, dejarlo vacío crea una
// categoría raíz y elegir cualquier otra crea una subcategoría debajo,
// hasta PROFUNDIDAD_MAXIMA_CATEGORIAS niveles. El nivel no se pide nunca,
// lo deriva el backend del padre, así que aquí no hay campo para él.
//
// El código tampoco se escribe: lo asigna el backend (código del padre +
// "-MM") y forma parte de la URL pública que se pega en WordPress. Al crear
// sólo se muestra el previsto; al editar se ve en solo lectura. Por la
// misma razón, al editar una raíz no se ofrece padre, y una subcategoría
// puede moverse bajo cualquier otra categoría salvo ella misma y su
// subárbol, avisando antes de cuántas direcciones públicas cambiarán
// (spec-ajustes-posdespliegue §9.1; spec-ajustes-niveles-y-estados D-18).
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useCategoriasItsp } from '@/composables/useCategoriasItsp';
import { categoriasItspService } from '@/services/catalogos.service';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import SelectorBusqueda, { type OpcionBusqueda } from '@/components/SelectorBusqueda.vue';
import { PROFUNDIDAD_MAXIMA_CATEGORIAS } from '@/lib/documentos.config';
import { normalizarParaBuscar } from '@/lib/categorias';
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

const { jerarquia, listar, crear, actualizar, obtenerSiguienteCodigo } = useCategoriasItsp();
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
  marcarTocado('padre');
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
 * Por qué una categoría no puede ser la superior de esta, o `null` si
 * puede. Son las reglas del servidor: ni ella misma ni su subárbol, y sin
 * pasar del tope contando los niveles que trae consigo (al editar, su
 * altura). Se muestran aquí para que la persona no las descubra por un
 * error; las inactivas sí se ofrecen (D-18).
 */
function motivoPadreNoValido(idDestino: number): string | null {
  const j = jerarquia.value;
  const propia = modoEdicion.value ? idCategoria.value : null;
  if (propia !== null && j.estaEnSubarbol(idDestino, propia)) {
    return 'es esta misma categoría o una de sus subcategorías';
  }
  const nivelesQueOcupa = propia !== null ? j.altura(propia) : 1;
  if (j.profundidad(idDestino) + nivelesQueOcupa > PROFUNDIDAD_MAXIMA_CATEGORIAS) {
    return `se superaría el máximo de ${PROFUNDIDAD_MAXIMA_CATEGORIAS} niveles`;
  }
  return null;
}

const opcionesCategoriaPadre = computed<OpcionBusqueda[]>(() =>
  jerarquia.value.ordenDeDespliegue().map((categoria) => {
    const motivo = motivoPadreNoValido(categoria.id);
    return {
      id: categoria.id,
      etiqueta: jerarquia.value.rutaComoTexto(categoria.id),
      detalle: categoria.estado === 'ACTIVO' ? categoria.codigo : `${categoria.codigo} · inactiva`,
      ...(motivo ? { deshabilitada: true, motivo } : {}),
    };
  }),
);

function buscarCategoriaPadre(texto: string): Promise<OpcionBusqueda[]> {
  const termino = normalizarParaBuscar(texto);
  return Promise.resolve(
    termino
      ? opcionesCategoriaPadre.value.filter(
          (opcion) =>
            normalizarParaBuscar(opcion.etiqueta).includes(termino) ||
            normalizarParaBuscar(opcion.detalle ?? '').includes(termino),
        )
      : opcionesCategoriaPadre.value,
  );
}

function resolverRutaPadre(id: number): Promise<string | null> {
  return Promise.resolve(jerarquia.value.obtener(id) ? jerarquia.value.rutaComoTexto(id) : null);
}

/** Nivel en el que quedará la categoría con el padre elegido. */
const nivelResultante = computed(() =>
  idCategoriaPadre.value === null ? 1 : jerarquia.value.profundidad(idCategoriaPadre.value) + 1,
);

/** Al editar: cuántas subcategorías se mueven con ella (y cambian de URL). */
const subcategoriasQueSeMueven = computed(() =>
  modoEdicion.value && idCategoria.value !== null
    ? jerarquia.value.descendientes(idCategoria.value).length
    : 0,
);

// ---------- Validación en tiempo real ----------

type CampoValidado = 'nombre' | 'descripcion' | 'padre';

const camposTocados = reactive<Record<CampoValidado, boolean>>({
  nombre: false,
  descripcion: false,
  padre: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

const errores = computed<Record<CampoValidado, string | null>>(() => ({
  nombre: validarNombreCatalogo(nombre.value, LONGITUD_MAXIMA_NOMBRE),
  descripcion: validarDescripcionCatalogo(descripcion.value),
  padre: validarPadre(),
}));

function validarPadre(): string | null {
  if (esRaizEnEdicion.value) return null;
  if (idCategoriaPadre.value === null) {
    // Una subcategoría no pasa a raíz (ni al revés): su código cambiaría de forma.
    return modoEdicion.value
      ? 'Una subcategoría no puede pasar a ser raíz: elija su categoría superior.'
      : null;
  }
  const motivo = motivoPadreNoValido(idCategoriaPadre.value);
  return motivo ? `No se puede elegir esa categoría: ${motivo}.` : null;
}

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
    // La lista completa hace falta para el selector de categoría padre y
    // para saber qué subcategorías se moverían con esta.
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

/** Al mover una subcategoría: el código que tendría bajo la superior nueva. */
const codigoNuevoPrevisto = ref<string | null>(null);

const tituloModalGuardar = computed(() => {
  if (cambiaDePadre.value) return 'Mover categoría';
  return modoEdicion.value ? 'Guardar cambios' : 'Crear categoría';
});
const mensajeModalGuardar = computed(() => {
  if (cambiaDePadre.value) {
    // Texto de RF-10, con los códigos reales y cuántas direcciones cambian
    // (el subárbol entero se recodifica con ella).
    const cambio = `El código y la URL cambiarán de ${codigoActual.value} a ${codigoNuevoPrevisto.value}`;
    const subcategorias = subcategoriasQueSeMueven.value;
    if (subcategorias === 0) return `${cambio}; el enlace en WordPress deberá actualizarse.`;
    const arrastre =
      subcategorias === 1
        ? 'y también los de su subcategoría'
        : `y también los de sus ${subcategorias} subcategorías`;
    return `${cambio}, ${arrastre}: cambiarán ${subcategorias + 1} direcciones públicas en total. Los enlaces en WordPress deberán actualizarse.`;
  }
  return modoEdicion.value
    ? '¿Confirma que desea guardar los cambios de esta categoría?'
    : '¿Confirma que desea crear esta categoría?';
});

async function solicitarGuardado(): Promise<void> {
  if (!formularioValido.value) return;

  if (cambiaDePadre.value) {
    // El aviso necesita el código nuevo antes de guardar: lo calcula el
    // servidor con las hijas actuales de la categoría destino.
    preparandoGuardado.value = true;
    try {
      codigoNuevoPrevisto.value = await obtenerSiguienteCodigo(idCategoriaPadre.value);
    } catch (err) {
      notificarError(err, 'No se pudo calcular el código nuevo de la categoría.');
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
  // subcategoría cambió de superior: así la bitácora no lo anota como
  // cambiado cuando no lo fue.
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
      const subcategorias = subcategoriasQueSeMueven.value;
      const guardada = await actualizar(idCategoria.value, datos);
      // El código final puede no ser el previsto si otra persona guardó
      // una categoría en ese destino entre medio: se informa el real.
      const arrastre = subcategorias > 0 ? ' (también cambiaron los de sus subcategorías)' : '';
      mensajeExito = movida
        ? `Cambios guardados. El nuevo código es ${guardada.codigo}${arrastre}: actualice los enlaces en WordPress.`
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
        subcategoría debajo (hasta {{ PROFUNDIDAD_MAXIMA_CATEGORIAS }} niveles).
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
          Nombre de la categoría
        </label>
        <input
          id="nombre"
          v-model="nombre"
          type="text"
          :maxlength="LONGITUD_MAXIMA_NOMBRE"
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
            class="w-full h-touch-target px-3 border border-outline rounded-primary bg-surface-container-lowest text-on-surface focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg"
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
          Es una categoría raíz. No puede convertirse en subcategoría: su código y su dirección
          pública dejarían de tener sentido.
        </p>
      </div>
      <div v-else>
        <label for="idCategoriaPadre" class="block font-body-md text-body-md text-on-surface mb-2">
          Categoría padre
        </label>
        <!-- Vacío = «Ninguna»: al crear, es una raíz; al editar una
             subcategoría no se admite (no pasa a raíz) y lo dice el error. -->
        <SelectorBusqueda
          v-model="idCategoriaPadre"
          id-entrada="idCategoriaPadre"
          etiqueta-accesible="Categoría padre"
          :placeholder="
            modoEdicion
              ? 'Escriba para buscar la categoría superior'
              : 'Ninguna — es una categoría raíz. Escriba para buscar una superior'
          "
          :buscar="buscarCategoriaPadre"
          :resolver-etiqueta="resolverRutaPadre"
        />
        <p
          v-if="errorVisible('padre')"
          id="ayuda-padre"
          class="font-body-md text-body-md text-error mt-2"
        >
          {{ errorVisible('padre') }}
        </p>
        <p
          v-else-if="cambiaDePadre"
          id="ayuda-padre"
          class="font-body-md text-body-md text-on-surface mt-2"
        >
          Al moverla cambiarán su código y su dirección pública<template
            v-if="subcategoriasQueSeMueven > 0"
            >, y los de sus {{ subcategoriasQueSeMueven }}
            {{ subcategoriasQueSeMueven === 1 ? 'subcategoría' : 'subcategorías' }}</template
          >. Quedará en el nivel {{ nivelResultante }}. Antes de guardar se mostrará el código
          nuevo.
        </p>
        <p v-else id="ayuda-padre" class="font-body-md text-body-md text-secondary mt-2">
          Quedará en el nivel {{ nivelResultante }} de {{ PROFUNDIDAD_MAXIMA_CATEGORIAS }}. Se
          muestra la ruta completa; las que no se pueden elegir aparecen deshabilitadas con el
          motivo.
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
