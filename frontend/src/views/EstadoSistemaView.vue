<script setup lang="ts">
import { computed, onMounted } from 'vue';

import InsigniaEstado from '@/components/InsigniaEstado.vue';
import TextoCarga from '@/components/TextoCarga.vue';
import { useEstadoSistema } from '@/composables/useEstadoSistema';
import type { TonoEstado } from '@/types/estado.types';

const { datos, cargando, error, cargar } = useEstadoSistema();

const ZONA_HORARIA = 'America/Costa_Rica';
const HORAS_RESPALDO_RECIENTE = 36;
const HORAS_RESPALDO_ACEPTABLE = 72;
const NO_DISPONIBLE = 'No disponible';

const formatoFechaHora = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: ZONA_HORARIA,
});

const formatoNumero = new Intl.NumberFormat('es-CR');
const formatoDecimal = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 });

function formatearFecha(valor: string | null): string {
  if (!valor) return NO_DISPONIBLE;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? NO_DISPONIBLE : formatoFechaHora.format(fecha);
}

function formatearBytes(valor: number | null): string {
  if (valor === null) return NO_DISPONIBLE;
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let cantidad = valor;
  let indice = 0;
  while (cantidad >= 1024 && indice < unidades.length - 1) {
    cantidad /= 1024;
    indice += 1;
  }
  return `${formatoDecimal.format(cantidad)} ${unidades[indice]}`;
}

function formatearNumero(valor: number | null): string {
  return valor === null ? NO_DISPONIBLE : formatoNumero.format(valor);
}

function formatearDuracion(segundos: number): string {
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias} d`);
  if (dias > 0 || horas > 0) partes.push(`${horas} h`);
  partes.push(`${minutos} min`);
  return partes.join(' ');
}

const estadoRespaldo = computed<{ tono: TonoEstado; texto: string } | null>(() => {
  const valor = datos.value?.ultimoRespaldo;
  if (!valor) return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  const horas = (Date.now() - fecha.getTime()) / 3_600_000;
  if (horas < HORAS_RESPALDO_RECIENTE) return { tono: 'exito', texto: 'Reciente' };
  if (horas < HORAS_RESPALDO_ACEPTABLE) return { tono: 'advertencia', texto: 'Más de 36 horas' };
  return { tono: 'peligro', texto: 'Desactualizado' };
});

const cargaInicial = computed(() => cargando.value && !datos.value);

onMounted(cargar);
</script>

<template>
  <div class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background">
    <div
      class="flex flex-col sm:flex-row sm:items-start justify-between gap-gutter-sm border-b border-surface-alt pb-gutter-sm"
    >
      <div class="min-w-0">
        <h1
          class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
        >
          Estado del sistema
        </h1>
        <p class="font-body-lg text-body-lg text-secondary mt-2">
          Consultado el {{ datos ? formatearFecha(datos.generadoEn) : '—' }}
        </p>
      </div>
      <button
        type="button"
        :disabled="cargando"
        class="h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center gap-2 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
        @click="cargar"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">refresh</span>
        {{ cargando ? 'Actualizando...' : 'Actualizar' }}
      </button>
    </div>

    <p v-if="cargaInicial" class="font-body-lg text-body-lg text-secondary">
      <TextoCarga />
    </p>

    <p
      v-else-if="error && !datos"
      role="alert"
      class="font-body-lg text-body-lg text-error"
    >
      {{ error }}
    </p>

    <p v-else-if="!datos" class="font-body-lg text-body-lg text-secondary">
      Sin datos para mostrar.
    </p>

    <template v-else>
      <p v-if="error" role="alert" class="font-body-md text-body-md text-error">{{ error }}</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-gutter-lg">
        <section
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-2"
          aria-labelledby="tarjeta-aplicacion"
        >
          <h2 id="tarjeta-aplicacion" class="font-label-sm text-label-sm text-tertiary uppercase">
            Aplicación
          </h2>
          <dl class="flex flex-col gap-1 font-body-md text-body-md text-on-surface">
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Versión del backend</dt>
              <dd>{{ datos.versionBackend ?? NO_DISPONIBLE }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Tiempo en línea</dt>
              <dd>{{ formatearDuracion(datos.tiempoEnLineaSegundos) }}</dd>
            </div>
          </dl>
        </section>

        <section
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-2"
          aria-labelledby="tarjeta-base-datos"
        >
          <h2 id="tarjeta-base-datos" class="font-label-sm text-label-sm text-tertiary uppercase">
            Base de datos
          </h2>
          <div>
            <InsigniaEstado
              :tono="datos.baseDatos.conectada ? 'exito' : 'peligro'"
              :texto="datos.baseDatos.conectada ? 'Conectada' : 'Sin conexión'"
            />
          </div>
          <dl class="flex flex-col gap-1 font-body-md text-body-md text-on-surface">
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Latencia</dt>
              <dd>
                {{
                  datos.baseDatos.latenciaMs === null
                    ? NO_DISPONIBLE
                    : `${formatoDecimal.format(datos.baseDatos.latenciaMs)} ms`
                }}
              </dd>
            </div>
          </dl>
        </section>

        <section
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-2"
          aria-labelledby="tarjeta-respaldo"
        >
          <h2 id="tarjeta-respaldo" class="font-label-sm text-label-sm text-tertiary uppercase">
            Último respaldo
          </h2>
          <div>
            <InsigniaEstado
              v-if="estadoRespaldo"
              :tono="estadoRespaldo.tono"
              :texto="estadoRespaldo.texto"
            />
            <span
              v-else
              class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border whitespace-nowrap bg-surface-container text-on-surface border-surface-alt"
            >
              {{ NO_DISPONIBLE }}
            </span>
          </div>
          <p class="font-body-md text-body-md text-on-surface">
            {{ formatearFecha(datos.ultimoRespaldo) }}
          </p>
        </section>

        <section
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-2"
          aria-labelledby="tarjeta-almacenamiento"
        >
          <h2
            id="tarjeta-almacenamiento"
            class="font-label-sm text-label-sm text-tertiary uppercase"
          >
            Almacenamiento de documentos
          </h2>
          <dl class="flex flex-col gap-1 font-body-md text-body-md text-on-surface">
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Archivos</dt>
              <dd>{{ formatearNumero(datos.almacenamiento.cantidadArchivos) }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Tamaño total</dt>
              <dd>{{ formatearBytes(datos.almacenamiento.tamanoTotalBytes) }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Espacio libre en disco</dt>
              <dd>{{ formatearBytes(datos.almacenamiento.espacioLibreBytes) }}</dd>
            </div>
          </dl>
        </section>

        <section
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-2"
          aria-labelledby="tarjeta-bitacora"
        >
          <h2 id="tarjeta-bitacora" class="font-label-sm text-label-sm text-tertiary uppercase">
            Bitácora
          </h2>
          <dl class="flex flex-col gap-1 font-body-md text-body-md text-on-surface">
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Retención</dt>
              <dd>
                {{
                  datos.bitacora.retencionMeses === null
                    ? NO_DISPONIBLE
                    : datos.bitacora.retencionMeses === 0
                      ? 'Sin purga'
                      : `${datos.bitacora.retencionMeses} ${datos.bitacora.retencionMeses === 1 ? 'mes' : 'meses'}`
                }}
              </dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Registro más antiguo</dt>
              <dd>{{ formatearFecha(datos.bitacora.registroMasAntiguo) }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-secondary">Total de registros</dt>
              <dd>{{ formatearNumero(datos.bitacora.totalRegistros) }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </template>
  </div>
</template>
