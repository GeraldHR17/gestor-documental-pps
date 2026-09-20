<script setup lang="ts">
// Formulario de creación/edición de usuario, rediseñado a dos columnas
// según los mockups del PO: el formulario a la izquierda y, a la derecha,
// un panel de Resumen con vista previa en vivo, los permisos reales del
// rol seleccionado y —sólo en edición— el contador de documentos y los
// cambios recientes de la bitácora.
//
// Lo que NO se tomó del mockup, a propósito: nombre y apellidos separados
// (sigue siendo un solo campo), puesto y teléfono (no existen en el
// modelo), el rol "Consulta interna" (no confirmado) y los recuadros de
// trazabilidad. Los roles salen del catálogo real, no de nombres fijos.
//
// El rol se cambia con `asignarRol` en vez de `actualizar`, para no
// saltarse las reglas de auto-modificación y de asignación de
// Superadministrador que ese endpoint dedicado ya aplica en el backend.
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useUsuarios } from '@/composables/useUsuarios';
import { useRolesPermisos } from '@/composables/useRolesPermisos';
import { useNotificaciones, obtenerMensajeError } from '@/composables/useNotificaciones';
import ModalConfirmacion from '@/components/ModalConfirmacion.vue';
import usuariosService from '@/services/usuarios.service';
import rolesService from '@/services/roles.service';
import bitacoraService from '@/services/bitacora.service';
import { crearServicioCatalogo } from '@/services/catalogos.service';
import { formatearFecha } from '@/lib/documentos.config';
import {
  normalizarCorreo,
  validarContrasena,
  validarCorreoInstitucional,
  validarIdentificacion,
  validarNombreCompleto,
} from '@/lib/validaciones';
import type { EstadoUsuario } from '@/types/usuario.types';
import type { CatalogoDto } from '@/types/catalogo.types';
import type { PermisoDeRolDto } from '@/types/rol.types';
import type { EntradaBitacoraDto } from '@/types/bitacora.types';

const props = defineProps<{ id?: string }>();
const router = useRouter();

const { crear, actualizar, asignarRol, cambiarEstado } = useUsuarios();
const { roles, cargarRoles } = useRolesPermisos();
const { notificarExito, notificarError } = useNotificaciones();
const dependenciasService = crearServicioCatalogo('dependencias');

const modoEdicion = computed(() => props.id !== undefined);
const idUsuario = computed(() => (props.id ? Number(props.id) : null));

const cargando = ref(false);
const guardando = ref(false);
const error = ref<string | null>(null);

const nombreCompleto = ref('');
const identificacion = ref('');
const correo = ref('');
const contrasenaTemporal = ref('');
const idRol = ref<number | null>(null);
const idDependencia = ref<number | null>(null);
const estado = ref<EstadoUsuario>('ACTIVO');

const dependencias = ref<CatalogoDto[]>([]);

// ---------- Validación en tiempo real ----------

type CampoValidado = 'nombreCompleto' | 'identificacion' | 'correo' | 'contrasenaTemporal' | 'idRol';

const camposTocados = reactive<Record<CampoValidado, boolean>>({
  nombreCompleto: false,
  identificacion: false,
  correo: false,
  contrasenaTemporal: false,
  idRol: false,
});

function marcarTocado(campo: CampoValidado): void {
  camposTocados[campo] = true;
}

const errores = computed<Record<CampoValidado, string | null>>(() => ({
  nombreCompleto: validarNombreCompleto(nombreCompleto.value),
  identificacion: validarIdentificacion(identificacion.value),
  correo: validarCorreoInstitucional(correo.value),
  contrasenaTemporal: modoEdicion.value ? null : validarContrasena(contrasenaTemporal.value),
  idRol: idRol.value === null ? 'Seleccione un rol para el usuario.' : null,
}));

function errorVisible(campo: CampoValidado): string | null {
  return camposTocados[campo] ? errores.value[campo] : null;
}

const formularioValido = computed(() => Object.values(errores.value).every((e) => e === null));

// ---------- Resumen en vivo (E.1) ----------

const iniciales = computed(() =>
  nombreCompleto.value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join(''),
);

const nombreRolSeleccionado = computed(
  () => roles.value.find((rol) => rol.idRol === idRol.value)?.nombre ?? null,
);
const nombreDependenciaSeleccionada = computed(
  () => dependencias.value.find((fila) => fila.id === idDependencia.value)?.nombre ?? null,
);

