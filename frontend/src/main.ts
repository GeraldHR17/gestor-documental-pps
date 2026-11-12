import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './assets/main.css'

const BANNER_CONSOLA = [
  ' __  __             _   ____        _        ',
  '|  \\/  |_   _ _ __ (_) |  _ \\  __ _| |_ __ _ ',
  "| |\\/| | | | | '_ \\| | | | | |/ _` | __/ _` |",
  '| |  | | |_| | | | | | | |_| | (_| | || (_| |',
  '|_|  |_|\\__,_|_| |_|_| |____/ \\__,_|\\__\\__,_|',
  '',
  'Municipalidad de Palmares',
  'Desarrollado por Gerald Huertas Rodríguez — UNA, PPS 2026',
].join('\n')

console.info(
  `%c${BANNER_CONSOLA}`,
  'color: #D30505; font-family: monospace; font-weight: 700; line-height: 1.2;',
)

createApp(App).use(router).mount('#app')
