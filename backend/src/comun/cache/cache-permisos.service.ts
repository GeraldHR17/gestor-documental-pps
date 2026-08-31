// src/comun/cache/cache-permisos.service.ts
//
// Cache en memoria de proceso del mapeo rol -> permisos efectivos
// (spec.md, RNF-05 / Seccion 13). Se invalida explicitamente cuando el
// Superadministrador modifica roles_permisos (ver RolesService).

import { Injectable } from '@nestjs/common';

@Injectable()
export class CachePermisosService {
  private readonly cache = new Map<number, string[]>();

  obtener(idRol: number): string[] | undefined {
    return this.cache.get(idRol);
  }

  establecer(idRol: number, permisos: string[]): void {
    this.cache.set(idRol, permisos);
  }

  invalidar(idRol: number): void {
    this.cache.delete(idRol);
  }

  invalidarTodo(): void {
    this.cache.clear();
  }
}