// ---------- Permisos del rol seleccionado (E.2) ----------
//
// Se consultan al catálogo real de permisos por rol cada vez que cambia
// la selección; se memorizan por rol para no repetir la petición al ir y
// volver entre tarjetas.
const permisosPorRol = new Map<number, PermisoDeRolDto[]>();
const permisosDelRol = ref<PermisoDeRolDto[]>([]);
const cargandoPermisos = ref(false);

watch(
  idRol,
  async (nuevo) => {
    if (nuevo === null) {
      permisosDelRol.value = [];
      return;
    }
    const memorizados = permisosPorRol.get(nuevo);
    if (memorizados) {
      permisosDelRol.value = memorizados;
      return;
    }
    cargandoPermisos.value = true;
    try {
      const respuesta = await rolesService.obtenerPermisosPorRol(nuevo);
      const asignados = respuesta.permisos.filter((permiso) => permiso.asignado);
      permisosPorRol.set(nuevo, asignados);
      // Sólo se aplica si la selección sigue siendo la misma: si la persona
      // cambió de rol mientras cargaba, la respuesta vieja no debe pisar.
      if (idRol.value === nuevo) permisosDelRol.value = asignados;
    } catch {
      permisosDelRol.value = [];
    } finally {
      cargandoPermisos.value = false;
    }
  },
  { immediate: true },
);

// ---------- Sólo en edición: documentos y cambios recientes (E.3, E.4) ----------

const cantidadDocumentos = ref<number | null>(null);
const cambiosRecientes = ref<EntradaBitacoraDto[]>([]);
const bitacoraDisponible = ref(true);

const ETIQUETAS_ACCION: Record<string, string> = {
  CREAR_USUARIO: 'Creación de la cuenta',
  ACTUALIZAR_USUARIO: 'Actualización de datos',
  ASIGNAR_ROL_USUARIO: 'Cambio de rol',
  INACTIVAR_USUARIO: 'Inactivación de la cuenta',
  REACTIVAR_USUARIO: 'Reactivación de la cuenta',
};

function describirCambio(entrada: EntradaBitacoraDto): string {
  const base = ETIQUETAS_ACCION[entrada.accion] ?? entrada.accion;
  const campos = entrada.detalles?.camposActualizados;
  return Array.isArray(campos) && campos.length > 0 ? `${base} (${campos.join(', ')})` : base;
}

async function cargarActividad(id: number): Promise<void> {
  try {
    const respuesta = await bitacoraService.consultar({
      entidad: 'usuarios',
      idRegistro: id,
      limite: 5,
    });
    cambiosRecientes.value = respuesta.datos;
  } catch {
    // Sin 'bitacora.consultar' el endpoint responde 403: el panel se
    // oculta en vez de mostrar un error en un formulario que sí funciona.
    bitacoraDisponible.value = false;
  }
}

// ---------- Cambios sin guardar ----------

function instantaneaActual(): string {
  return JSON.stringify({
    nombreCompleto: nombreCompleto.value,
    identificacion: identificacion.value,
    correo: correo.value,
    contrasenaTemporal: contrasenaTemporal.value,
    idRol: idRol.value,
    idDependencia: idDependencia.value,
    estado: estado.value,
  });
}

// Se compara contra el estado inicial en vez de marcar "sucio" al primer
// cambio: si la persona escribe algo y lo deshace, no se le pregunta por
// cambios que ya no existen.
const valoresIniciales = ref(instantaneaActual());
const hayCambiosSinGuardar = computed(() => instantaneaActual() !== valoresIniciales.value);

// Se conservan aparte para saber qué endpoints hay que llamar al guardar:
// rol y estado viajan por rutas dedicadas, no por `actualizar`.
const rolInicial = ref<number | null>(null);
const estadoInicial = ref<EstadoUsuario>('ACTIVO');

const guardadoConExito = ref(false);
const mostrarModalSalir = ref(false);
let resolverSalida: ((salir: boolean) => void) | null = null;

onBeforeRouteLeave(async () => {
  if (guardadoConExito.value || !hayCambiosSinGuardar.value) return true;
  mostrarModalSalir.value = true;
  return await new Promise<boolean>((resolve) => {
    resolverSalida = resolve;
  });
});

function responderSalida(salir: boolean): void {
  mostrarModalSalir.value = false;
  resolverSalida?.(salir);
  resolverSalida = null;
}

