<script setup lang="ts">
// Nota: este componente asume que el "shell" de la aplicación (barra lateral,
// topbar y footer institucionales del mockup) ya vive en un layout compartido
// (ej. AppShellLayout.vue) fuera de este archivo. Aquí solo se convirtió el
// contenido específico de "Gestión de Usuarios" para no duplicar navegación.
import { onMounted, ref, computed, watch } from 'vue';
import { useUsuarios } from '@/composables/useUsuarios';
import { useRolesPermisos } from '@/composables/useRolesPermisos';
import { useAutenticacion } from '@/composables/useAutenticacion';
import { useNotificaciones } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import type { EstadoUsuario, UsuarioResumenDto } from '@/types/usuario.types';

const { usuarios, total, pagina, limite, cargando, error, listar, cambiarEstado } = useUsuarios();
const { roles, cargarRoles } = useRolesPermisos();
const { usuario: usuarioActual } = useAutenticacion();
const { notificarExito, notificarError } = useNotificaciones();

const textoBusqueda = ref('');
const idRolFiltro = ref<number | null>(null);
const estadoFiltro = ref<EstadoUsuario | null>(null);

const usuarioPendienteDeConfirmar = ref<UsuarioResumenDto | null>(null);
const cambiandoEstado = ref(false);

let temporizadorBusqueda: ReturnType<typeof setTimeout> | undefined;

function manejarBuscar(): void {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(() => {
    listar({
      pagina: 1,
      nombre: textoBusqueda.value || undefined,
      idRol: idRolFiltro.value ?? undefined,
      estado: estadoFiltro.value ?? undefined,
    });
  }, 350);
}

watch([idRolFiltro, estadoFiltro], () => manejarBuscar());

function obtenerIniciales(nombreCompleto: string): string {
  return nombreCompleto
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

function esUsuarioActual(idUsuario: number): boolean {
  return usuarioActual.value?.idUsuario === idUsuario;
}

function solicitarCambioEstado(usuario: UsuarioResumenDto): void {
  usuarioPendienteDeConfirmar.value = usuario;
}

function cancelarCambioEstado(): void {
  usuarioPendienteDeConfirmar.value = null;
}

async function confirmarCambioEstado(): Promise<void> {
  const usuario = usuarioPendienteDeConfirmar.value;
  if (!usuario) return;

  const nuevoEstado: EstadoUsuario = usuario.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
  cambiandoEstado.value = true;
  try {
    await cambiarEstado(usuario.idUsuario, nuevoEstado);
    notificarExito(
      nuevoEstado === 'INACTIVO'
        ? 'Usuario inactivado correctamente.'
        : 'Usuario reactivado correctamente.',
    );
    usuarioPendienteDeConfirmar.value = null;
  } catch (err) {
    notificarError(
      err,
      nuevoEstado === 'INACTIVO'
        ? 'No se pudo inactivar el usuario.'
        : 'No se pudo reactivar el usuario.',
    );
  } finally {
    cambiandoEstado.value = false;
  }
}

const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / limite.value)));

function irAPagina(nuevaPagina: number): void {
  if (nuevaPagina < 1 || nuevaPagina > totalPaginas.value) return;
  listar({ pagina: nuevaPagina });
}

onMounted(async () => {
  await Promise.all([listar({ pagina: 1 }), cargarRoles()]);
});
</script>

