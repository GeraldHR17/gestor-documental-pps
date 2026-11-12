import { CATALOGOS_SIMPLES } from '@/lib/catalogos.config';

export const ROL_ADMINISTRADOR_SISTEMA = 'Superadministrador';

export interface EnlaceNavegacion {
  nombreRuta: string;
  etiqueta: string;
  icono: string;
  permisoRequerido?: string;
}

export const ENLACES: EnlaceNavegacion[] = [
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

export const ENLACES_CATALOGOS: EnlaceNavegacion[] = [
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

export function visiblesSegunPermisos(
  enlaces: EnlaceNavegacion[],
  tienePermiso: (permiso: string) => boolean,
): EnlaceNavegacion[] {
  return enlaces.filter(
    (enlace) => !enlace.permisoRequerido || tienePermiso(enlace.permisoRequerido),
  );
}
