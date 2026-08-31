// src/lib/tokenStore.ts
//
// Fuente única de verdad del access token vigente en el cliente.
// Deliberadamente NO es reactivo ni depende de Vue: lo consume tanto el
// interceptor de Axios (fuera del ciclo de componentes) como el composable
// `useAutenticacion` (que sí expone estado reactivo hacia la UI).
//
// El access token vive SOLO en memoria de JavaScript (esta variable de
// módulo) y nunca se persiste en localStorage/sessionStorage, para reducir
// la superficie de ataque XSS (ver spec.md, Sección 12).

let accessTokenActual: string | null = null;

export function obtenerAccessToken(): string | null {
  return accessTokenActual;
}

export function establecerAccessToken(token: string | null): void {
  accessTokenActual = token;
}

export function limpiarAccessToken(): void {
  accessTokenActual = null;
}