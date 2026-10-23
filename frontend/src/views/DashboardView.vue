<script setup lang="ts">
// Pantalla de Inicio. Además de orientar hacia los módulos, embebe los
// indicadores de gestión documental de MF-08 (RF-055 a RF-058): no hay
// módulo ni ruta "Reportes" aparte, todo vive aquí.
//
// Dos niveles de visibilidad:
//  - Tarjetas de resumen y paneles de desglose: exigen 'reportes.consultar'
//    (Superadministrador y Administrador).
//  - Tabla de documentos recientes: basta 'documentos.consultar', que es
//    más amplio. Un usuario de sola consulta ve por tanto una versión
//    reducida de esta pantalla, con lo que ya puede consultar de todos
//    modos (sólo documentos publicados, filtrado por el backend).
import { computed, onMounted, ref } from 'vue';
import { useAutenticacion } from '@/composables/useAutenticacion';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import reportesService from '@/services/reportes.service';
import documentosService from '@/services/documentos.service';
import BadgeEstadoDocumento from '@/components/BadgeEstadoDocumento.vue';
import { URL_PORTAL_PUBLICO } from '@/lib/documentos.config';
import type { ConteoPorGrupoDto, ResumenReportesDto } from '@/types/reporte.types';
import type { DocumentoDto, EstadoDocumento } from '@/types/documento.types';

const { usuario, tienePermiso } = useAutenticacion();
const { notificarError } = useNotificaciones();

const puedeVerReportes = computed(() => tienePermiso('reportes.consultar'));
const puedeVerDocumentos = computed(() => tienePermiso('documentos.consultar'));
const puedeVerBitacora = computed(() => tienePermiso('bitacora.consultar'));

// El portal público (WordPress) es un sistema externo que todavía no
// existe: sin la variable configurada, el botón no se muestra en vez de
// enlazar a una dirección inventada.
const urlPortalPublico = URL_PORTAL_PUBLICO;

// Hora de carga de la pantalla, no un valor fijo del mockup.
const actualizadoA = new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

// ---------- Accesos rápidos (reubicados, ver B.1) ----------

interface AccesoDirecto {
  nombreRuta: string;
  etiqueta: string;
  icono: string;
  /** Si se declara, el acceso sólo aparece cuando el rol lo tiene. */
  permisoRequerido?: string;
}

const ACCESOS: AccesoDirecto[] = [
  { nombreRuta: 'documentos', etiqueta: 'Documentos', icono: 'folder_open', permisoRequerido: 'documentos.consultar' },
  { nombreRuta: 'usuarios', etiqueta: 'Gestión de Usuarios', icono: 'group', permisoRequerido: 'usuarios.administrar' },
  { nombreRuta: 'roles-permisos', etiqueta: 'Roles y Permisos', icono: 'admin_panel_settings' },
];

const accesosVisibles = computed(() =>
  ACCESOS.filter((acceso) => !acceso.permisoRequerido || tienePermiso(acceso.permisoRequerido)),
);

// ---------- Indicadores ----------

const resumen = ref<ResumenReportesDto | null>(null);
const porCategoria = ref<ConteoPorGrupoDto[]>([]);
const porDependencia = ref<ConteoPorGrupoDto[]>([]);
const cargandoReportes = ref(false);

/** Ancho de la barra proporcional: el mayor del grupo marca el 100 %. */
function proporcion(valor: number, grupo: ConteoPorGrupoDto[]): string {
  const maximo = Math.max(...grupo.map((fila) => fila.cantidad), 0);
  return maximo === 0 ? '0%' : `${Math.round((valor / maximo) * 100)}%`;
}

// ---------- Documentos recientes ----------

type Pestana = 'todos' | 'publicados' | 'pendientes';

const pestana = ref<Pestana>('todos');
const recientes = ref<DocumentoDto[]>([]);
const cargandoRecientes = ref(false);
const errorRecientes = ref<string | null>(null);

const PESTANAS: Array<{ clave: Pestana; etiqueta: string; estado?: EstadoDocumento }> = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'publicados', etiqueta: 'Publicados', estado: 'PUBLICADO' },
  { clave: 'pendientes', etiqueta: 'Pendientes', estado: 'BORRADOR' },
];

