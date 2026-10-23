<script setup lang="ts">
// Shell institucional de la aplicación: barra lateral, topbar y pie.
// Las vistas internas (GestionUsuariosView, RolesPermisosView...) asumen
// vivir dentro de este layout y por eso no repiten navegación; se montan
// en el <RouterView /> de abajo como rutas hijas (ver router/index.ts).
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAutenticacion } from '@/composables/useAutenticacion';
import { useNotificaciones } from '@/composables/useNotificaciones';
import { useTema } from '@/composables/useTema';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import { CATALOGOS_SIMPLES } from '@/lib/catalogos.config';

const route = useRoute();
const router = useRouter();
const { usuario, cerrarSesion, tienePermiso } = useAutenticacion();
const { notificarExito } = useNotificaciones();
const { esOscuro, alternarTema } = useTema();

const menuLateralAbierto = ref(false);

interface EnlaceNavegacion {
  nombreRuta: string;
  etiqueta: string;
  icono: string;
  /** Si se declara, el enlace solo aparece cuando el rol lo tiene. */
  permisoRequerido?: string;
}

const ENLACES: EnlaceNavegacion[] = [
  { nombreRuta: 'dashboard', etiqueta: 'Inicio', icono: 'dashboard' },
  {
    nombreRuta: 'usuarios',
    etiqueta: 'Gestión de Usuarios',
    icono: 'group',
    permisoRequerido: 'usuarios.administrar',
  },
  { nombreRuta: 'roles-permisos', etiqueta: 'Roles y Permisos', icono: 'admin_panel_settings' },
  {
    nombreRuta: 'documentos',
    etiqueta: 'Documentos',
    icono: 'folder_open',
    permisoRequerido: 'documentos.consultar',
  },
  {
    nombreRuta: 'bitacora',
    etiqueta: 'Bitácora',
    icono: 'history',
    permisoRequerido: 'bitacora.consultar',
  },
];

// Los catálogos van en su propio grupo, bajo un encabezado: son cuatro
// entradas que comparten permiso y propósito, y mezclarlas con las de
// arriba dejaría una lista larga y plana difícil de recorrer.
const ENLACES_CATALOGOS: EnlaceNavegacion[] = [
  {
    nombreRuta: 'categorias-itsp',
    etiqueta: 'Categorías ITSP',
    icono: 'account_tree',
    permisoRequerido: 'catalogos.administrar',
  },
  ...Object.values(CATALOGOS_SIMPLES).map((catalogo) => ({
    nombreRuta: catalogo.nombreRutaLista,
    etiqueta: catalogo.titulo,
    icono: catalogo.icono,
    permisoRequerido: 'catalogos.administrar',
  })),
];

// RF-05: la navegación refleja los permisos efectivos del usuario; ocultar
// el enlace es solo cosmético — el acceso real lo sigue bloqueando el
// guard del router y, sobre todo, el backend.
function visiblesSegunPermisos(enlaces: EnlaceNavegacion[]): EnlaceNavegacion[] {
  return enlaces.filter((enlace) => !enlace.permisoRequerido || tienePermiso(enlace.permisoRequerido));
}

const enlacesVisibles = computed(() => visiblesSegunPermisos(ENLACES));
const enlacesCatalogosVisibles = computed(() => visiblesSegunPermisos(ENLACES_CATALOGOS));

// El título busca en ambos grupos, y además reconoce las rutas de alta y
// edición: estando en '/catalogos/etiquetas/nueva' la cabecera debe seguir
// diciendo "Etiquetas", no caer al "Inicio" por defecto.
const tituloSeccion = computed(() => {
  const todos = [...enlacesVisibles.value, ...enlacesCatalogosVisibles.value];
  const coincidencia =
    todos.find((e) => e.nombreRuta === route.name) ??
    todos.find((e) => route.path.startsWith(rutaBaseDe(e.nombreRuta)));
  return coincidencia?.etiqueta ?? 'Inicio';
});

function rutaBaseDe(nombreRuta: string): string {
  return router.resolve({ name: nombreRuta }).path;
}

