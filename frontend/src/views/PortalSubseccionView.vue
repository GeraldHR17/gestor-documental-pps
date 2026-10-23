<script setup lang="ts">
// src/views/PortalSubseccionView.vue
//
// Lista de documentos de una subsección (RFP-04 a RFP-07), paginada con
// la paginación que trae el backend.
//
// El árbol se pide para las migas de pan y para el nombre de la
// subsección: el listado de documentos no incluye a qué subsección
// pertenece, y ponerlo en el título es lo que permite llegar aquí por un
// enlace directo y saber dónde se está.
//
// Si la URL es la de la subsección de Participación ciudadana, se muestra
// el mismo marcador que en su sección: esa sección no lleva documentos y
// el visitante no debe encontrarse un "sin documentos" seco después de
// haber leído "contenido próximamente".

import { computed, onMounted, watch } from 'vue';

import {
  usePortalPublicoDocumentos,
  usePortalPublicoSecciones,
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
import FilaDocumentoPublico from '@/components/portal/FilaDocumentoPublico.vue';
import PaginacionPublica from '@/components/portal/PaginacionPublica.vue';

const props = defineProps<{ seccion: string; subseccion: string }>();

const { cargarSecciones, seccionPorCodigo } = usePortalPublicoSecciones();
const {
  documentos: listaDocumentos,
  total: totalDocumentos,
  pagina: paginaDocumentos,
  limite: limiteDocumentos,
  cargando: cargandoDocumentos,
  error: errorDocumentos,
  noDisponible: documentosNoDisponibles,
  cargarDeSubseccion,
} = usePortalPublicoDocumentos();

const esParticipacion = computed(() => esSeccionSinDocumentos(props.seccion));

const seccion = computed(() => seccionPorCodigo(props.seccion));

const subseccion = computed(() =>
  seccion.value?.subsecciones.find(
    (hija) => hija.codigo.toLowerCase() === props.subseccion.toLowerCase(),
  ),
);

const migas = computed(() => [
  { texto: 'Transparencia', destino: { name: 'portal-secciones' } },
  {
    texto: seccion.value?.nombre ?? props.seccion,
    destino: { name: 'portal-seccion', params: { seccion: props.seccion.toLowerCase() } },
  },
  { texto: subseccion.value?.nombre ?? '...' },
]);

async function cargar(pagina = 1): Promise<void> {
  // El árbol llega de la caché del composable si ya se trajo en esta
  // carga del iframe; si se entró directamente por esta URL, se pide.
  await cargarSecciones();

  const titulo = subseccion.value?.nombre ?? seccion.value?.nombre;
  document.title = titulo ? `${titulo} — ${NOMBRE_DEL_PORTAL}` : NOMBRE_DEL_PORTAL;

  if (esParticipacion.value) return;

  await cargarDeSubseccion(props.seccion, props.subseccion, pagina);
}

function irAPagina(pagina: number): void {
  void cargar(pagina);
}

onMounted(() => cargar());
watch(() => [props.seccion, props.subseccion], () => cargar());
</script>

<template>
  <div>
    <MigasDePanPublicas :migas="migas" />

    <!-- La subsección de Participación ciudadana muestra el mismo
         marcador que su sección, no una lista vacía. -->
    <template v-if="esParticipacion">
      <header class="mb-gutter-lg">
        <PildoraContexto texto="Transparencia" class="mb-3" />
        <h1
          class="text-headline-lg-mobile font-bold text-(--portal-texto) md:text-headline-lg"
        >
          {{ seccion?.nombre ?? 'Participación ciudadana' }}
        </h1>
      </header>
      <VacioPortal
        icono="schedule"
        :titulo="MARCADOR_PARTICIPACION.titulo"
        :detalle="MARCADOR_PARTICIPACION.texto"
      />
    </template>

    <template v-else>
      <header class="mb-gutter-lg">
        <PildoraContexto :texto="seccion?.nombre ?? 'Transparencia'" class="mb-3" />
        <h1
          class="text-headline-lg-mobile font-bold text-(--portal-texto) md:text-headline-lg"
        >
          {{ subseccion?.nombre ?? 'Documentos' }}
        </h1>
        <p v-if="subseccion?.descripcion" class="mt-2 text-body-lg text-(--portal-texto-secundario)">
          {{ subseccion.descripcion }}
        </p>
      </header>

      <EsqueletoPortal v-if="cargandoDocumentos" forma="filas" :cuantos="4" />

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
  </div>
</template>
