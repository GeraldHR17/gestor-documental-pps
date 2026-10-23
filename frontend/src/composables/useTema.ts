// src/composables/useTema.ts
//
// Modo claro/oscuro del área autenticada (spec-ajustes-posdespliegue §9.3).
//
// El estado vive a nivel de módulo (mismo patrón singleton sin Pinia que
// useNotificaciones): el conmutador de la barra superior y cualquier otro
// lector ven el mismo valor.
//
// - La primera vez se sigue la preferencia del sistema operativo, que es lo
//   que la persona ya eligió, y se siguen sus cambios mientras no elija
//   nada aquí.
// - En cuanto usa el conmutador, manda su elección: se guarda en este
//   navegador y deja de seguirse la del sistema.
//
// El atributo `data-tema` lo puso ya el script en línea de index.html antes
// de montar Vue; aquí se parte de ese valor para no recalcularlo distinto.
// El CSS solo lo aplica en la superficie 'sistema': el login y el portal
// público ignoran el tema.

import { computed, reactive, toRefs } from 'vue';

import type { Tema } from '@/types/tema.types';
import {
  aplicarTema,
  escucharTemaDelSistema,
  guardarTema,
  leerTemaGuardado,
  temaDelSistema,
} from '@/lib/tema';

interface EstadoTema {
  tema: Tema;
  /** true si la persona eligió con el conmutador; false si sigue al sistema. */
  elegidoPorPersona: boolean;
}

function temaInicial(): Tema {
  const enPagina = document.documentElement.getAttribute('data-tema');
  if (enPagina === 'claro' || enPagina === 'oscuro') return enPagina;
  return leerTemaGuardado() ?? temaDelSistema();
}

const estado = reactive<EstadoTema>({
  tema: temaInicial(),
  elegidoPorPersona: leerTemaGuardado() !== null,
});

aplicarTema(estado.tema);

// Sin desuscripción: el estado es de módulo y vive lo que vive la página.
escucharTemaDelSistema((temaNuevo) => {
  if (estado.elegidoPorPersona) return;
  estado.tema = temaNuevo;
  aplicarTema(temaNuevo);
});

export function useTema() {
  const esOscuro = computed(() => estado.tema === 'oscuro');

  function establecerTema(tema: Tema): void {
    estado.tema = tema;
    estado.elegidoPorPersona = true;
    guardarTema(tema);
    aplicarTema(tema);
  }

  function alternarTema(): void {
    establecerTema(esOscuro.value ? 'claro' : 'oscuro');
  }

  return { ...toRefs(estado), esOscuro, establecerTema, alternarTema };
}
