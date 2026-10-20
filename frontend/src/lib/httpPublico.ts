// src/lib/httpPublico.ts
//
// Cliente HTTP del portal público. Instancia de axios APARTE de la de
// `http.ts`, y a propósito.
//
// Por qué no una bandera en el cliente existente: su interceptor de
// respuesta, ante un 401 que no puede renovar, hace
// `window.location.href = rutaConBase('login?...')`. Dentro del iframe de
// WordPress eso sacaría al ciudadano del portal sin explicación y lo
// dejaría mirando un formulario de inicio de sesión que no le incumbe. Un
// cliente sin interceptores no puede hacer eso POR CONSTRUCCIÓN, que es
// más fiable que acordarse de pasar la bandera en cada llamada.
//
// Este archivo —y todo el portal— no importa `useAutenticacion`,
// `tokenStore` ni `http.ts`. No es una recomendación: es la propiedad que
// hace que el portal no pueda tocar la sesión ni por descuido.

import axios from 'axios';

/**
 * Misma URL base que el cliente autenticado y por el mismo motivo: en
 * producción es una ruta RELATIVA (`/munipalmares/wp-munidata/api`), de
 * modo que no hay dominio ni IP escritos en el código y el sistema sigue
 * funcionando si cambia el host o el certificado.
 *
 * Se acepta `VITE_URL_API` y `VITE_API_URL` porque los dos nombres están
 * en uso en el proyecto; mantener ambos evita que un `.env` escrito con
 * cualquiera de los dos deje el portal apuntando a localhost en la VM.
 */
export const URL_BASE_API_PUBLICA =
  import.meta.env.VITE_URL_API?.trim() ||
  import.meta.env.VITE_API_URL?.trim() ||
  'http://localhost:3000';

const clienteHttpPublico = axios.create({
  baseURL: URL_BASE_API_PUBLICA,

  // No añade credenciales a las peticiones de otro origen. OJO: esto NO
  // impide que viajen cookies en una petición del MISMO origen, que es el
  // caso aquí. Lo que mantiene la cookie de sesión fuera del portal es su
  // `Path`: `refreshToken` se emite con `path: '/auth'`, que bajo el proxy
  // queda en `/munipalmares/wp-munidata/api/auth`, y estas rutas cuelgan
  // de `/api/publico`. Se deja en false porque documenta la intención y no
  // cuesta nada. (spec 9.3)
  withCredentials: false,
});

// Sin interceptores, ni de petición ni de respuesta: sin Authorization,
// sin renovación de token y sin redirección al login. Los errores llegan
// crudos al composable, que decide qué mensaje mostrar.

export default clienteHttpPublico;
