// src/comun/decoradores/publico.decorator.ts
//
// Marca una ruta como publica, excluyendola de la verificacion del
// JwtAuthGuard global (RF-04). Uso: @Publico() sobre el metodo del
// controlador (login, registro, verificacion, recuperacion, refresh).

import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'esPublico';

export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);