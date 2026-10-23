<script setup lang="ts">
// Modal de confirmación PREVIA a una acción (intención). No confundir con
// los toasts de `useNotificaciones`, que informan el resultado DESPUÉS:
// el flujo completo es modal de intención -> acción -> toast de resultado.
//
// El componente no decide cuándo se muestra: quien lo usa lo monta con
// `v-if` y responde a `confirmar` / `cancelar`.
withDefaults(
  defineProps<{
    titulo: string;
    mensaje?: string;
    textoConfirmar?: string;
    textoCancelar?: string;
    procesando?: boolean;
  }>(),
  {
    mensaje: '',
    textoConfirmar: 'Confirmar',
    textoCancelar: 'Cancelar',
    procesando: false,
  },
);

defineEmits<{ confirmar: []; cancelar: [] }>();
</script>

<template>
  <!-- Sombra tenue con tinte deep-onyx, sin sombra atmosférica difusa
       (DESIGN.md > Elevation). Por encima de los toasts, que van en z-50. -->
  <div
    class="fixed inset-0 bg-deep-onyx/40 flex items-center justify-center p-margin-mobile z-[60]"
    @click.self="$emit('cancelar')"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      :aria-label="titulo"
      class="bg-surface-container-lowest rounded-primary p-gutter-lg max-w-sm w-full flex flex-col gap-gutter-sm"
      style="box-shadow: var(--shadow-modal)"
    >
      <h2 class="font-headline-sm text-headline-sm text-on-surface">{{ titulo }}</h2>
      <p class="font-body-lg text-body-lg text-secondary">
        <!-- El slot permite resaltar partes del mensaje (ej. el nombre del
             usuario afectado); si no se usa, cae al texto de `mensaje`. -->
        <slot>{{ mensaje }}</slot>
      </p>
      <div class="flex items-center justify-end gap-gutter-sm pt-2">
        <button
          type="button"
          class="h-touch-target px-gutter-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm rounded-primary border border-on-surface hover:bg-surface-container transition-colors"
          @click="$emit('cancelar')"
        >
          {{ textoCancelar }}
        </button>
        <button
          type="button"
          :disabled="procesando"
          class="h-touch-target px-gutter-lg bg-primary-container text-pure-white font-label-sm text-label-sm rounded-primary hover:bg-primary active:bg-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          @click="$emit('confirmar')"
        >
          {{ procesando ? 'Procesando...' : textoConfirmar }}
        </button>
      </div>
    </div>
  </div>
</template>