async function cargarRecientes(): Promise<void> {
  const estado = PESTANAS.find((p) => p.clave === pestana.value)?.estado;
  cargandoRecientes.value = true;
  errorRecientes.value = null;
  try {
    // Reutiliza GET /documentos con sus filtros; ya viene ordenado por
    // fecha de actualización descendente desde Fase 6.
    const respuesta = await documentosService.listar({ estado, limite: 10 });
    // Es un vistazo operativo, no el listado administrativo: los inactivos
    // se dejan fuera. La pestaña "Todos" es la única que puede traerlos,
    // porque las otras dos ya filtran por estado en el servidor.
    recientes.value = respuesta.datos.filter((documento) => documento.estado !== 'INACTIVO');
  } catch (error) {
    errorRecientes.value = obtenerMensajeError(error, 'No se pudieron cargar los documentos recientes.');
  } finally {
    cargandoRecientes.value = false;
  }
}

function cambiarPestana(clave: Pestana): void {
  pestana.value = clave;
  void cargarRecientes();
}

// ---------- Cola de pendientes ----------

const pendientes = ref<DocumentoDto[]>([]);

function diasDesde(fecha: string): number {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / (24 * 60 * 60 * 1000));
}

function tiempoRelativo(fecha: string): string {
  const dias = diasDesde(fecha);
  if (dias <= 0) return 'hoy';
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

onMounted(async () => {
  const tareas: Array<Promise<unknown>> = [];

  if (puedeVerDocumentos.value) {
    tareas.push(cargarRecientes());
  }

  if (puedeVerReportes.value) {
    cargandoReportes.value = true;
    tareas.push(
      (async () => {
        try {
          const [resumenCargado, categorias, dependencias, cola] = await Promise.all([
            reportesService.obtenerResumen(),
            reportesService.obtenerPorCategoria(),
            reportesService.obtenerPorDependencia(),
            // La cola prioriza lo más antiguo: son los borradores que más
            // tiempo llevan esperando publicación.
            documentosService.listar({ estado: 'BORRADOR', limite: 50 }),
          ]);
          resumen.value = resumenCargado;
          porCategoria.value = categorias;
          porDependencia.value = dependencias;
          pendientes.value = [...cola.datos]
            .sort((a, b) => new Date(a.fechaCreacion).getTime() - new Date(b.fechaCreacion).getTime())
            .slice(0, 4);
        } catch (error) {
          notificarError(error, 'No se pudieron cargar los indicadores de gestión.');
        } finally {
          cargandoReportes.value = false;
        }
      })(),
    );
  }

  await Promise.all(tareas);
});
</script>

<template>
  <div class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen">
    <!-- ================= Encabezado ================= -->
    <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-gutter-sm border-b border-surface-alt pb-gutter-sm">
      <div class="min-w-0">
        <h1 class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface">
          Bienvenido, {{ usuario?.nombreCompleto }} 
        </h1>
        <p class="font-body-lg text-body-lg text-secondary mt-2">
          Estado general de la gestión documental,
          actualizado a las {{ actualizadoA }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-gutter-sm shrink-0">
        <router-link
          v-if="puedeVerBitacora"
          :to="{ name: 'bitacora' }"
          class="h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-[18px]">history</span>
          Ver bitácora
        </router-link>
        <a
          v-if="urlPortalPublico"
          :href="urlPortalPublico"
          target="_blank"
          rel="noopener noreferrer"
          class="h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center gap-2"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-[18px]">open_in_new</span>
          Abrir portal público
        </a>
      </div>
    </div>

    <!-- ================= Tarjetas de resumen (MF-08) ================= -->
    <div v-if="puedeVerReportes" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-lg">
      <div
        v-for="tarjeta in [
          { etiqueta: 'Documentos registrados', valor: resumen?.documentosRegistrados, detalle: resumen ? `+${resumen.documentosEsteMes} este mes` : '' },
          { etiqueta: 'Publicados en el portal', valor: resumen?.publicados, detalle: resumen ? `${resumen.porcentajePublicados} % del total` : '' },
          { etiqueta: 'Pendientes de publicación', valor: resumen?.pendientes, detalle: resumen ? `${resumen.pendientesMasDe15Dias} con más de 15 días` : '' },
          { etiqueta: 'Operaciones en bitácora', valor: resumen?.operacionesBitacora90Dias, detalle: 'últimos 90 días' },
        ]"
        :key="tarjeta.etiqueta"
        class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-1"
      >
        <p class="font-label-sm text-label-sm text-tertiary uppercase">{{ tarjeta.etiqueta }}</p>
        <p class="font-headline-lg text-headline-lg text-on-surface">
          {{ cargandoReportes ? '—' : (tarjeta.valor ?? 0).toLocaleString('es-CR') }}
        </p>
        <p class="font-body-md text-body-md text-secondary">{{ tarjeta.detalle }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-gutter-lg items-start">
      <!-- ================= Documentos recientes ================= -->
      <section
        v-if="puedeVerDocumentos"
        class="bg-surface-container-lowest rounded-primary border border-surface-alt overflow-hidden flex flex-col"
      >
        <div class="p-gutter-lg flex flex-col sm:flex-row sm:items-center justify-between gap-gutter-sm">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Documentos recientes</h2>
          <div class="flex items-center gap-1" role="tablist" aria-label="Filtrar documentos recientes por estado">
            <button
              v-for="opcion in PESTANAS"
              :key="opcion.clave"
              type="button"
              role="tab"
              :aria-selected="pestana === opcion.clave"
              class="h-touch-target px-gutter-sm rounded-secondary font-label-sm text-label-sm transition-colors"
              :class="
                pestana === opcion.clave
                  ? 'bg-panel text-pure-white'
                  : 'bg-surface-container-lowest text-on-surface border border-outline hover:bg-surface-container'
              "
              @click="cambiarPestana(opcion.clave)"
            >
              {{ opcion.etiqueta }}
            </button>
          </div>
        </div>

        <p v-if="errorRecientes" role="alert" class="px-gutter-lg pb-gutter-sm text-error font-body-md text-body-md">
          {{ errorRecientes }}
        </p>

        <div class="overflow-x-auto w-full">
          <table class="w-full min-w-[720px] text-left border-collapse">
            <thead>
              <tr class="bg-panel">
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                  Documento
                </th>
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                  Dependencia
                </th>
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                  Año
                </th>
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase">
                  Estado
                </th>
                <th class="py-gutter-sm px-gutter-lg font-label-sm text-label-sm text-pure-white uppercase text-right">
                  Versión
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-alt font-body-md text-body-md text-on-surface">
              <tr v-if="cargandoRecientes">
                <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">Cargando...</td>
              </tr>
              <tr v-else-if="recientes.length === 0">
                <td colspan="5" class="py-8 px-gutter-lg text-center text-secondary">
                  No hay documentos que mostrar.
                </td>
              </tr>
              <tr
                v-for="documento in recientes"
                v-else
                :key="documento.id"
                class="hover:bg-surface-container-low transition-colors"
              >
                <td class="py-gutter-sm px-gutter-lg max-w-sm">
                  <router-link
                    :to="{ name: 'documento-detalle', params: { id: documento.id } }"
                    class="block font-semibold text-on-surface hover:underline truncate"
                  >
                    {{ documento.titulo }}
                  </router-link>
                  <span class="block text-secondary truncate">
                    {{ documento.nombreTipoDocumento }} · {{ documento.nombreCategoriaItsp }}
                  </span>
                </td>
                <td class="py-gutter-sm px-gutter-lg text-secondary">
                  {{ documento.nombreDependencia ?? '—' }}
                </td>
                <td class="py-gutter-sm px-gutter-lg">{{ documento.anio }}</td>
                <td class="py-gutter-sm px-gutter-lg">
                  <BadgeEstadoDocumento :estado="documento.estado" />
                </td>
                <td class="py-gutter-sm px-gutter-lg text-right text-secondary whitespace-nowrap">
                  v{{ documento.versionVigente?.numeroVersion ?? 0 }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ================= Paneles laterales ================= -->
      <div class="flex flex-col gap-gutter-lg">
        <!-- Pendientes de publicación -->
        <section
          v-if="puedeVerReportes"
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm"
        >
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Pendientes de publicación</h2>
          <p v-if="cargandoReportes" class="font-body-md text-body-md text-secondary">Cargando...</p>
          <p v-else-if="pendientes.length === 0" class="font-body-md text-body-md text-secondary">
            No hay documentos esperando publicación.
          </p>
          <ul v-else class="flex flex-col gap-gutter-sm">
            <li
              v-for="documento in pendientes"
              :key="documento.id"
              class="border-l-2 border-primary-container pl-gutter-sm"
            >
              <router-link
                :to="{ name: 'documento-detalle', params: { id: documento.id } }"
                class="block font-body-md text-body-md font-semibold text-on-surface hover:underline"
              >
                {{ documento.titulo }}
              </router-link>
              <p class="font-body-md text-body-md text-secondary">
                {{ documento.nombreDependencia ?? 'Sin dependencia' }} · Borrador ·
                {{ tiempoRelativo(documento.fechaCreacion) }}
              </p>
            </li>
          </ul>
          <router-link
            :to="{ name: 'documentos', query: { estado: 'BORRADOR' } }"
            class="h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors flex items-center justify-center"
          >
            Revisar cola
          </router-link>
        </section>

        <!-- Documentos por categoría ITSP. "Participación ciudadana" no
             aparece: desde el pulido de Fase 6 no clasifica documentos, así
             que su conteo sería siempre 0. La exclusión la aplica el
             backend con la constante ya centralizada. -->
        <section
          v-if="puedeVerReportes"
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm"
        >
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Documentos por categoría ITSP</h2>
          <p v-if="cargandoReportes" class="font-body-md text-body-md text-secondary">Cargando...</p>
          <ul v-else class="flex flex-col gap-gutter-sm">
            <li v-for="fila in porCategoria" :key="fila.nombre">
              <div class="flex items-baseline justify-between gap-gutter-sm">
                <span class="font-body-md text-body-md text-on-surface min-w-0 truncate">{{ fila.nombre }}</span>
                <span class="font-body-md text-body-md text-on-surface font-semibold shrink-0">
                  {{ fila.cantidad }}
                </span>
              </div>
              <div class="h-1.5 mt-1 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  class="h-full bg-primary-container rounded-full transition-all"
                  :style="{ width: proporcion(fila.cantidad, porCategoria) }"
                ></div>
              </div>
            </li>
          </ul>
        </section>

        <!-- Documentos por dependencia (RF-058). No está en el mockup; se
             agrega porque el requerimiento lo pide explícitamente. -->
        <section
          v-if="puedeVerReportes"
          class="bg-surface-container-lowest rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm"
        >
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Documentos por dependencia</h2>
          <p v-if="cargandoReportes" class="font-body-md text-body-md text-secondary">Cargando...</p>
          <p v-else-if="porDependencia.length === 0" class="font-body-md text-body-md text-secondary">
            Aún no hay dependencias registradas en el catálogo.
          </p>
          <ul v-else class="flex flex-col gap-gutter-sm">
            <li v-for="fila in porDependencia" :key="fila.nombre">
              <div class="flex items-baseline justify-between gap-gutter-sm">
                <span class="font-body-md text-body-md text-on-surface min-w-0 truncate">{{ fila.nombre }}</span>
                <span class="font-body-md text-body-md text-on-surface font-semibold shrink-0">
                  {{ fila.cantidad }}
                </span>
              </div>
              <div class="h-1.5 mt-1 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  class="h-full bg-primary-container rounded-full transition-all"
                  :style="{ width: proporcion(fila.cantidad, porDependencia) }"
                ></div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- ================= Accesos rápidos =================
         Antes eran tarjetas grandes con el protagonismo de la pantalla;
         ahora que Inicio muestra indicadores, bajan a una fila compacta al
         final, con la misma condición de permiso que tenían. -->
    <section v-if="accesosVisibles.length" class="flex flex-col gap-gutter-sm">
      <h2 class="font-label-sm text-label-sm text-tertiary uppercase">Accesos rápidos</h2>
      <div class="flex flex-wrap gap-gutter-sm">
        <router-link
          v-for="acceso in accesosVisibles"
          :key="acceso.nombreRuta"
          :to="{ name: acceso.nombreRuta }"
          class="h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-surface-alt hover:border-primary-container transition-colors flex items-center gap-2"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-[18px] text-acento">
            {{ acceso.icono }}
          </span>
          {{ acceso.etiqueta }}
        </router-link>
      </div>
    </section>
  </div>
</template>
