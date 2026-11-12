<script setup lang="ts">
import { ref } from 'vue';

import { useFocoModal } from '@/composables/useFocoModal';

const emit = defineEmits<{ cerrar: [] }>();

const dialogo = ref<HTMLElement | null>(null);
const botonCerrar = ref<HTMLElement | null>(null);
const { manejarTabulacion } = useFocoModal(dialogo, botonCerrar);

const fechaCompilacion = (() => {
  const fecha = new Date(__FECHA_COMPILACION__);
  if (Number.isNaN(fecha.getTime())) return 'sin-datos';
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Costa_Rica',
  }).format(fecha);
})();

const CREDITOS: { titulo: string; lineas: string[] }[] = [
  {
    titulo: 'Muni Data',
    lineas: [
      'Sistema Integral de Gestión Documental y Portal Web de Gobierno Abierto y Transparencia Municipal',
      'Municipalidad de Palmares, Costa Rica',
    ],
  },
  { titulo: 'Desarrollo', lineas: ['Gerald Huertas Rodríguez'] },
  {
    titulo: 'Práctica Profesional Supervisada 2026',
    lineas: [
      'Universidad Nacional de Costa Rica (UNA)',
      'Ingeniería en Sistemas de Información',
    ],
  },
  {
    titulo: 'Supervisor técnico y Product Owner',
    lineas: ['Joseph Granda Vargas', 'Jefe de TICs, Municipalidad de Palmares'],
  },
  {
    titulo: 'Supervisión académica',
    lineas: ['MSc. Cristian Gerardo Herrera Alvarado', 'UNA'],
  },
  { titulo: 'Tecnologías', lineas: ['NestJS · Vue 3 · MySQL · TypeScript'] },
  {
    titulo: 'Compilación',
    lineas: [
      `Versión ${__VERSION_APLICACION__}`,
      `Commit ${__COMMIT_APLICACION__}`,
      fechaCompilacion,
    ],
  },
];

function alPresionarTecla(evento: KeyboardEvent): void {
  if (evento.key === 'Escape') {
    evento.stopPropagation();
    emit('cerrar');
    return;
  }
  manejarTabulacion(evento);
}
</script>

<template>
  <div class="velo-acerca-de" @click.self="emit('cerrar')">
    <div
      ref="dialogo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-acerca-de"
      class="dialogo-acerca-de"
      @keydown="alPresionarTecla"
    >
      <div class="cabecera-acerca-de">
        <h2 id="titulo-acerca-de" class="titulo-acerca-de">Acerca de Muni Data</h2>
      </div>

      <div class="rodillo-creditos" tabindex="0" aria-label="Créditos">
        <div class="contenido-creditos">
          <section v-for="bloque in CREDITOS" :key="bloque.titulo" class="bloque-creditos">
            <h3 class="titulo-bloque">{{ bloque.titulo }}</h3>
            <p v-for="linea in bloque.lineas" :key="linea" class="linea-credito">{{ linea }}</p>
          </section>
        </div>
      </div>

      <div class="pie-acerca-de">
        <button
          ref="botonCerrar"
          type="button"
          class="boton-cerrar h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors"
          @click="emit('cerrar')"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.velo-acerca-de {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(10 12 17 / 0.6);
}

.dialogo-acerca-de {
  width: 100%;
  max-width: 34rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border-top: 4px solid #d30505;
  background: #1d2327;
  color: #f1f1f1;
  font-family: 'Public Sans', ui-sans-serif, system-ui, sans-serif;
  box-shadow: 0 12px 32px rgb(10 12 17 / 0.45);
}

.titulo-acerca-de {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #ffffff;
}

.rodillo-creditos {
  position: relative;
  height: 18rem;
  overflow: hidden;
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.03);
  text-align: center;
}

.contenido-creditos {
  padding: 18rem 1rem;
  animation: desplazamiento-creditos 32s linear infinite;
}

.rodillo-creditos:hover .contenido-creditos,
.rodillo-creditos:focus .contenido-creditos,
.rodillo-creditos:focus-within .contenido-creditos {
  animation-play-state: paused;
}

.bloque-creditos {
  margin-bottom: 2rem;
}

.titulo-bloque {
  margin: 0 0 0.375rem;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ff8a80;
}

.bloque-creditos:first-child .titulo-bloque {
  font-size: 1.75rem;
  letter-spacing: normal;
  text-transform: none;
  color: #ffffff;
  border-bottom: 2px solid #d30505;
  display: inline-block;
  padding-bottom: 0.25rem;
  margin-bottom: 0.75rem;
}

.linea-credito {
  margin: 0;
  line-height: 1.5;
  color: #e6e6e6;
}

.pie-acerca-de {
  display: flex;
  justify-content: flex-end;
}

.rodillo-creditos:focus-visible,
.boton-cerrar:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

@keyframes desplazamiento-creditos {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rodillo-creditos {
    overflow-y: auto;
  }

  .contenido-creditos {
    padding: 1rem;
    animation: none;
  }
}
</style>
