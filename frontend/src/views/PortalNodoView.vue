<script setup lang="ts">
// src/views/PortalNodoView.vue
//
// Página de cualquier categoría del índice, de cualquier nivel
// (spec-ajustes-niveles-y-estados §9.4). Reemplaza a PortalSeccionView y
// PortalSubseccionView, que solo sabían de dos niveles, y se alimenta de
// `GET /publico/categorias/:codigo`.
//
// Sirve a las dos rutas de siempre:
//  - `/vista/:seccion` abre CUALQUIER nodo visible por su código, también
//    los de nivel 3 o más (D-1);
//  - `/vista/:seccion/:subseccion` exige, como antes, que la subsección sea
//    hija directa de esa sección; si no, «no disponible».
//
// Muestra, según lo que tenga el nodo: las tarjetas de sus hijas, sus
// documentos propios paginados o el mensaje de que no hay contenido. Las
// raíces y los nodos con hijas se ven como la antigua página de sección;
// los nodos finales, como la antigua de subsección. No hay migas de pan
// (B): la ubicación la dicen la píldora (el padre, o «Transparencia» en
// una raíz) y el título.
//
// PARTICIPACIÓN CIUDADANA sigue siendo la única excepción: cualquier nodo
// de su subárbol muestra el marcador y nada más. Se reconoce por la raíz
// de la ruta (D-11), no por el código del nodo.

import { computed, onMounted, watch } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import { usePortalPublicoDocumentos, usePortalPublicoNodo } from '@/composables/usePortalPublico';
import {
  MARCADOR_PARTICIPACION,
  NOMBRE_DEL_PORTAL,
  TEXTOS,
  esSeccionSinDocumentos,
} from '@/lib/portalPublico.config';
import EsqueletoPortal from '@/components/portal/EsqueletoPortal.vue';
import ErrorPortal from '@/components/portal/ErrorPortal.vue';
import PildoraContexto from '@/components/portal/PildoraContexto.vue';
import VacioPortal from '@/components/portal/VacioPortal.vue';
import TarjetaSubseccion from '@/components/portal/TarjetaSubseccion.vue';
import FilaDocumentoPublico from '@/components/portal/FilaDocumentoPublico.vue';
import PaginacionPublica from '@/components/portal/PaginacionPublica.vue';
import type { HijaPublicaDto } from '@/types/portalPublico.types';

const props = defineProps<{ seccion: string; subseccion?: string }>();

const { nodo, cargando, error, noDisponible, cargarNodo, marcarNoDisponible } =
  usePortalPublicoNodo();

const {
  documentos: listaDocumentos,
  total: totalDocumentos,
  pagina: paginaDocumentos,
  limite: limiteDocumentos,
  cargando: cargandoDocumentos,
  error: errorDocumentos,
  noDisponible: documentosNoDisponibles,
  cargarDeNodo,
} = usePortalPublicoDocumentos();

const esRaiz = computed(() => (nodo.value?.ruta.length ?? 0) === 0);

const raiz = computed(() => nodo.value?.ruta[0] ?? nodo.value);

const esParticipacion = computed(() => esSeccionSinDocumentos(raiz.value?.codigo));

const hijos = computed(() => nodo.value?.hijos ?? []);

/** Raíz o con hijas: se ve como página de sección; si no, como lista. */
const comoSeccion = computed(() => esRaiz.value || hijos.value.length > 0);

const textoPildora = computed(() => {
  return nodo.value?.ruta.at(-1)?.nombre ?? 'Transparencia';
});

/**
 * D-3: las hijas directas de una raíz conservan la URL de dos segmentos
 * que ya está pegada en WordPress; de ahí para abajo, `/vista/:codigo`.
 */
function destinoDe(hija: HijaPublicaDto): RouteLocationRaw {
  const codigoHija = hija.codigo.toLowerCase();
  if (esRaiz.value && nodo.value) {
    return {
      name: 'portal-subseccion',
      params: { seccion: nodo.value.codigo.toLowerCase(), subseccion: codigoHija },
    };
  }
  return { name: 'portal-seccion', params: { seccion: codigoHija } };
}

async function cargar(): Promise<void> {
  const codigo = props.subseccion ?? props.seccion;
  await cargarNodo(codigo);

  // URL de dos segmentos: la subsección tiene que colgar directamente de
  // esa sección, como antes de los N niveles.
  if (props.subseccion !== undefined && nodo.value) {
    const ruta = nodo.value.ruta;
    if (ruta.length !== 1 || ruta[0]?.codigo.toLowerCase() !== props.seccion.toLowerCase()) {
      marcarNoDisponible();
    }
  }

  if (!nodo.value) return;

  document.title = `${nodo.value.nombre} — ${NOMBRE_DEL_PORTAL}`;

  if (!esParticipacion.value && nodo.value.documentosPropios > 0) {
    await cargarDeNodo(nodo.value.codigo, 1);
  }
}

function irAPagina(pagina: number): void {
  if (nodo.value) void cargarDeNodo(nodo.value.codigo, pagina);
}

