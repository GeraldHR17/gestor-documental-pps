// src/salud/salud.controller.ts
//
// GET /salud — público, sin autenticación. Lo consume
// despliegue/verificar-despliegue.ps1 por dos caminos: directo contra
// 127.0.0.1:PUERTO (¿está vivo el servicio?) y a través de la ruta
// pública de Apache (¿está bien cableado el proxy?).
//
// Va sin prefijo porque el backend no define prefijo global: la ruta
// pública /munipalmares/wp-munidata/api la recorta Apache antes de
// reenviar, así que aquí se ve como /salud.

import { Controller, Get } from '@nestjs/common';

import { Publico } from '../comun/decoradores/publico.decorator';
import { SaludService, type EstadoSalud } from './salud.service';

@Controller('salud')
export class SaludController {
  constructor(private readonly saludService: SaludService) {}

  // @Publico() excluye la ruta del JwtAuthGuard global. PermisosGuard no
  // necesita nada: al no declarar @RequierePermisos() deja pasar.
  @Publico()
  @Get()
  verificar(): Promise<EstadoSalud> {
    return this.saludService.verificar();
  }
}
