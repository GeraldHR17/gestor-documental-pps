// src/router/index.ts

import { createRouter, createWebHistory } from 'vue-router';
import { useAutenticacion } from '@/composables/useAutenticacion';
import AppShellLayout from '@/layouts/AppShellLayout.vue';
import LoginView from '@/views/LoginView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** Accesible sin sesión iniciada. */
    publica?: boolean;
    /** Si se declara, exige ese permiso efectivo (RF-05). */
    permiso?: string;
    /** Rutas a las que un usuario ya autenticado no debería volver. */
    soloAnonimos?: boolean;
  }
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
      path: '/registro',
      name: 'registro',
      // Carga diferida: no forman parte del recorrido habitual del
      // funcionario, así que no tienen por qué pesar en el bundle inicial.
      component: () => import('@/views/RegistroView.vue'),
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
          path: 'roles-permisos',
          name: 'roles-permisos',
          component: () => import('@/views/RolesPermisosView.vue'),
        },
      ],
    },

    {
      path: '/:rutaNoEncontrada(.*)*',
      name: 'no-encontrado',
      redirect: { name: 'dashboard' },
    },
  ],
});

router.beforeEach(async (destino) => {
  const { usuario, restaurarSesion, tienePermiso } = useAutenticacion();

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
    return { name: 'login', query: { redirigir: destino.fullPath } };
  }

  // Segunda barrera, cosmética: la autorización real la impone el backend
  // (PermisosGuard). Esto solo evita mostrar una pantalla que devolvería 403.
  if (destino.meta.permiso && !tienePermiso(destino.meta.permiso)) {
    return { name: 'dashboard' };
  }

  return true;
});

export default router;
