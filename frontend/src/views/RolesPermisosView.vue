<script setup lang="ts">
// Nota: igual que en GestionUsuariosView, se asume un layout compartido para
// la barra lateral/topbar del mockup. Aquí solo vive el contenido propio de
// "Roles y Permisos". La matriz usa el catálogo REAL de 9 permisos — el
// mockup (con roles y acciones ilustrativas como "Auditor" o "Firmar
// digitalmente") se usó únicamente como referencia visual, según lo
// confirmado en el spec.md.
import { onMounted, ref, computed } from 'vue';
import { useRolesPermisos } from '@/composables/useRolesPermisos';
import { useAutenticacion } from '@/composables/useAutenticacion';
import { useNotificaciones } from '@/composables/useNotificaciones';

const {
  roles,
  idRolSeleccionado,
  modulos,
  cargando,
  guardando,
  error,
  cargarRoles,
  seleccionarRol,
  alternarPermiso,
  guardarCambios,
} = useRolesPermisos();

const { esRol } = useAutenticacion();
const { notificarExito, notificarError } = useNotificaciones();
// RF-15: solo el Superadministrador puede modificar roles_permisos; el resto
// ve la matriz en modo solo lectura.
const puedeEditar = computed(() => esRol('Superadministrador'));

const textoBusquedaRol = ref('');
const rolesFiltrados = computed(() =>
  roles.value.filter((rol) =>
    rol.nombre.toLowerCase().includes(textoBusquedaRol.value.toLowerCase()),
  ),
);

const rolActual = computed(() => roles.value.find((rol) => rol.idRol === idRolSeleccionado.value));

async function manejarGuardar(): Promise<void> {
  try {
    await guardarCambios();
    notificarExito('Permisos actualizados correctamente.');
  } catch (err) {
    // El mensaje inline ya queda expuesto de forma reactiva vía `error`; el
    // toast repite el texto real devuelto por el backend para que el
    // resultado se vea sin tener que buscarlo en la pantalla.
    notificarError(err, 'No se pudieron guardar los cambios de permisos.');
  }
}

function manejarDescartar(): void {
  if (idRolSeleccionado.value !== null) {
    seleccionarRol(idRolSeleccionado.value); // recarga desde el backend, descartando ediciones locales
  }
}

onMounted(async () => {
  await cargarRoles();
  const primerRol = roles.value[0];
  if (primerRol) {
    await seleccionarRol(primerRol.idRol);
  }
});
</script>

