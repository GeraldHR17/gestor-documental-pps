import { readonly, ref } from 'vue';

const SECUENCIA_TECLAS = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

const TECLAS_MODIFICADORAS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);
const CLICS_NECESARIOS = 5;
const VENTANA_CLICS_MS = 3000;

const abierto = ref(false);
let teclasRecientes: string[] = [];
let marcasClic: number[] = [];

function esCampoEditable(elemento: EventTarget | Element | null): boolean {
  if (!(elemento instanceof HTMLElement)) return false;
  const etiqueta = elemento.tagName;
  return (
    etiqueta === 'INPUT' ||
    etiqueta === 'TEXTAREA' ||
    etiqueta === 'SELECT' ||
    elemento.isContentEditable
  );
}

function abrir(): void {
  teclasRecientes = [];
  marcasClic = [];
  abierto.value = true;
}

function cerrar(): void {
  abierto.value = false;
}

function procesarTecla(evento: KeyboardEvent): void {
  if (abierto.value) return;
  if (esCampoEditable(evento.target) || esCampoEditable(document.activeElement)) return;
  if (TECLAS_MODIFICADORAS.has(evento.key)) return;

  const tecla = evento.key.length === 1 ? evento.key.toLowerCase() : evento.key;
  teclasRecientes = [...teclasRecientes, tecla].slice(-SECUENCIA_TECLAS.length);

  const coincide =
    teclasRecientes.length === SECUENCIA_TECLAS.length &&
    teclasRecientes.every((valor, indice) => valor === SECUENCIA_TECLAS[indice]);

  if (coincide) abrir();
}

function registrarClic(): void {
  const ahora = Date.now();
  marcasClic = [...marcasClic.filter((marca) => ahora - marca < VENTANA_CLICS_MS), ahora];
  if (marcasClic.length >= CLICS_NECESARIOS) abrir();
}

export function usePanelAcercaDe() {
  return {
    abierto: readonly(abierto),
    abrir,
    cerrar,
    procesarTecla,
    registrarClic,
  };
}
