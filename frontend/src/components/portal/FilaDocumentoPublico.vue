<script setup lang="ts">
// src/components/portal/FilaDocumentoPublico.vue
//
// Un documento del listado, con sus dos acciones (RFP-05, RFP-06).
//
// "Ver" y "Descargar" son <a href>, no botones con axios: traer un PDF de
// hasta 40 MiB a un blob en memoria, dentro de un iframe y en un móvil,
// es la forma más rápida de que la pestaña muera. Así además el navegador
// hace la descarga progresiva y respeta el nombre que manda el servidor.
//
// `target="_blank"` desde dentro del iframe abre una PESTAÑA del
// navegador, no una ventana dentro del marco, que es justo lo que pide la
// decisión D-8. Lleva `rel="noopener"` por costumbre sana aunque el
// destino sea del mismo origen.
//
// La etiqueta del tipo y las etiquetas del documento son RECTANGULARES
// (radio secundario de 6 px). DESIGN.md reserva la forma de píldora a las
// insignias de estado, y aquí no hay ningún estado: solo lo publicado es
// visible.
//
// Los BOTONES sí son píldoras: es el aspecto de los del Observatorio, la
// excepción a DESIGN.md que vale solo en las vistas públicas (P-3). Por
// debajo de 480 px van a ancho completo, uno debajo del otro.

import portalPublicoService from '@/services/portalPublico.service';
import { formatearFechaPublicacion, formatearTamano } from '@/lib/portalPublico.config';
import type { DocumentoPublicoDto } from '@/types/portalPublico.types';

const props = defineProps<{ documento: DocumentoPublicoDto }>();

const urlVisualizar = portalPublicoService.urlVisualizar(props.documento);
const urlDescargar = portalPublicoService.urlDescargar(props.documento);
</script>

<template>
  <li class="rounded-lg border border-(--portal-borde) bg-(--portal-recuadro) p-4">
    <article class="flex flex-col gap-gutter-sm md:flex-row md:items-start md:justify-between">
      <div class="min-w-0 flex-1">
        <h3 class="text-body-lg font-bold text-(--portal-texto)">
          {{ documento.titulo }}
        </h3>

        <p v-if="documento.descripcion" class="mt-1 text-body-md text-(--portal-texto-secundario)">
          {{ documento.descripcion }}
        </p>

        <!-- Tipo y etiquetas: rectangulares, no píldoras (ver cabecera). -->
        <ul class="mt-2 flex flex-wrap items-center gap-2" aria-label="Clasificación del documento">
          <li
            class="rounded-secondary border border-(--portal-borde) px-2 py-1 text-xs font-semibold text-(--portal-texto)"
          >
            {{ documento.tipoDocumento }}
          </li>
          <li
            v-for="etiqueta in documento.etiquetas"
            :key="etiqueta"
            class="rounded-secondary border border-(--portal-borde) px-2 py-1 text-xs text-(--portal-texto)"
          >
            {{ etiqueta }}
          </li>
        </ul>

        <dl class="mt-2 flex flex-wrap gap-x-gutter-sm gap-y-1 text-body-md text-(--portal-texto-secundario)">
          <div v-if="documento.dependencia" class="flex gap-1">
            <dt class="sr-only">Dependencia</dt>
            <dd>{{ documento.dependencia }}</dd>
          </div>
          <div v-if="documento.fechaPublicacion" class="flex gap-1">
            <dt>Publicado el</dt>
            <dd>
              <time :datetime="documento.fechaPublicacion">
                {{ formatearFechaPublicacion(documento.fechaPublicacion) }}
              </time>
            </dd>
          </div>
          <div v-if="documento.numeroPaginas" class="flex gap-1">
            <dt class="sr-only">Páginas</dt>
            <dd>{{ documento.numeroPaginas }} págs.</dd>
          </div>
          <div v-if="formatearTamano(documento.tamanoBytes)" class="flex gap-1">
            <dt class="sr-only">Tamaño</dt>
            <dd>PDF, {{ formatearTamano(documento.tamanoBytes) }}</dd>
          </div>
        </dl>
      </div>

      <div class="flex shrink-0 flex-wrap gap-2 max-[480px]:flex-col">
        <a
          :href="urlVisualizar"
          target="_blank"
          rel="noopener"
          :aria-label="`Ver ${documento.titulo} (se abre en una pestaña nueva)`"
          class="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-full bg-(--portal-acento) px-gutter-lg text-base font-bold text-(--portal-texto) transition-colors hover:bg-(--portal-acento-hover) max-[480px]:w-full"
        >
          <span class="material-symbols-outlined text-base" aria-hidden="true">visibility</span>
          Ver
        </a>

        <a
          :href="urlDescargar"
          download
          :aria-label="`Descargar ${documento.titulo}`"
          class="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-full border border-(--portal-borde) px-gutter-lg text-base font-bold text-(--portal-texto) transition-colors hover:bg-(--portal-hover-secundario) max-[480px]:w-full"
        >
          <span class="material-symbols-outlined text-base" aria-hidden="true">download</span>
          Descargar
        </a>
      </div>
    </article>
  </li>
</template>