<template>
  <div class="flex-1 overflow-y-auto p-margin-mobile md:p-margin-desktop">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg max-w-7xl mx-auto">
      <!-- Columna de roles -->
      <div class="lg:col-span-4 flex flex-col gap-gutter-sm">
        <div
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg"
        >
          <div class="flex items-center justify-between mb-gutter-sm">
            <h2 class="font-headline-sm text-headline-sm text-on-surface">Roles Existentes</h2>
          </div>
          <!-- Buscador: radio "Secondary standard" (6px). -->
          <div class="relative mb-gutter-lg">
            <span
              class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
              >search</span
            >
            <input
              v-model="textoBusquedaRol"
              type="text"
              aria-label="Buscar rol"
              placeholder="Buscar rol..."
              class="w-full pl-10 pr-4 bg-pure-white rounded-secondary border border-outline focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg h-touch-target"
            />
          </div>
          <div class="flex flex-col gap-2">
            <button
              v-for="rol in rolesFiltrados"
              :key="rol.idRol"
              type="button"
              class="flex items-center p-3 rounded-primary border cursor-pointer transition-colors text-left min-h-list-row"
              :class="
                rol.idRol === idRolSeleccionado
                  ? 'border-2 border-primary-container bg-primary-fixed'
                  : 'border-surface-alt hover:border-outline bg-surface-container-lowest'
              "
              @click="seleccionarRol(rol.idRol)"
            >
              <div
                class="w-touch-target h-touch-target rounded-secondary flex items-center justify-center mr-3 shrink-0"
                :class="
                  rol.idRol === idRolSeleccionado
                    ? 'bg-primary-container text-pure-white'
                    : 'bg-surface-container text-secondary'
                "
              >
                <span class="material-symbols-outlined">admin_panel_settings</span>
              </div>
              <div class="flex-1 min-w-0">
                <h3
                  class="font-label-sm text-label-sm truncate"
                  :class="
                    rol.idRol === idRolSeleccionado ? 'text-primary font-bold' : 'text-on-surface'
                  "
                >
                  {{ rol.nombre }}
                </h3>
                <p
                  class="font-body-md text-body-md truncate"
                  :class="
                    rol.idRol === idRolSeleccionado ? 'text-on-primary-fixed' : 'text-secondary'
                  "
                >
                  {{ rol.descripcion }}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Columna de detalle y matriz de permisos -->
      <div class="lg:col-span-8 flex flex-col gap-gutter-sm">
        <div
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col h-full min-h-[600px]"
        >
          <div
            class="flex flex-col md:flex-row md:items-start justify-between gap-gutter-sm mb-gutter-lg pb-gutter-lg border-b border-surface-alt"
          >
            <div>
              <h2 class="font-headline-md text-headline-md text-on-surface mb-2">
                {{ rolActual?.nombre ?? 'Seleccione un rol' }}
              </h2>
              <p class="text-secondary font-body-lg text-body-lg max-w-2xl">
                {{ rolActual?.descripcion }}
              </p>
            </div>
            <!-- Indicador de estado: forma pill, neutro (el rojo se reserva
                 a errores de validación). -->
            <span
              v-if="!puedeEditar"
              class="px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm border border-surface-dim flex items-center gap-1 shrink-0"
            >
              <span class="material-symbols-outlined text-[16px]">visibility</span>
              Solo lectura
            </span>
          </div>

          <p
            v-if="error"
            role="alert"
            aria-live="assertive"
            class="text-error font-body-md text-body-md mb-gutter-sm"
          >
            {{ error }}
          </p>

          <div v-if="cargando" class="flex-1 flex items-center justify-center text-secondary">
            Cargando matriz de permisos...
          </div>

          <div v-else class="flex-1 overflow-y-auto pr-2">
            <h3 class="font-headline-sm text-headline-sm text-on-surface mb-gutter-sm">
              Matriz de Permisos
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-lg">
              <div
                v-for="modulo in modulos"
                :key="modulo.clave"
                class="border border-surface-alt rounded-primary p-gutter-sm bg-surface-container-low"
              >
                <div
                  class="flex items-center gap-2 mb-gutter-sm pb-2 border-b border-surface-variant"
                >
                  <span class="material-symbols-outlined text-secondary">folder_open</span>
                  <h4 class="font-label-sm text-label-sm text-on-surface uppercase">
                    Módulo: {{ modulo.etiqueta }}
                  </h4>
                </div>
                <div class="flex flex-col gap-2">
                  <label
                    v-for="permiso in modulo.permisos"
                    :key="permiso.idPermiso"
                    class="flex items-center gap-3 min-h-list-row"
                    :class="puedeEditar ? 'cursor-pointer group' : 'opacity-60 cursor-not-allowed'"
                  >
                    <input
                      type="checkbox"
                      :checked="permiso.asignado"
                      :disabled="!puedeEditar"
                      class="w-5 h-5 rounded-sm border border-outline accent-primary-container bg-surface-container-lowest disabled:cursor-not-allowed"
                      @change="alternarPermiso(permiso.idPermiso)"
                    />
                    <span
                      class="font-body-md text-body-md text-on-surface"
                      :class="{ 'group-hover:text-primary transition-colors': puedeEditar }"
                    >
                      {{ permiso.descripcion ?? permiso.nombre }}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="puedeEditar"
            class="mt-gutter-lg pt-gutter-lg border-t border-surface-alt flex flex-col sm:flex-row items-center justify-between gap-gutter-sm shrink-0"
          >
            <!-- Botón secundario: fondo blanco, borde 1px y texto on-surface
                 (el hex "#1D2327" de la prosa de DESIGN.md no existe en el
                 bloque de tokens; on-surface es su neutro equivalente). -->
            <button
              type="button"
              class="w-full sm:w-auto h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
              @click="manejarDescartar"
            >
              Descartar Cambios
            </button>
            <!-- Botón primario -->
            <button
              type="button"
              :disabled="guardando"
              class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              @click="manejarGuardar"
            >
              <span class="material-symbols-outlined text-[18px]">save</span>
              {{ guardando ? 'Guardando...' : 'Guardar Cambios' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