// ---------- Carga y guardado ----------

async function cargarDatosIniciales(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    const [, listaDependencias] = await Promise.all([
      cargarRoles(),
      dependenciasService.listar({ estado: 'ACTIVO' }).catch(() => [] as CatalogoDto[]),
    ]);
    dependencias.value = listaDependencias;

    if (modoEdicion.value && idUsuario.value !== null) {
      const usuario = await usuariosService.obtener(idUsuario.value);
      nombreCompleto.value = usuario.nombreCompleto;
      identificacion.value = usuario.identificacion;
      correo.value = usuario.correo;
      idRol.value = usuario.idRol;
      idDependencia.value = usuario.idDependencia;
      estado.value = usuario.estado;
      cantidadDocumentos.value = usuario.cantidadDocumentosRegistrados ?? 0;
      rolInicial.value = usuario.idRol;
      estadoInicial.value = usuario.estado;
      await cargarActividad(idUsuario.value);
    }
    valoresIniciales.value = instantaneaActual();
  } catch (err) {
    error.value = obtenerMensajeError(err, 'No se pudo cargar la información del usuario.');
  } finally {
    cargando.value = false;
  }
}

const mostrarModalGuardar = ref(false);

const tituloModalGuardar = computed(() => (modoEdicion.value ? 'Guardar cambios' : 'Crear usuario'));
const mensajeModalGuardar = computed(() =>
  modoEdicion.value
    ? '¿Confirma que desea guardar los cambios de este usuario?'
    : '¿Confirma que desea crear este usuario?',
);

function solicitarGuardado(): void {
  (Object.keys(camposTocados) as CampoValidado[]).forEach(marcarTocado);
  if (!formularioValido.value) return;
  mostrarModalGuardar.value = true;
}

async function confirmarGuardado(): Promise<void> {
  guardando.value = true;
  error.value = null;
  try {
    if (!modoEdicion.value) {
      await crear({
        nombreCompleto: nombreCompleto.value.trim(),
        identificacion: identificacion.value.trim(),
        correo: normalizarCorreo(correo.value),
        contrasenaTemporal: contrasenaTemporal.value,
        idRol: idRol.value as number,
        ...(idDependencia.value !== null ? { idDependencia: idDependencia.value } : {}),
      });
      guardadoConExito.value = true;
      mostrarModalGuardar.value = false;
      notificarExito('Usuario creado correctamente.');
      router.push({ name: 'usuarios' });
      return;
    }

    const id = idUsuario.value as number;
    await actualizar(id, {
      nombreCompleto: nombreCompleto.value.trim(),
      identificacion: identificacion.value.trim(),
      correo: normalizarCorreo(correo.value),
      // `null` explícito quita la dependencia; se envía siempre para que
      // "Sin dependencia" también se persista.
      idDependencia: idDependencia.value,
    });

    if (idRol.value !== null && idRol.value !== rolInicial.value) {
      await asignarRol(id, idRol.value);
    }

    if (estado.value !== estadoInicial.value) {
      await cambiarEstado(id, estado.value);
    }

    guardadoConExito.value = true;
    mostrarModalGuardar.value = false;
    notificarExito('Cambios guardados correctamente.');
    router.push({ name: 'usuarios' });
  } catch (err) {
    const mensajePorDefecto = modoEdicion.value
      ? 'No se pudo actualizar el usuario.'
      : 'No se pudo crear el usuario.';
    error.value = obtenerMensajeError(err, mensajePorDefecto);
    notificarError(err, mensajePorDefecto);
    mostrarModalGuardar.value = false;
  } finally {
    guardando.value = false;
  }
}

function manejarCancelar(): void {
  router.push({ name: 'usuarios' });
}

onMounted(cargarDatosIniciales);
</script>