onMounted(cargar);
// El iframe no se recarga al navegar entre páginas del portal: hay que
// reaccionar al cambio de los parámetros de la ruta.
watch(() => [props.seccion, props.subseccion], cargar);
</script>

<template>
  <div>
    <EsqueletoPortal
      v-if="cargando"
      :forma="subseccion === undefined ? 'tarjetas' : 'filas'"
      :cuantos="4"
    />

    <ErrorPortal
      v-else-if="error"
      :mensaje="error"
      :no-disponible="noDisponible"
      @reintentar="cargar"
    />

    <!-- Participación ciudadana: solo el marcador, sin recuadros ni lista. -->
    <template v-else-if="nodo && esParticipacion">
      <header class="mb-gutter-lg">
        <PildoraContexto texto="Transparencia" class="mb-3" />
        <h1
          class="text-headline-lg-mobile font-bold text-(--portal-texto) md:text-headline-lg"
        >
          {{ raiz?.nombre ?? nodo.nombre }}
        </h1>
        <p
          v-if="esRaiz && nodo.descripcion"
          class="mt-2 text-body-lg text-(--portal-texto-secundario)"
        >
          {{ nodo.descripcion }}
        </p>
      </header>
      <VacioPortal
        icono="schedule"
        :titulo="MARCADOR_PARTICIPACION.titulo"
        :detalle="MARCADOR_PARTICIPACION.texto"
      />
    </template>

    <template v-else-if="nodo">
      <header class="mb-gutter-lg">
        <PildoraContexto :texto="textoPildora" class="mb-3" />
        <h1
          class="text-headline-lg-mobile font-bold text-(--portal-texto) md:text-headline-lg"
        >
          {{ nodo.nombre }}
        </h1>
        <p v-if="nodo.descripcion" class="mt-2 text-body-lg text-(--portal-texto-secundario)">
          {{ nodo.descripcion }}
        </p>
      </header>

      <!-- Raíz o nodo con hijas: tarjetas y, si los hay, sus documentos propios. -->
      <template v-if="comoSeccion">
        <ul v-if="hijos.length > 0" class="grid gap-gutter-sm sm:grid-cols-2">
          <TarjetaSubseccion
            v-for="hija in hijos"
            :key="hija.codigo"
            :subseccion="hija"
            :destino="destinoDe(hija)"
          />
        </ul>

        <section v-if="nodo.documentosPropios > 0" class="mt-gutter-lg">
          <h2 class="mb-gutter-sm text-headline-sm font-bold text-(--portal-texto)">
            {{ TEXTOS.documentosDeLaSeccion }}
          </h2>

          <EsqueletoPortal v-if="cargandoDocumentos" forma="filas" :cuantos="3" />

          <ErrorPortal
            v-else-if="errorDocumentos"
            :mensaje="errorDocumentos"
            :no-disponible="documentosNoDisponibles"
            @reintentar="irAPagina(paginaDocumentos)"
          />

          <template v-else>
            <ul class="flex flex-col gap-3">
              <FilaDocumentoPublico
                v-for="documento in listaDocumentos"
                :key="documento.id"
                :documento="documento"
              />
            </ul>

            <PaginacionPublica
              :pagina="paginaDocumentos"
              :limite="limiteDocumentos"
              :total="totalDocumentos"
              :cargando="cargandoDocumentos"
              @ir="irAPagina"
            />
          </template>
        </section>

        <VacioPortal
          v-else-if="hijos.length === 0"
          :titulo="TEXTOS.sinDocumentos"
          :detalle="TEXTOS.sinSubsecciones"
        />
      </template>

      <!-- Nodo final: su lista de documentos, o el aviso de que no hay. -->
      <template v-else>
        <VacioPortal
          v-if="nodo.documentosPropios === 0"
          :titulo="TEXTOS.sinDocumentos"
          :detalle="TEXTOS.sinDocumentosDetalle"
        />

        <EsqueletoPortal v-else-if="cargandoDocumentos" forma="filas" :cuantos="4" />

        <ErrorPortal
          v-else-if="errorDocumentos"
          :mensaje="errorDocumentos"
          :no-disponible="documentosNoDisponibles"
          @reintentar="irAPagina(paginaDocumentos)"
        />

        <VacioPortal
          v-else-if="listaDocumentos.length === 0"
          :titulo="TEXTOS.sinDocumentos"
          :detalle="TEXTOS.sinDocumentosDetalle"
        />

        <template v-else>
          <ul class="flex flex-col gap-3">
            <FilaDocumentoPublico
              v-for="documento in listaDocumentos"
              :key="documento.id"
              :documento="documento"
            />
          </ul>

          <PaginacionPublica
            :pagina="paginaDocumentos"
            :limite="limiteDocumentos"
            :total="totalDocumentos"
            :cargando="cargandoDocumentos"
            @ir="irAPagina"
          />
        </template>
      </template>
    </template>
  </div>
</template>
