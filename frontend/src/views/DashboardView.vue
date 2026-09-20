<script setup lang="ts">
// Portada del área autenticada: accesos directos a los módulos, cada uno
// visible sólo si la persona tiene el permiso que gobierna esa pantalla.
import { computed } from 'vue';
import { useAutenticacion } from '@/composables/useAutenticacion';

const { usuario, tienePermiso } = useAutenticacion();

interface AccesoDirecto {
  nombreRuta: string;
  titulo: string;
  descripcion: string;
  icono: string;
  permisoRequerido?: string;
}

const ACCESOS: AccesoDirecto[] = [
  {
    nombreRuta: 'usuarios',
    titulo: 'Gestión de Usuarios',
    descripcion: 'Cree cuentas, edite datos y administre el estado y el rol de cada usuario.',
    icono: 'group',
    permisoRequerido: 'usuarios.administrar',
  },
  {
    nombreRuta: 'roles-permisos',
    titulo: 'Roles y Permisos',
    descripcion: 'Consulte la matriz de permisos por rol del control de acceso del sistema.',
    icono: 'admin_panel_settings',
  },
  {
    nombreRuta: 'documentos',
    titulo: 'Documentos',
    descripcion: 'Registre, versione y publique los documentos del índice de transparencia.',
    icono: 'folder_open',
    // Mismo permiso que gobierna el listado de documentos y su enlace en
    // la barra lateral.
    permisoRequerido: 'documentos.consultar',
  },
];

const accesosVisibles = computed(() =>
  ACCESOS.filter((acceso) => !acceso.permisoRequerido || tienePermiso(acceso.permisoRequerido)),
);
</script>

<template>
  <div class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg">
    <div class="border-b border-surface-alt pb-gutter-sm">
      <h1
        class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface"
      >
        Bienvenido, {{ usuario?.nombreCompleto }}
      </h1>
      <p class="font-body-lg text-body-lg text-secondary mt-2">
        Sistema Integral de Gestión Documental y Portal Web de Transparencia Municipal.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-lg max-w-4xl">
      <!-- Cards: radio 8px, borde 1px surface-alt, padding interno 24px. -->
      <RouterLink
        v-for="acceso in accesosVisibles"
        :key="acceso.nombreRuta"
        :to="{ name: acceso.nombreRuta }"
        class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex items-start gap-gutter-sm hover:border-primary-container transition-colors group"
      >
        <div
          class="w-12 h-12 rounded-primary bg-primary-fixed text-primary flex items-center justify-center shrink-0"
        >
          <span aria-hidden="true" class="material-symbols-outlined">{{ acceso.icono }}</span>
        </div>
        <div class="min-w-0">
          <h2
            class="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors"
          >
            {{ acceso.titulo }}
          </h2>
          <p class="font-body-md text-body-md text-secondary mt-2">{{ acceso.descripcion }}</p>
        </div>
      </RouterLink>
    </div>

    <div class="bg-surface-container-low border border-surface-alt rounded-primary p-gutter-lg max-w-4xl">
      <h2 class="font-headline-sm text-headline-sm text-on-surface mb-2">Su acceso</h2>
      <p class="font-body-lg text-body-lg text-secondary mb-gutter-sm">
        Rol asignado: <strong class="text-on-surface">{{ usuario?.rol }}</strong>
      </p>
      <!-- Tags de permiso: radio "Secondary standard" (6px). La forma pill
           queda reservada a los badges de estado. -->
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="permiso in usuario?.permisos ?? []"
          :key="permiso"
          class="px-3 py-1 rounded-secondary bg-pure-white border border-surface-variant text-on-surface font-label-sm text-label-sm"
        >
          {{ permiso }}
        </li>
      </ul>
    </div>
  </div>
</template>