<template>
  <div class="flex-1 p-margin-mobile md:p-margin-desktop flex flex-col gap-gutter-lg bg-background min-h-screen">
    <div class="border-b border-surface-alt pb-gutter-sm">
      <h1 class="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface">
        {{ modoEdicion ? 'Editar Usuario' : 'Nuevo Usuario' }}
      </h1>
      <p class="font-body-lg text-body-lg text-secondary mt-2">
        {{
          modoEdicion
            ? 'Actualice los datos, la dependencia, el rol o el estado del usuario.'
            : 'Complete los datos para dar de alta a un nuevo usuario del sistema.'
        }}
      </p>
    </div>

    <div v-if="cargando" class="text-secondary font-body-lg text-body-lg">Cargando...</div>

    <form
      v-else
      class="grid grid-cols-1 xl:grid-cols-[1fr_20rem] gap-gutter-lg items-start"
      novalidate
      @submit.prevent="solicitarGuardado"
    >
      <!-- ================= Columna izquierda ================= -->
      <div class="flex flex-col gap-gutter-lg min-w-0">
        <section class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-lg">
          <div class="flex items-baseline justify-between gap-gutter-sm flex-wrap">
            <h2 class="font-headline-sm text-headline-sm text-on-surface">Datos de la persona</h2>
            <p class="font-body-md text-body-md text-secondary">
              Los campos con <span class="text-error">*</span> son obligatorios
            </p>
          </div>

          <div>
            <label for="nombreCompleto" class="block font-body-md text-body-md text-on-surface mb-2">
              Nombre completo <span class="text-error" aria-hidden="true">*</span>
            </label>
            <input
              id="nombreCompleto"
              v-model="nombreCompleto"
              type="text"
              placeholder="Nombre y apellidos"
              :aria-invalid="errorVisible('nombreCompleto') !== null"
              class="w-full h-touch-target px-3 border rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
              :class="errorVisible('nombreCompleto') ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface'"
              @input="marcarTocado('nombreCompleto')"
              @blur="marcarTocado('nombreCompleto')"
            />
            <p v-if="errorVisible('nombreCompleto')" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('nombreCompleto') }}
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-lg">
            <div>
              <label for="identificacion" class="block font-body-md text-body-md text-on-surface mb-2">
                Identificación <span class="text-error" aria-hidden="true">*</span>
              </label>
              <input
                id="identificacion"
                v-model="identificacion"
                type="text"
                placeholder="000000000"
                :aria-invalid="errorVisible('identificacion') !== null"
                class="w-full h-touch-target px-3 border rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
                :class="errorVisible('identificacion') ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface'"
                @input="marcarTocado('identificacion')"
                @blur="marcarTocado('identificacion')"
              />
              <p v-if="errorVisible('identificacion')" class="font-body-md text-body-md text-error mt-2">
                {{ errorVisible('identificacion') }}
              </p>
              <p v-else class="font-body-md text-body-md text-secondary mt-2">Sin guiones ni espacios.</p>
            </div>

            <div>
              <label for="correo" class="block font-body-md text-body-md text-on-surface mb-2">
                Correo institucional <span class="text-error" aria-hidden="true">*</span>
              </label>
              <input
                id="correo"
                v-model="correo"
                type="email"
                placeholder="usuario@munipalmares.go.cr"
                :aria-invalid="errorVisible('correo') !== null"
                class="w-full h-touch-target px-3 border rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
                :class="errorVisible('correo') ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface'"
                @input="marcarTocado('correo')"
                @blur="marcarTocado('correo')"
              />
              <p v-if="errorVisible('correo')" class="font-body-md text-body-md text-error mt-2">
                {{ errorVisible('correo') }}
              </p>
              <p v-else class="font-body-md text-body-md text-secondary mt-2">
                Debe pertenecer al dominio institucional munipalmares.go.cr.
              </p>
            </div>
          </div>

          <div v-if="!modoEdicion">
            <label for="contrasenaTemporal" class="block font-body-md text-body-md text-on-surface mb-2">
              Contraseña temporal <span class="text-error" aria-hidden="true">*</span>
            </label>
            <input
              id="contrasenaTemporal"
              v-model="contrasenaTemporal"
              type="text"
              placeholder="Mín. 8 caracteres, una mayúscula, un número y un carácter especial"
              :aria-invalid="errorVisible('contrasenaTemporal') !== null"
              class="w-full h-touch-target px-3 border rounded-primary bg-pure-white text-on-surface placeholder:text-secondary focus:border-2 focus:outline-none transition-colors font-body-lg text-body-lg"
              :class="errorVisible('contrasenaTemporal') ? 'border-error focus:border-error' : 'border-outline focus:border-on-surface'"
              @input="marcarTocado('contrasenaTemporal')"
              @blur="marcarTocado('contrasenaTemporal')"
            />
            <p v-if="errorVisible('contrasenaTemporal')" class="font-body-md text-body-md text-error mt-2">
              {{ errorVisible('contrasenaTemporal') }}
            </p>
            <p v-else class="font-body-md text-body-md text-secondary mt-2">
              El usuario podrá cambiarla luego desde "Recuperar contraseña".
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter-lg">
            <div>
              <label for="idDependencia" class="block font-body-md text-body-md text-on-surface mb-2">
                Dependencia <span class="text-secondary">(opcional)</span>
              </label>
              <select
                id="idDependencia"
                v-model="idDependencia"
                class="w-full h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
              >
                <option :value="null">Sin dependencia</option>
                <option v-for="dependencia in dependencias" :key="dependencia.id" :value="dependencia.id">
                  {{ dependencia.nombre }}
                </option>
              </select>
              <p class="font-body-md text-body-md text-secondary mt-2">
                Se precarga en los documentos que registre esta persona.
              </p>
            </div>
            <div v-if="modoEdicion">
              <label for="estado" class="block font-body-md text-body-md text-on-surface mb-2">Estado</label>
              <select
                id="estado"
                v-model="estado"
                class="w-full h-touch-target px-3 rounded-secondary border border-outline bg-surface-container-lowest text-on-surface font-body-md text-body-md"
              >
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Rol asignado: tarjetas seleccionables generadas desde el
             catálogo real de roles, no desde nombres fijos. -->
        <fieldset class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm">
          <legend class="sr-only">Rol asignado</legend>
          <div>
            <h2 class="font-headline-sm text-headline-sm text-on-surface">
              Rol asignado <span class="text-error" aria-hidden="true">*</span>
            </h2>
            <p class="font-body-md text-body-md text-secondary mt-1">
              El rol determina las acciones permitidas en el sistema.
            </p>
          </div>

          <label
            v-for="rol in roles"
            :key="rol.idRol"
            class="flex items-start gap-3 p-gutter-sm rounded-primary border-2 cursor-pointer transition-colors"
            :class="idRol === rol.idRol ? 'border-primary-container bg-surface-container-low' : 'border-surface-alt hover:bg-surface-container-low'"
          >
            <input
              v-model.number="idRol"
              type="radio"
              name="rol"
              :value="rol.idRol"
              class="mt-1 w-4 h-4 accent-primary-container"
              @change="marcarTocado('idRol')"
            />
            <span class="min-w-0">
              <span class="block font-body-lg text-body-lg font-semibold text-on-surface">{{ rol.nombre }}</span>
              <span v-if="rol.descripcion" class="block font-body-md text-body-md text-secondary">
                {{ rol.descripcion }}
              </span>
            </span>
          </label>

          <p v-if="errorVisible('idRol')" class="font-body-md text-body-md text-error">
            {{ errorVisible('idRol') }}
          </p>
        </fieldset>

        <p v-if="error" role="alert" aria-live="assertive" class="text-error font-body-md text-body-md">
          {{ error }}
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-end gap-gutter-sm">
          <button
            type="button"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-pure-white text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
            @click="manejarCancelar"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="guardando || !formularioValido"
            class="w-full sm:w-auto h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ guardando ? 'Guardando...' : modoEdicion ? 'Guardar cambios' : 'Crear usuario' }}
          </button>
        </div>
      </div>

      <!-- ================= Columna derecha ================= -->
      <div class="flex flex-col gap-gutter-lg xl:sticky xl:top-20">
        <!-- Resumen en vivo (E.1) -->
        <section class="bg-on-surface text-pure-white rounded-primary p-gutter-lg flex flex-col gap-gutter-sm" aria-label="Resumen">
          <h2 class="font-label-sm text-label-sm uppercase tracking-wide text-primary-fixed-dim">Resumen</h2>
          <div class="flex items-center gap-3">
            <span
              class="w-12 h-12 rounded-full bg-primary-container text-pure-white font-headline-sm text-headline-sm flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              {{ iniciales || '—' }}
            </span>
            <div class="min-w-0">
              <p class="font-body-lg text-body-lg font-semibold truncate">
                {{ nombreCompleto.trim() || (modoEdicion ? '—' : 'Nueva cuenta') }}
              </p>
              <p class="font-body-md text-body-md text-pure-white/70 truncate">
                {{ correo.trim() || 'Sin correo asignado' }}
              </p>
            </div>
          </div>
          <dl class="flex flex-col divide-y divide-pure-white/15 font-body-md text-body-md">
            <div class="flex justify-between gap-gutter-sm py-2">
              <dt class="text-pure-white/70">Rol</dt>
              <dd class="font-semibold text-right">{{ nombreRolSeleccionado ?? 'Sin asignar' }}</dd>
            </div>
            <div class="flex justify-between gap-gutter-sm py-2">
              <dt class="text-pure-white/70">Dependencia</dt>
              <dd class="font-semibold text-right">{{ nombreDependenciaSeleccionada ?? 'Sin dependencia' }}</dd>
            </div>
            <div class="flex justify-between gap-gutter-sm py-2">
              <dt class="text-pure-white/70">{{ modoEdicion ? 'Estado' : 'Estado inicial' }}</dt>
              <dd class="font-semibold text-right">{{ estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}</dd>
            </div>
            <div v-if="modoEdicion" class="flex justify-between gap-gutter-sm py-2">
              <dt class="text-pure-white/70">Documentos registrados</dt>
              <dd class="font-semibold text-right">{{ cantidadDocumentos ?? '—' }}</dd>
            </div>
          </dl>
        </section>

        <!-- Permisos del rol seleccionado (E.2) -->
        <section class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm" aria-live="polite">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Permisos del rol seleccionado</h2>
          <p v-if="idRol === null" class="font-body-md text-body-md text-secondary">
            Seleccione un rol para ver sus permisos.
          </p>
          <p v-else-if="cargandoPermisos" class="font-body-md text-body-md text-secondary">Cargando...</p>
          <p v-else-if="permisosDelRol.length === 0" class="font-body-md text-body-md text-secondary">
            Este rol no tiene permisos asignados.
          </p>
          <ul v-else class="flex flex-col gap-2">
            <li v-for="permiso in permisosDelRol" :key="permiso.idPermiso" class="flex items-start gap-2 font-body-md text-body-md">
              <span class="w-2.5 h-2.5 mt-1.5 rounded-full bg-primary-container shrink-0" aria-hidden="true"></span>
              <span class="min-w-0">
                <span class="text-on-surface">{{ permiso.descripcion ?? permiso.nombre }}</span>
                <code class="block text-secondary text-body-md">{{ permiso.nombre }}</code>
              </span>
            </li>
          </ul>
        </section>

        <!-- Cambios recientes (E.4), sólo en edición -->
        <section
          v-if="modoEdicion && bitacoraDisponible"
          class="bg-pure-white rounded-primary border border-surface-alt p-gutter-lg flex flex-col gap-gutter-sm"
        >
          <div class="flex items-center justify-between gap-gutter-sm">
            <h2 class="font-headline-sm text-headline-sm text-on-surface">Cambios recientes</h2>
            <router-link
              :to="{ name: 'bitacora', query: { entidad: 'usuarios', idRegistro: String(idUsuario) } }"
              class="font-label-sm text-label-sm text-primary underline hover:text-primary-container transition-colors whitespace-nowrap"
            >
              Ver bitácora
            </router-link>
          </div>
          <p v-if="cambiosRecientes.length === 0" class="font-body-md text-body-md text-secondary">
            Sin cambios registrados en la bitácora.
          </p>
          <ul v-else class="flex flex-col divide-y divide-surface-alt">
            <li v-for="entrada in cambiosRecientes" :key="entrada.id" class="py-2">
              <p class="font-body-md text-body-md font-semibold text-on-surface">{{ describirCambio(entrada) }}</p>
              <p class="font-body-md text-body-md text-secondary">
                {{ entrada.nombreUsuario ?? 'Sistema' }} · {{ formatearFecha(entrada.fechaHora) }}
              </p>
            </li>
          </ul>
        </section>
      </div>
    </form>

    <ModalConfirmacion
      v-if="mostrarModalGuardar"
      :titulo="tituloModalGuardar"
      :mensaje="mensajeModalGuardar"
      :procesando="guardando"
      @cancelar="mostrarModalGuardar = false"
      @confirmar="confirmarGuardado"
    />

    <ModalConfirmacion
      v-if="mostrarModalSalir"
      titulo="Cambios sin guardar"
      mensaje="Tiene cambios sin guardar. Si sale ahora, esta información se perderá. ¿Desea salir de todas formas?"
      texto-confirmar="Salir"
      texto-cancelar="Cancelar"
      @cancelar="responderSalida(false)"
      @confirmar="responderSalida(true)"
    />
  </div>
</template>
