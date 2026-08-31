// src/lib/http.ts
//
// Cliente HTTP centralizado. Implementa RF-17 (renovación automática del
// access token ante un 401 por expiración) y RF-16 (si la renovación también
// falla, se limpia la sesión y se redirige al login).
//
// `withCredentials: true` es obligatorio: es lo que permite que la cookie
// httpOnly con el refresh token viaje en cada petición (ver spec.md, Sección 7).

import axios, { type AxiosRequestConfig } from 'axios';
import { obtenerAccessToken, establecerAccessToken, limpiarAccessToken } from './tokenStore';

interface PeticionConReintento extends AxiosRequestConfig {
  _reintentado?: boolean;
}

const clienteHttp = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
});

clienteHttp.interceptors.request.use((config) => {
  const token = obtenerAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let promesaRenovacionEnCurso: Promise<string> | null = null;

// Únicamente estas dos rutas quedan fuera del reintento automático:
// - /auth/refresh: reintentarla con ella misma sería un bucle infinito.
// - /auth/login: un 401 aquí son credenciales incorrectas, no un token
//   vencido; renovar no tendría ningún sentido.
// El resto de /auth/* (perfil, logout...) sí son rutas protegidas normales
// y deben poder renovar su token como cualquier otra.
const RUTAS_SIN_RENOVACION_AUTOMATICA = ['/auth/refresh', '/auth/login'];

clienteHttp.interceptors.response.use(
  (respuesta) => respuesta,
  async (error) => {
    const peticionOriginal = error.config as PeticionConReintento | undefined;
    const urlPeticion = peticionOriginal?.url ?? '';
    const esRutaSinRenovacion = RUTAS_SIN_RENOVACION_AUTOMATICA.some((ruta) =>
      urlPeticion.startsWith(ruta),
    );
    const esErrorDeExpiracion =
      error.response?.status === 401 && !peticionOriginal?._reintentado && !esRutaSinRenovacion;

    if (!esErrorDeExpiracion || !peticionOriginal) {
      return Promise.reject(error);
    }

    peticionOriginal._reintentado = true;

    try {
      if (!promesaRenovacionEnCurso) {
        promesaRenovacionEnCurso = clienteHttp
          .post('/auth/refresh')
          .then(({ data }) => {
            establecerAccessToken(data.accessToken);
            return data.accessToken as string;
          })
          .finally(() => {
            promesaRenovacionEnCurso = null;
          });
      }

      const nuevoAccessToken = await promesaRenovacionEnCurso;
      peticionOriginal.headers = {
        ...peticionOriginal.headers,
        Authorization: `Bearer ${nuevoAccessToken}`,
      };
      return clienteHttp(peticionOriginal);
    } catch (errorRenovacion) {
      limpiarAccessToken();
      window.location.href = '/login';
      return Promise.reject(errorRenovacion);
    }
  },
);

export default clienteHttp;