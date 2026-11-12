import { onBeforeUnmount, onMounted, ref } from 'vue';

import { MENSAJES_CARGA } from '@/lib/mensajesCarga';

const INTERVALO_ROTACION_MS = 3500;

let ultimoMensaje: string | null = null;

function elegirMensaje(): string {
  const disponibles = MENSAJES_CARGA.filter((mensaje) => mensaje !== ultimoMensaje);
  const elegido =
    disponibles[Math.floor(Math.random() * disponibles.length)] ?? MENSAJES_CARGA[0] ?? '';
  ultimoMensaje = elegido;
  return elegido;
}

export function useMensajeCarga() {
  const mensaje = ref(elegirMensaje());
  let temporizador: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    temporizador = setInterval(() => {
      mensaje.value = elegirMensaje();
    }, INTERVALO_ROTACION_MS);
  });

  onBeforeUnmount(() => {
    if (temporizador) clearInterval(temporizador);
  });

  return { mensaje };
}
