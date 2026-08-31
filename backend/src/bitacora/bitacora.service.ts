// src/bitacora/bitacora.service.ts
//
// Implementacion real — ver nota en bitacora-log.entity.ts. NUNCA se
// registran contrasenas ni tokens en texto plano dentro de `detalles`
// (spec.md, Seccion 12).

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';

interface DatosRegistroBitacora {
  idUsuario: number | null;
  accion: string;
  entidad: string;
  idRegistro?: number | null;
  resultado?: 'EXITO' | 'FALLIDO';
  ipOrigen?: string | null;
  detalles?: Record<string, unknown>;
}

@Injectable()
export class BitacoraService {
  constructor(
    @InjectRepository(BitacoraLog)
    private readonly repositorioBitacora: Repository<BitacoraLog>,
  ) {}

  async registrar(datos: DatosRegistroBitacora): Promise<void> {
    const registro = this.repositorioBitacora.create({
      idUsuario: datos.idUsuario,
      accion: datos.accion,
      entidad: datos.entidad,
      // `id_registro` es BIGINT en el esquema, y TypeORM mapea BIGINT a
      // string para no perder precisión; por eso se convierte aquí.
      idRegistro: datos.idRegistro != null ? String(datos.idRegistro) : null,
      resultado: datos.resultado ?? null,
      ipOrigen: datos.ipOrigen ?? null,
      detalles: datos.detalles ?? null,
    });

    await this.repositorioBitacora.save(registro);
  }
}