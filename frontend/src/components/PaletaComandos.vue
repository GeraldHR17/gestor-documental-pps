<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAutenticacion } from '@/composables/useAutenticacion';
import { useFocoModal } from '@/composables/useFocoModal';
import { useTema } from '@/composables/useTema';
import {
  ENLACES,
  ENLACES_CATALOGOS,
  ROL_ADMINISTRADOR_SISTEMA,
  visiblesSegunPermisos,
} from '@/lib/navegacion';

interface Comando {
  id: string;
  etiqueta: string;
  icono: string;
  ejecutar: () => void;
}

const emit = defineEmits<{ cerrar: []; 'solicitar-cierre-sesion': [] }>();

const router = useRouter();
const { tienePermiso, esRol } = useAutenticacion();
const { alternarTema } = useTema();

const dialogo = ref<HTMLElement | null>(null);
const campoBusqueda = ref<HTMLInputElement | null>(null);
const { manejarTabulacion } = useFocoModal(dialogo, campoBusqueda);

const consulta = ref('');
const indiceActivo = ref(0);

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function irA(nombreRuta: string): () => void {
  return () => {
    void router.push({ name: nombreRuta });
  };
}

const comandos = computed<Comando[]>(() => {
  const navegacion = [
    ...visiblesSegunPermisos(ENLACES, tienePermiso),
    ...visiblesSegunPermisos(ENLACES_CATALOGOS, tienePermiso),
  ].map<Comando>((enlace) => ({
    id: `ir-${enlace.nombreRuta}`,
    etiqueta: `Ir a ${enlace.etiqueta}`,
    icono: enlace.icono,
    ejecutar: irA(enlace.nombreRuta),
  }));

  const lista: Comando[] = [...navegacion];

  if (router.hasRoute('documento-nuevo') && tienePermiso('documentos.crear')) {
    lista.push({
      id: 'registrar-documento',
      etiqueta: 'Registrar documento',
      icono: 'note_add',
      ejecutar: irA('documento-nuevo'),
    });
  }

  if (esRol(ROL_ADMINISTRADOR_SISTEMA) && router.hasRoute('estado-sistema')) {
    lista.push({
      id: 'estado-sistema',
      etiqueta: 'Estado del sistema',
      icono: 'monitor_heart',
      ejecutar: irA('estado-sistema'),
    });
  }

  lista.push(
    {
      id: 'alternar-tema',
      etiqueta: 'Alternar modo oscuro',
      icono: 'dark_mode',
      ejecutar: alternarTema,
    },
    {
      id: 'cerrar-sesion',
      etiqueta: 'Cerrar sesión',
      icono: 'logout',
      ejecutar: () => emit('solicitar-cierre-sesion'),
    },
  );

  return lista;
});

const resultados = computed(() => {
  const termino = normalizar(consulta.value);
  if (!termino) return comandos.value;
  return comandos.value.filter((comando) => normalizar(comando.etiqueta).includes(termino));
});

const idOpcionActiva = computed(() => {
  const comando = resultados.value[indiceActivo.value];
  return comando ? `opcion-comando-${comando.id}` : undefined;
});

watch(consulta, () => {
  indiceActivo.value = 0;
});

watch(indiceActivo, () => {
  const id = idOpcionActiva.value;
  if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
});

function ejecutar(comando: Comando | undefined): void {
  if (!comando) return;
  emit('cerrar');
  comando.ejecutar();
}

function moverSeleccion(desplazamiento: number): void {
  const total = resultados.value.length;
  if (total === 0) return;
  indiceActivo.value = (indiceActivo.value + desplazamiento + total) % total;
}

function alPresionarTecla(evento: KeyboardEvent): void {
  switch (evento.key) {
    case 'Escape':
      evento.preventDefault();
      evento.stopPropagation();
      emit('cerrar');
      return;
    case 'ArrowDown':
      evento.preventDefault();
      moverSeleccion(1);
      return;
    case 'ArrowUp':
      evento.preventDefault();
      moverSeleccion(-1);
      return;
    case 'Home':
      evento.preventDefault();
      indiceActivo.value = 0;
      return;
    case 'End':
      evento.preventDefault();
      indiceActivo.value = Math.max(resultados.value.length - 1, 0);
      return;
    case 'Enter':
      evento.preventDefault();
      ejecutar(resultados.value[indiceActivo.value]);
      return;
    default:
      manejarTabulacion(evento);
  }
}
</script>

<template>
  <div
    class="fixed inset-0 bg-deep-onyx/40 flex items-start justify-center p-margin-mobile pt-[12vh] z-[60]"
    @click.self="emit('cerrar')"
  >
    <div
      ref="dialogo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-paleta-comandos"
      class="bg-surface-container-lowest text-on-surface rounded-primary border border-surface-alt w-full max-w-xl flex flex-col overflow-hidden"
      style="box-shadow: var(--shadow-modal)"
      @keydown="alPresionarTecla"
    >
      <h2 id="titulo-paleta-comandos" class="sr-only">Acciones rápidas</h2>

      <div class="flex items-center gap-3 px-gutter-lg border-b border-surface-alt">
        <span aria-hidden="true" class="material-symbols-outlined text-tertiary">search</span>
        <input
          ref="campoBusqueda"
          v-model="consulta"
          type="text"
          role="combobox"
          :aria-expanded="resultados.length > 0"
          aria-controls="lista-paleta-comandos"
          aria-autocomplete="list"
          aria-label="Buscar una acción o pantalla"
          :aria-activedescendant="idOpcionActiva"
          placeholder="Buscar una acción o pantalla…"
          autocomplete="off"
          spellcheck="false"
          class="flex-1 min-w-0 h-14 bg-transparent text-on-surface font-body-lg text-body-lg placeholder:text-tertiary"
        />
      </div>

      <ul
        v-show="resultados.length > 0"
        id="lista-paleta-comandos"
        role="listbox"
        aria-label="Resultados"
        class="max-h-80 overflow-y-auto py-2"
      >
        <li
          v-for="(comando, indice) in resultados"
          :id="`opcion-comando-${comando.id}`"
          :key="comando.id"
          role="option"
          :aria-selected="indice === indiceActivo"
          class="flex items-center gap-3 px-gutter-lg h-touch-target cursor-pointer font-body-md text-body-md border-l-4"
          :class="
            indice === indiceActivo
              ? 'bg-surface-container border-primary-container text-on-surface'
              : 'border-transparent text-on-surface'
          "
          @mousemove="indiceActivo = indice"
          @click="ejecutar(comando)"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-[20px] text-tertiary">
            {{ comando.icono }}
          </span>
          {{ comando.etiqueta }}
        </li>
      </ul>

      <p
        v-if="resultados.length === 0"
        role="status"
        class="px-gutter-lg py-gutter-lg font-body-md text-body-md text-secondary"
      >
        Sin resultados
      </p>
    </div>
  </div>
</template>
