<script setup lang="ts">
// src/views/PortalSeccionView.vue
//
// Página de una sección: sus subsecciones como recuadros (RFP-02, RFP-03)
// y, si los hay, los documentos colgados directamente de la raíz.
//
// Lo de los documentos directos no es hipotético: el modelo permite
// clasificar en una raíz, y el backend expone una ruta para listarlos.
// Sin esto, esos documentos se contarían en el árbol y no habría forma de
// abrirlos. Se piden SOLO cuando el conteo de la sección supera la suma
// de sus subsecciones, para no hacer una petición de más en el caso
// normal, que es el de hoy.
//
// PARTICIPACIÓN CIUDADANA es la única excepción del portal: muestra el
// marcador y nada más. Vive aquí, en la vista, y se reconoce con
// `esSeccionSinDocumentos`, que reutiliza CODIGO_CATEGORIA_RAIZ_EXCLUIDA;
// el backend no inventa excepciones y sigue devolviendo sus subsecciones.

import { computed, onMounted, watch } from 'vue';

import {
  usePortalPublicoDocumentos,
  usePortalPublicoSeccion,
} from '@/composables/usePortalPublico';
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
import MigasDePanPublicas from '@/components/portal/MigasDePanPublicas.vue';
import TarjetaSubseccion from '@/components/portal/TarjetaSubseccion.vue';
import FilaDocumentoPublico from '@/components/portal/FilaDocumentoPublico.vue';
import PaginacionPublica from '@/components/portal/PaginacionPublica.vue';

const props = defineProps<{ seccion: string }>();

const { seccion: datos, cargando, error, noDisponible, cargarSeccion } = usePortalPublicoSeccion();

const {
  documentos: listaDocumentos,
  total: totalDocumentos,
  pagina: paginaDocumentos,
  limite: limiteDocumentos,
  cargando: cargandoDocumentos,
  error: errorDocumentos,
  noDisponible: documentosNoDisponibles,
  cargarDeSeccion,
} = usePortalPublicoDocumentos();

const esParticipacion = computed(() => esSeccionSinDocumentos(datos.value?.codigo));

const subsecciones = computed(() => datos.value?.subsecciones ?? []);

/**
 * ¿La sección tiene documentos propios? Se deduce comparando su conteo
 * con la suma de sus subsecciones, sin pedir nada al servidor.
 */
const documentosPropios = computed(() => {
  if (!datos.value) return 0;
  const enSubsecciones = datos.value.subsecciones.reduce(
    (total, hija) => total + hija.cantidadDocumentos,
    0,
  );
  return Math.max(0, datos.value.cantidadDocumentos - enSubsecciones);
});

const migas = computed(() => [
  { texto: 'Transparencia', destino: { name: 'portal-secciones' } },
  { texto: datos.value?.nombre ?? '...' },
]);

async function cargar(): Promise<void> {
  await cargarSeccion(props.seccion);

  if (datos.value) {
    document.title = `${datos.value.nombre} — ${NOMBRE_DEL_PORTAL}`;
  }

  if (datos.value && !esParticipacion.value && documentosPropios.value > 0) {
    await cargarDeSeccion(datos.value.codigo, 1);
  }
}

function irAPagina(pagina: number): void {
  if (datos.value) void cargarDeSeccion(datos.value.codigo, pagina);
}

onMounted(cargar);
// El iframe no se recarga al navegar entre secciones: hay que reaccionar
// al cambio del parámetro de la ruta.
watch(() => props.seccion, cargar);
</script>

<template>
  <div>
    <EsqueletoPortal v-if="cargando" forma="tarjetas" :cuantos="4" />

    <ErrorPortal
      v-else-if="error"
      :mensaje="error"
      :no-disponible="noDisponible"
      @reintentar="cargar"
    />

    <template v-else-if="datos">
      <MigasDePanPublicas :migas="migas" />

      <header class="mb-gutter-lg">
        <PildoraContexto texto="Transparencia" class="mb-3" />
        <h1
          class="text-headline-lg-mobile font-bold text-(--portal-texto) md:text-headline-lg"
        >
          {{ datos.nombre }}
        </h1>
        <p v-if="datos.descripcion" class="mt-2 text-body-lg text-(--portal-texto-secundario)">
          {{ datos.descripcion }}
        </p>
      </header>

      <!-- Participación ciudadana: solo el marcador, sin recuadros. -->
      <VacioPortal
        v-if="esParticipacion"
        icono="schedule"
        :titulo="MARCADOR_PARTICIPACION.titulo"
        :detalle="MARCADOR_PARTICIPACION.texto"
      />

      <template v-else>
        <ul v-if="subsecciones.length > 0" class="grid gap-gutter-sm sm:grid-cols-2">
          <TarjetaSubseccion
            v-for="subseccion in subsecciones"
            :key="subseccion.codigo"
            :subseccion="subseccion"
            :codigo-seccion="datos.codigo"
          />
        </ul>

        <!-- Documentos colgados de la propia sección, si los hubiera. -->
        <section v-if="documentosPropios > 0" class="mt-gutter-lg">
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
          v-else-if="subsecciones.length === 0"
          :titulo="TEXTOS.sinDocumentos"
          :detalle="TEXTOS.sinSubsecciones"
        />
      </template>
    </template>
  </div>
</template>