const iniciales = computed(() =>
  (usuario.value?.nombreCompleto ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join(''),
);

const anioActual = new Date().getFullYear();

const mostrarModalCerrarSesion = ref(false);
const cerrandoSesion = ref(false);

async function manejarCerrarSesion(): Promise<void> {
  cerrandoSesion.value = true;
  try {
    await cerrarSesion();
  } finally {
    cerrandoSesion.value = false;
    mostrarModalCerrarSesion.value = false;
  }
  // El toast se publica antes de navegar a propósito: el contenedor vive en
  // App.vue (fuera del RouterView), así que el aviso sobrevive al cambio de
  // ruta y se lee ya en la pantalla de login.
  notificarExito('Sesión cerrada correctamente.');
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="min-h-screen flex bg-background text-on-background font-body-lg text-body-lg">
    <!-- Velo del menú lateral en móvil: tinte deep-onyx, no sombra. -->
    <div
      v-if="menuLateralAbierto"
      class="fixed inset-0 bg-deep-onyx/50 z-30 lg:hidden"
      aria-hidden="true"
      @click="menuLateralAbierto = false"
    ></div>

    <!-- ================= Barra lateral =================
         DESIGN.md reserva el rojo primario para acciones y destaques, y
         apoya la estructura (cabeceras, fondos secundarios) en el neutro
         casi-negro. La barra usa por eso `on-surface`; el rojo aparece
         solo en el enlace activo. -->
    <aside
      class="fixed lg:sticky top-0 left-0 z-40 h-screen w-72 shrink-0 bg-panel text-pure-white flex flex-col transition-transform lg:translate-x-0"
      :class="menuLateralAbierto ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="px-gutter-lg py-gutter-lg border-b border-pure-white/15 flex items-center gap-3">
        <div
          class="w-11 h-11 rounded-full bg-primary-container flex items-center justify-center shrink-0"
        >
          <span aria-hidden="true" class="material-symbols-outlined">account_balance</span>
        </div>
        <div class="min-w-0">
          <p class="font-headline-sm text-headline-sm leading-tight">Muni Data</p>
          <p class="text-label-sm text-pure-white/70 truncate">Municipalidad de Palmares</p>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-base py-gutter-sm" aria-label="Navegación principal">
        <ul class="flex flex-col gap-1">
          <li v-for="enlace in enlacesVisibles" :key="enlace.nombreRuta">
            <RouterLink
              :to="{ name: enlace.nombreRuta }"
              class="flex items-center gap-3 px-3 rounded-primary h-touch-target transition-colors font-label-sm text-label-sm"
              :class="
                route.name === enlace.nombreRuta
                  ? 'bg-primary-container text-pure-white font-bold'
                  : 'text-pure-white/85 hover:bg-pure-white/10'
              "
              @click="menuLateralAbierto = false"
            >
              <span aria-hidden="true" class="material-symbols-outlined">{{ enlace.icono }}</span>
              {{ enlace.etiqueta }}
            </RouterLink>
          </li>
        </ul>

        <!-- Grupo de catálogos. El encabezado es `aria-hidden` porque la
             lista ya se anuncia por su propio `aria-label`; dejarlo
             legible para lectores de pantalla lo leería dos veces. -->
        <template v-if="enlacesCatalogosVisibles.length">
          <p
            class="px-3 pt-gutter-lg pb-2 text-label-sm font-label-sm text-pure-white/50 uppercase tracking-wide"
          >
            Catálogos
          </p>
          <ul class="flex flex-col gap-1">
            <li v-for="enlace in enlacesCatalogosVisibles" :key="enlace.nombreRuta">
              <RouterLink
                :to="{ name: enlace.nombreRuta }"
                class="flex items-center gap-3 px-3 rounded-primary h-touch-target transition-colors font-label-sm text-label-sm"
                :class="
                  route.name === enlace.nombreRuta
                    ? 'bg-primary-container text-pure-white font-bold'
                    : 'text-pure-white/85 hover:bg-pure-white/10'
                "
                @click="menuLateralAbierto = false"
              >
                <span aria-hidden="true" class="material-symbols-outlined">{{ enlace.icono }}</span>
                {{ enlace.etiqueta }}
              </RouterLink>
            </li>
          </ul>
        </template>
      </nav>

      <div class="px-base py-gutter-sm border-t border-pure-white/15">
        <button
          type="button"
          class="w-full flex items-center gap-3 px-3 rounded-primary h-touch-target text-pure-white/85 hover:bg-pure-white/10 transition-colors font-label-sm text-label-sm"
          @click="mostrarModalCerrarSesion = true"
        >
          <span aria-hidden="true" class="material-symbols-outlined">logout</span>
          Cerrar sesión
        </button>
      </div>
    </aside>

    <!-- ================= Columna principal ================= -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Topbar -->
      <header
        class="sticky top-0 z-20 bg-surface-container-lowest border-b border-surface-alt px-margin-mobile md:px-margin-desktop h-16 flex items-center justify-between gap-4"
      >
        <div class="flex items-center gap-3 min-w-0">
          <button
            type="button"
            class="lg:hidden w-touch-target h-touch-target rounded-secondary flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors"
            aria-label="Abrir menú de navegación"
            @click="menuLateralAbierto = true"
          >
            <span aria-hidden="true" class="material-symbols-outlined">menu</span>
          </button>
          <h2 class="font-headline-sm text-headline-sm text-on-surface truncate">
            {{ tituloSeccion }}
          </h2>
        </div>

        <div v-if="usuario" class="flex items-center gap-3 min-w-0">
          <!-- Conmutador claro/oscuro (spec-ajustes-posdespliegue 9.3.4).
               aria-pressed dice si el modo oscuro está activo; la etiqueta
               no cambia, para que el lector anuncie siempre lo mismo. -->
          <button
            type="button"
            class="w-touch-target h-touch-target shrink-0 rounded-secondary flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors"
            aria-label="Modo oscuro"
            :aria-pressed="esOscuro"
            :title="esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
            @click="alternarTema"
          >
            <span aria-hidden="true" class="material-symbols-outlined">
              {{ esOscuro ? 'light_mode' : 'dark_mode' }}
            </span>
          </button>
          <div class="text-right hidden sm:block min-w-0">
            <p class="font-label-sm text-label-sm text-on-surface truncate">
              {{ usuario.nombreCompleto }}
            </p>
            <p class="font-body-md text-body-md text-tertiary truncate">{{ usuario.rol }}</p>
          </div>
          <div
            class="w-11 h-11 rounded-full bg-primary-fixed text-acento flex items-center justify-center font-bold shrink-0"
            :title="usuario.correo"
          >
            {{ iniciales }}
          </div>
        </div>
      </header>

      <!-- Contenido de la ruta activa -->
      <main class="flex-1 flex flex-col min-w-0">
        <!-- La llave por ruta fuerza un montaje nuevo cuando dos rutas
             distintas comparten componente (los tres catálogos planos usan
             CatalogoSimpleView, y crear/editar comparten formulario). Sin
             ella el router reutiliza la instancia, setup() no vuelve a
             correr y la vista se quedaría con los datos de la ruta anterior. -->
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="route.fullPath" />
        </RouterView>
      </main>

      <!-- Pie institucional -->
      <footer
        class="border-t border-surface-alt bg-surface-container-lowest px-margin-mobile md:px-margin-desktop py-gutter-sm flex flex-col sm:flex-row items-center justify-between gap-2 font-body-md text-body-md text-tertiary"
      >
        <span>© {{ anioActual }} Municipalidad de Palmares — Portal de Gobierno Abierto</span>
        <span class="flex items-center gap-1">
          <span aria-hidden="true" class="material-symbols-outlined text-[16px]">shield</span>
          Muni Data
        </span>
      </footer>
    </div>

    <ModalConfirmacion
      v-if="mostrarModalCerrarSesion"
      titulo="Cerrar sesión"
      mensaje="¿Desea cerrar sesión?"
      :procesando="cerrandoSesion"
      @cancelar="mostrarModalCerrarSesion = false"
      @confirmar="manejarCerrarSesion"
    />
  </div>
</template>
