// src/bitacora/bitacora.service.ts
//
// Implementacion real — ver nota en bitacora-log.entity.ts. NUNCA se
// registran contrasenas ni tokens en texto plano dentro de `detalles`
// (spec.md, Seccion 12).

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';
import { FiltrosBitacoraDto } from './dto/filtros-bitacora.dto';
import {
  EntradaBitacoraRespuestaDto,
  ListaPaginadaBitacoraRespuestaDto,
} from './dto/entrada-bitacora-respuesta.dto';

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

  /**
   * Consulta paginada, de la más reciente a la más antigua. El filtro por
   * entidad + idRegistro es el que usa el panel "Cambios recientes" del
   * formulario de usuario; el resto alimenta la pantalla de bitácora.
   */
  async consultar(filtros: FiltrosBitacoraDto): Promise<ListaPaginadaBitacoraRespuestaDto> {
    const pagina = filtros.pagina ?? 1;
    const limite = filtros.limite ?? 20;

    const consulta = this.repositorioBitacora
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.usuario', 'usuario')
      .orderBy('log.fechaHora', 'DESC')
      .addOrderBy('log.idLog', 'DESC')
      .skip((pagina - 1) * limite)
      .take(limite);

    if (filtros.entidad) {
      consulta.andWhere('log.entidad = :entidad', { entidad: filtros.entidad });
    }

    if (filtros.idRegistro) {
      consulta.andWhere('log.idRegistro = :idRegistro', { idRegistro: filtros.idRegistro });
    }

    if (filtros.idUsuario) {
      consulta.andWhere('log.idUsuario = :idUsuario', { idUsuario: filtros.idUsuario });
    }

    if (filtros.accion) {
      consulta.andWhere('log.accion LIKE :accion', { accion: `%${filtros.accion}%` });
    }

    const [entradas, total] = await consulta.getManyAndCount();

    return new ListaPaginadaBitacoraRespuestaDto({
      datos: entradas.map(
        (entrada) =>
          new EntradaBitacoraRespuestaDto({
            id: String(entrada.idLog),
            accion: entrada.accion,
            entidad: entrada.entidad,
            idRegistro: entrada.idRegistro != null ? String(entrada.idRegistro) : null,
            fechaHora: entrada.fechaHora,
            resultado: entrada.resultado,
            ipOrigen: entrada.ipOrigen,
            detalles: entrada.detalles,
            idUsuario: entrada.idUsuario,
            nombreUsuario: entrada.usuario?.nombreCompleto ?? null,
          }),
      ),
      total,
      pagina,
      limite,
    });
  }
}
