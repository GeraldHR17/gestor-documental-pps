// src/router/index.ts

import { createRouter, createWebHistory } from 'vue-router';
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { useAutenticacion } from '@/composables/useAutenticacion';
import AppShellLayout from '@/layouts/AppShellLayout.vue';
import LoginView from '@/views/LoginView.vue';
import { CATALOGOS_SIMPLES } from '@/lib/catalogos.config';

declare module 'vue-router' {
  interface RouteMeta {
    /** Accesible sin sesión iniciada. */
    publica?: boolean;
    /** Si se declara, exige ese permiso efectivo (RF-05). */
    permiso?: string;
    /** Rutas a las que un usuario ya autenticado no debería volver. */
    soloAnonimos?: boolean;
    /**
     * Rutas del portal público de transparencia: se resuelven SIN tocar la
     * sesión.
     *
     * No es lo mismo que `publica`. Una ruta `publica` (login, recuperar
     * contraseña) sí pasa por `restaurarSesion()`, porque necesita saber
     * si ya hay alguien dentro para redirigirlo. El portal no: lo abre un
     * ciudadano anónimo desde un iframe de WordPress, y pedirle al
     * servidor que renueve una sesión que no existe es una petición de
     * más en cada visita, con su cookie y su entrada en el log.
     */
    sinSesion?: boolean;
  }
}

/** Prefijo de todas las rutas del portal público. */
const PREFIJO_PORTAL_PUBLICO = '/vista';

/**
 * Genera las tres rutas (lista, alta y edición) de cada catálogo plano a
 * partir de `CATALOGOS_SIMPLES`. Se derivan en vez de escribirse a mano
 * para que los nombres de ruta que la configuración declara y los que el
 * router registra no puedan quedar desalineados.
 */