<template>
  <div
    class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen"
  >
    <!-- Encabezado de página -->
    <div
      class="flex flex-col md:flex-row md:items-end justify-between gap-gutter-sm border-b border-surface-alt pb-gutter-sm"
    >
      <div>
        <h1
          class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
        >
          Gestión de Usuarios
        </h1>
        <p class="font-body-lg text-body-lg text-secondary mt-2">
          Administre el acceso, roles y estados de los usuarios del sistema.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Botón primario -->
        <router-link
          :to="{ name: 'usuario-nuevo' }"
          class="h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <span class="material-symbols-outlined text-[18px]">person_add</span>
          Nuevo Usuario
        </router-link>
      </div>
    </div>


    <!-- Controles de búsqueda y filtros -->
    <div
      class="bg-pure-white rounded-primary border border-surface-alt p-gutter-sm flex flex-col md:flex-row gap-gutter-sm items-center justify-between"
    >
      <!-- Buscador: radio "Secondary standard" (6px). -->
      <div class="relative w-full md:w-96">
        <span
          class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
          >search</span
        >
        <input
          v-model="textoBusqueda"
          type="text"
          placeholder="Buscar por nombre, correo o rol..."
          class="w-full h-touch-target pl-10 pr-4 rounded-secondary border border-outline bg-pure-white focus:border-2 focus:border-on-surface focus:outline-none transition-colors font-body-lg text-body-lg text-on-surface placeholder:text-secondary"
          @input="manejarBuscar"
        />
      </div>
      <div class="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
        <select
          v-model="idRolFiltro"
          aria-label="Filtrar por rol"
          class="h-touch-target px-4 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md whitespace-nowrap"
        >
          <option :value="null">Todos los roles</option>
          <option v-for="rol in roles" :key="rol.idRol" :value="rol.idRol">{{ rol.nombre }}</option>
        </select>
        <select
          v-model="estadoFiltro"
          aria-label="Filtrar por estado"
          class="h-touch-target px-4 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md whitespace-nowrap"
        >
          <option :value="null">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="INACTIVO">Inactivo</option>
        </select>
      </div>
    </div>

    <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
      {{ error }}
    </p>

    <!-- Tabla de usuarios -->
    <div class="bg-pure-white rounded-primary border border-surface-alt overflow-hidden flex flex-col">
      <div class="overflow-x-auto w-full">
        <table class="w-full min-w-[800px] text-left border-collapse">
          <thead>
            <tr class="bg-on-surface">
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Nombre
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Correo Electrónico
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Rol Principal
              </th>
              <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                Estado
              </th>
              <th
                class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase text-right"
              >
                Acciones
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-alt font-body-md text-body-md text-on-surface">
            <tr v-if="cargando">
              <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">
                Cargando usuarios...
              </td>
            </tr>
            <tr v-else-if="usuarios.length === 0">
              <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">
                No se encontraron usuarios con los filtros actuales.
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="usuario in usuarios"
                :key="usuario.idUsuario"
                class="hover:bg-surface-container-low transition-colors group"
                :class="{ 'opacity-60': usuario.estado === 'INACTIVO' }"
              >
                <!-- El flex vive en un div interno, no en el <td>: si la
                     celda misma es flex deja de comportarse como celda de
                     tabla y su texto queda desalineado con el del resto de
                     la fila. Altura mínima 48px (DESIGN.md > Lists). -->
                <td class="py-gutter-sm px-gutter-lg">
                  <div class="flex items-center gap-3 min-h-list-row">
                    <div
                      class="w-8 h-8 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-label-sm shrink-0"
                    >
                      {{ obtenerIniciales(usuario.nombreCompleto) }}
                    </div>
                    <span class="font-semibold text-on-surface">
                      {{ usuario.nombreCompleto }}
                    </span>
                  </div>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-secondary">{{ usuario.correo }}</td>
                <td class="py-gutter-sm px-gutter-lg">{{ usuario.nombreRol }}</td>
                <td class="py-gutter-sm px-gutter-lg">
                  <!-- Badge de estado: única forma pill del sistema. El rojo
                       queda reservado a errores de validación, así que ACTIVO
                       e INACTIVO se distinguen con dos neutros del stack. -->
                  <span
                    class="inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm border"
                    :class="
                      usuario.estado === 'ACTIVO'
                        ? 'bg-secondary-container text-on-surface border-secondary-fixed-dim'
                        : 'bg-surface-container-high text-on-surface border-surface-dim'
                    "
                  >
                    <span
                      class="w-1.5 h-1.5 rounded-full mr-1.5"
                      :class="usuario.estado === 'ACTIVO' ? 'bg-secondary' : 'bg-outline'"
                    ></span>
                    {{ usuario.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-right space-x-1 whitespace-nowrap">
                  <!-- Botones de ícono: NO son pill. Radio "Secondary
                       standard" (6px) y 44x44 de objetivo táctil. -->
                  <router-link
                    :to="{ name: 'usuario-editar', params: { id: usuario.idUsuario } }"
                    title="Editar"
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center"
                  >
                    <span class="material-symbols-outlined text-[20px]">edit</span>
                  </router-link>
                  <button
                    type="button"
                    :disabled="usuario.estado === 'ACTIVO' && esUsuarioActual(usuario.idUsuario)"
                    :title="
                      usuario.estado === 'ACTIVO' && esUsuarioActual(usuario.idUsuario)
                        ? 'No puede inactivar su propia cuenta'
                        : usuario.estado === 'ACTIVO'
                          ? 'Inactivar'
                          : 'Activar'
                    "
                    class="w-touch-target h-touch-target rounded-secondary hover:bg-surface-container text-secondary hover:text-on-surface transition-colors inline-flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    @click="solicitarCambioEstado(usuario)"
                  >
                    <span class="material-symbols-outlined text-[20px]">
                      {{ usuario.estado === 'ACTIVO' ? 'block' : 'check_circle' }}
                    </span>
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Paginación -->
      <div
        class="border-t border-surface-alt p-gutter-sm flex flex-col sm:flex-row items-center justify-between gap-gutter-sm bg-pure-white"
      >
        <span class="font-body-md text-body-md text-secondary">
          Mostrando {{ usuarios.length ? (pagina - 1) * limite + 1 : 0 }} a
          {{ Math.min(pagina * limite, total) }} de {{ total }} usuarios
        </span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            aria-label="Página anterior"
            :disabled="pagina <= 1"
            class="w-touch-target h-touch-target flex items-center justify-center rounded-secondary border border-outline text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="irAPagina(pagina - 1)"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button
            v-for="numeroPagina in totalPaginas"
            :key="numeroPagina"
            type="button"
            class="w-touch-target h-touch-target flex items-center justify-center rounded-secondary font-label-sm text-label-sm transition-colors"
            :class="
              numeroPagina === pagina
                ? 'bg-primary-container text-pure-white font-bold'
                : 'border border-transparent text-secondary hover:bg-surface-container hover:border-outline'
            "
            @click="irAPagina(numeroPagina)"
          >
            {{ numeroPagina }}
          </button>
          <button
            type="button"
            aria-label="Página siguiente"
            :disabled="pagina >= totalPaginas"
            class="w-touch-target h-touch-target flex items-center justify-center rounded-secondary border border-outline text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            @click="irAPagina(pagina + 1)"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>

    <ModalConfirmacion
      v-if="usuarioPendienteDeConfirmar"
      :titulo="usuarioPendienteDeConfirmar.estado === 'ACTIVO' ? 'Inactivar usuario' : 'Activar usuario'"
      :procesando="cambiandoEstado"
      @cancelar="cancelarCambioEstado"
      @confirmar="confirmarCambioEstado"
    >
      ¿Confirma que desea
      {{ usuarioPendienteDeConfirmar.estado === 'ACTIVO' ? 'inactivar' : 'activar' }}
      a <strong class="text-on-surface">{{ usuarioPendienteDeConfirmar.nombreCompleto }}</strong
      >?
    </ModalConfirmacion>
  </div>
</template>
