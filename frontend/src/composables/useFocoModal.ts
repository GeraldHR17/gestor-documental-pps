import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue';

const SELECTOR_ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocoModal(
  contenedor: Ref<HTMLElement | null>,
  elementoInicial?: Ref<HTMLElement | null>,
) {
  let elementoPrevio: HTMLElement | null = null;

  function enfocables(): HTMLElement[] {
    if (!contenedor.value) return [];
    return Array.from(contenedor.value.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES));
  }

  function manejarTabulacion(evento: KeyboardEvent): void {
    if (evento.key !== 'Tab') return;

    const lista = enfocables();
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];

    if (!primero || !ultimo) {
      evento.preventDefault();
      return;
    }

    const activo = document.activeElement;
    const fuera = !contenedor.value?.contains(activo);

    if (evento.shiftKey && (activo === primero || fuera)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && (activo === ultimo || fuera)) {
      evento.preventDefault();
      primero.focus();
    }
  }

  onMounted(async () => {
    elementoPrevio = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    (elementoInicial?.value ?? enfocables()[0] ?? contenedor.value)?.focus();
  });

  onBeforeUnmount(() => {
    if (elementoPrevio && document.contains(elementoPrevio)) {
      elementoPrevio.focus();
    }
  });

  return { manejarTabulacion };
}