function rutasDeCatalogosSimples(): RouteRecordRaw[] {
  return Object.values(CATALOGOS_SIMPLES).flatMap((catalogo) => {
    const meta = { permiso: 'catalogos.administrar' };

    return [
      {
        path: `catalogos/${catalogo.recurso}`,
        name: catalogo.nombreRutaLista,
        component: () => import('@/views/CatalogoSimpleView.vue'),
        props: { catalogo: catalogo.recurso },
        meta,
      },
      {
        path: `catalogos/${catalogo.recurso}/nuevo`,
        name: catalogo.nombreRutaNueva,
        component: () => import('@/views/CatalogoSimpleFormularioView.vue'),
        props: { catalogo: catalogo.recurso },
        meta,
      },
      {
        path: `catalogos/${catalogo.recurso}/:id/editar`,
        name: catalogo.nombreRutaEdicion,
        component: () => import('@/views/CatalogoSimpleFormularioView.vue'),
        // El `id` viene de la ruta y `catalogo` es fijo, así que se
        // combinan en una función en vez de usar `props: true`.
        props: (ruta: RouteLocationNormalized) => ({
          catalogo: catalogo.recurso,
          id: ruta.params.id as string,
        }),
        meta,
      },
    ];
  });
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // ---------- Rutas públicas (sin shell) ----------
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { publica: true, soloAnonimos: true },
    },
    {
      path: '/recuperar-contrasena',
      name: 'recuperar-contrasena',
      component: () => import('@/views/RecuperarContrasenaView.vue'),
      meta: { publica: true },
    },
    {
      path: '/verificar-correo',
      name: 'verificar-correo',
      component: () => import('@/views/VerificarCorreoView.vue'),
      // Deliberadamente NO es soloAnonimos: alguien con sesión abierta debe
      // poder abrir el enlace de verificación que le llegó al correo.
      meta: { publica: true },
    },

    // ---------- Portal público de transparencia (sin sesión) ----------
    // Cuelga de su propio layout, NO de AppShellLayout: ese trae barra
    // lateral, menú de usuario y cierre de sesión, que dentro del iframe
    // de WordPress no le sirven a nadie.
    {
      path: PREFIJO_PORTAL_PUBLICO,
      component: () => import('@/layouts/PortalPublicoLayout.vue'),
      meta: { sinSesion: true },
      children: [
        {
          path: '',
          name: 'portal-secciones',
          component: () => import('@/views/PortalSeccionesView.vue'),
          meta: { sinSesion: true },
        },
        {
          path: ':seccion',
          name: 'portal-seccion',
          component: () => import('@/views/PortalSeccionView.vue'),
          props: true,
          meta: { sinSesion: true },
        },
        {
          path: ':seccion/:subseccion',
          name: 'portal-subseccion',
          component: () => import('@/views/PortalSubseccionView.vue'),
          props: true,
          meta: { sinSesion: true },
        },
      ],
    },

    // ---------- Área autenticada (dentro del shell) ----------
    {
      path: '/',
      component: AppShellLayout,
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        {
          path: 'inicio',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'usuarios',
          name: 'usuarios',
          component: () => import('@/views/GestionUsuariosView.vue'),
          meta: { permiso: 'usuarios.administrar' },
        },
        {
          path: 'usuarios/nuevo',
          name: 'usuario-nuevo',
          component: () => import('@/views/UsuarioFormularioView.vue'),
          meta: { permiso: 'usuarios.administrar' },
        },
        {
          path: 'usuarios/:id/editar',
          name: 'usuario-editar',
          component: () => import('@/views/UsuarioFormularioView.vue'),
          props: true,
          meta: { permiso: 'usuarios.administrar' },
        },
        {
          path: 'roles-permisos',
          name: 'roles-permisos',
          component: () => import('@/views/RolesPermisosView.vue'),
        },
        {
          path: 'bitacora',
          name: 'bitacora',
          component: () => import('@/views/BitacoraView.vue'),
          meta: { permiso: 'bitacora.consultar' },
        },

        // ---------- Documentos (Fase 6) ----------
        // 'documentos/nuevo' se declara antes que 'documentos/:id' para que
        // la ruta estática gane; el router ya prioriza los segmentos fijos,
        // pero dejarlas en este orden evita depender de ese detalle.
        {
          path: 'documentos',
          name: 'documentos',
          component: () => import('@/views/DocumentosView.vue'),
          meta: { permiso: 'documentos.consultar' },
        },
        {
          path: 'documentos/nuevo',
          name: 'documento-nuevo',
          // Asistente de tres pasos (Archivo -> Metadatos -> Revisión); la
          // edición sigue en DocumentoFormularioView, sin asistente.
          component: () => import('@/views/DocumentoRegistroView.vue'),
          meta: { permiso: 'documentos.crear' },
        },
        {
          path: 'documentos/:id',
          name: 'documento-detalle',
          component: () => import('@/views/DocumentoDetalleView.vue'),
          props: true,
          meta: { permiso: 'documentos.consultar' },
        },
        {
          path: 'documentos/:id/editar',
          name: 'documento-editar',
          component: () => import('@/views/DocumentoFormularioView.vue'),
          props: true,
          meta: { permiso: 'documentos.editar' },
        },

        // ---------- Catálogos (Fase 5) ----------
        // Los tres catálogos planos comparten vista y formulario: lo que
        // cambia entre ellos viaja como la prop estática `catalogo`, que
        // `lib/catalogos.config.ts` traduce a textos, ruta de la API y
        // límites de columna.
        ...rutasDeCatalogosSimples(),
        {
          path: 'catalogos/categorias-itsp',
          name: 'categorias-itsp',
          component: () => import('@/views/CategoriasItspView.vue'),
          meta: { permiso: 'catalogos.administrar' },
        },
        {
          path: 'catalogos/categorias-itsp/nueva',
          name: 'categoria-itsp-nueva',
          component: () => import('@/views/CategoriaItspFormularioView.vue'),
          meta: { permiso: 'catalogos.administrar' },
        },
        {
          path: 'catalogos/categorias-itsp/:id/editar',
          name: 'categoria-itsp-editar',
          component: () => import('@/views/CategoriaItspFormularioView.vue'),
          props: true,
          meta: { permiso: 'catalogos.administrar' },
        },
      ],
    },

    {
      path: '/:rutaNoEncontrada(.*)*',
      name: 'no-encontrado',
      // Un enlace roto DENTRO del portal no puede acabar en el panel
      // interno: el ciudadano vería el formulario de inicio de sesión sin
      // entender por qué. Se queda en la portada pública.
      redirect: (destino) =>
        destino.path.startsWith(PREFIJO_PORTAL_PUBLICO)
          ? { name: 'portal-secciones' }
          : { name: 'dashboard' },
    },
  ],
});

router.beforeEach(async (destino) => {
  // PRIMERA comprobación, antes de tocar la sesión. El portal público lo
  // abre gente que no tiene cuenta: llamar a restaurarSesion() aquí
  // dispararía un POST /auth/refresh en cada visita, con su cookie y su
  // entrada en el log, para una sesión que no existe.
  if (destino.meta.sinSesion) {
    return true;
  }

  const { usuario, motivoCierre, restaurarSesion, tienePermiso } = useAutenticacion();

  // El access token vive solo en memoria, así que tras un F5 hay que
  // intentar rehacer la sesión con la cookie httpOnly antes de decidir
  // si la persona está o no autenticada.
  if (!usuario.value) {
    await restaurarSesion();
  }

  const autenticado = usuario.value !== null;

  if (destino.meta.publica) {
    if (autenticado && destino.meta.soloAnonimos) {
      return { name: 'dashboard' };
    }
    return true;
  }

  if (!autenticado) {
    // Si la sesión venció (8 horas absolutas), el login lo explica con
    // `motivo`; al volver a entrar se retoma la ruta que se pedía.
    return {
      name: 'login',
      query: {
        redirigir: destino.fullPath,
        ...(motivoCierre.value === 'sesion-expirada' ? { motivo: 'sesion-expirada' } : {}),
      },
    };
  }

  // Segunda barrera, cosmética: la autorización real la impone el backend
  // (PermisosGuard). Esto solo evita mostrar una pantalla que devolvería 403.
  if (destino.meta.permiso && !tienePermiso(destino.meta.permiso)) {
    return { name: 'dashboard' };
  }

  return true;
});

export default router;
