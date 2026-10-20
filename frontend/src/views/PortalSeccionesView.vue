<script setup lang="ts">
// src/views/PortalSeccionesView.vue
//
// Portada del portal: las cuatro secciones del índice ITSP (RFP-01,
// RFP-09). La usa la página de prueba y cualquier enlace que no apunte a
// una sección concreta; en WordPress, cada página del menú entra
// directamente a su sección, así que esta vista se ve menos de lo que
// parece, pero tiene que existir y estar bien.
//
// El orden lo manda la API (por `orden` y, a igualdad, por nombre): aquí
// no se reordena nada.

import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';

import { usePortalPublicoSecciones } from '@/composables/usePortalPublico';
import {
  NOMBRE_DEL_PORTAL,
  TEXTOS,
  describirCantidad,
  esSeccionSinDocumentos,
} from '@/lib/portalPublico.config';
import EsqueletoPortal from '@/components/portal/EsqueletoPortal.vue';
import ErrorPortal from '@/components/portal/ErrorPortal.vue';

const { secciones, cargando, error, cargarSecciones } = usePortalPublicoSecciones();

onMounted(() => {
  document.title = NOMBRE_DEL_PORTAL;
  void cargarSecciones();
});

function reintentar(): void {
  void cargarSecciones(true);
}
</script>

<template>
  <div>
    <header class="mb-gutter-lg">
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
        Transparencia
      </h1>
      <p class="mt-2 font-body-lg text-body-lg text-secondary">
        Documentos públicos de la Municipalidad de Palmares, organizados según el Índice de
        Transparencia del Sector Público.
      </p>
    </header>

    <EsqueletoPortal v-if="cargando" forma="tarjetas" :cuantos="4" />

    <ErrorPortal v-else-if="error" :mensaje="error" @reintentar="reintentar" />

    <ul v-else class="grid gap-gutter-sm sm:grid-cols-2">
      <li v-for="seccion in secciones" :key="seccion.codigo">
        <RouterLink
          :to="{ name: 'portal-seccion', params: { seccion: seccion.codigo.toLowerCase() } }"
          class="group flex h-full flex-col rounded-primary border border-surface-alt bg-pure-white p-gutter-lg transition-colors hover:border-outline hover:bg-surface-container-low"
        >
          <span class="flex items-start justify-between gap-3">
            <span class="font-headline-md text-headline-md text-on-surface">
              {{ seccion.nombre }}
            </span>
            <span
              class="material-symbols-outlined shrink-0 text-primary transition-transform group-hover:translate-x-1"
              aria-hidden="true"
              >arrow_forward</span
            >
          </span>

          <span v-if="seccion.descripcion" class="mt-2 font-body-md text-body-md text-secondary">
            {{ seccion.descripcion }}
          </span>

          <!-- Participación ciudadana no clasifica documentos: anunciar
               "Sin documentos" invitaría a entrar a buscar algo que no
               hay. Se dice lo que es. -->
          <span class="mt-auto pt-gutter-sm font-label-sm text-label-sm text-secondary">
            {{
              esSeccionSinDocumentos(seccion.codigo)
                ? 'Contenido próximamente'
                : describirCantidad(seccion.cantidadDocumentos)
            }}
          </span>
        </RouterLink>
      </li>
    </ul>

    <p v-if="!cargando && !error && secciones.length === 0" class="font-body-lg text-body-lg text-secondary">
      {{ TEXTOS.sinSubsecciones }}
    </p>
  </div>
</template>
