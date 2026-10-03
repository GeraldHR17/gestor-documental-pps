// src/bitacora/bitacora-limpieza.service.ts
//
// Retención de la bitácora de auditoría: los registros con más de 3 meses
// de antigüedad se eliminan en una tarea mensual. Hasta ahora la tabla
// `bitacora_logs` crecía sin límite (ver nota en bitacora.controller.ts,
// «sin exportación ni purga en este MVP»), lo que a mediano plazo degrada
// la consulta paginada y el respaldo de la base.
//
// ADVERTENCIA — el borrado es FÍSICO (DELETE) y no hay respaldo previo.
// Es deliberado que no lo haya: exportar la bitácora antes de purgarla es
// una decisión del equipo, no de este código, porque un log de auditoría
// suele tener que conservarse más allá de la ventana de consulta en línea
// (ISO 27001 A.12.4, lineamientos de la CGR). Si se decide conservarlo,
// lo que corresponde es exportar el tramo a purgar antes del DELETE, y
// eso está pendiente de confirmación.
//
// Nótese que esto NO contradice la política de «sin borrado físico» de la
// tabla `documentos`: ahí el retiro es lógico (estado INACTIVO) porque el
// documento es el objeto de negocio. La bitácora es un registro operativo
// con ventana de retención, que es una regla distinta.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { BitacoraLog } from '../entidades/bitacora-log.entidad';
import { BitacoraService } from './bitacora.service';

/** Ventana de retención acordada. Se puede ajustar por `.env` sin tocar código. */
export const MESES_RETENCION_POR_DEFECTO = 3;

/**
 * Día 1 de cada mes a las 03:00. Mensual es suficiente para una ventana de
 * tres meses, y la madrugada evita competir con el uso normal del sistema
 * y con el respaldo nocturno de la base de datos.
 */
export const EXPRESION_CRON_LIMPIEZA = '0 3 1 * *';

/** Acción con la que la purga queda asentada; sigue el patrón VERBO_ENTIDAD del resto. */
export const ACCION_PURGA = 'PURGAR_BITACORA';

@Injectable()
export class BitacoraLimpiezaService {
  private readonly logger = new Logger(BitacoraLimpiezaService.name);

  constructor(
    @InjectRepository(BitacoraLog)
    private readonly repositorioBitacora: Repository<BitacoraLog>,
    private readonly bitacoraService: BitacoraService,
    private readonly configuracion: ConfigService,
  ) {}

  /** Meses de retención vigentes; 0 o negativo deshabilita la purga. */
  get mesesRetencion(): number {
    const configurado = Number(this.configuracion.get<string>('BITACORA_RETENCION_MESES'));
    return Number.isFinite(configurado) && configurado >= 0
      ? configurado
      : MESES_RETENCION_POR_DEFECTO;
  }

  /**
   * Fecha a partir de la cual se conservan los registros: todo lo anterior
   * se elimina. Se expone (en vez de quedar dentro del método de borrado)
   * para poder comprobar el cálculo de fechas en las pruebas sin tocar la
   * base de datos.
   */
  calcularFechaCorte(referencia: Date = new Date()): Date {
    const corte = new Date(referencia.getTime());
    const diaOriginal = corte.getDate();

    // `setMonth` desborda al mes siguiente cuando el día no existe en el
    // mes destino (31 de mayo menos 3 meses daría «31 de febrero», que
    // JavaScript convierte en 2 o 3 de marzo). Se fija el día 1 antes de
    // restar y luego se recorta al último día real del mes destino, para
    // que la ventana nunca termine siendo más corta de lo acordado.
    corte.setDate(1);
    corte.setMonth(corte.getMonth() - this.mesesRetencion);

    const ultimoDiaDelMes = new Date(corte.getFullYear(), corte.getMonth() + 1, 0).getDate();
    corte.setDate(Math.min(diaOriginal, ultimoDiaDelMes));

    return corte;
  }

  /**
   * Elimina los registros anteriores a la fecha de corte y devuelve cuántos
   * se borraron. Es público e idempotente a propósito: además de la tarea
   * programada, permite ejecutar la purga a demanda desde una prueba o una
   * rutina de mantenimiento.
   */
  @Cron(EXPRESION_CRON_LIMPIEZA, { name: 'limpieza-bitacora' })
  async eliminarRegistrosAntiguos(): Promise<number> {
    const meses = this.mesesRetencion;

    if (meses <= 0) {
      this.logger.warn(
        'Purga de bitácora deshabilitada (BITACORA_RETENCION_MESES=0): la tabla crecerá sin límite.',
      );
      return 0;
    }

    const fechaCorte = this.calcularFechaCorte();

    // DELETE directo en vez de cargar las entidades: el volumen puede ser
    // grande y no hace falta ninguna entidad en memoria. El índice
    // idx_bitacora_fecha (01-esquema.sql) cubre este filtro.
    const resultado = await this.repositorioBitacora.delete({
      fechaHora: LessThan(fechaCorte),
    });

    const eliminados = resultado.affected ?? 0;

    this.logger.log(
      `Purga de bitácora: ${eliminados} registro(s) anteriores a ` +
        `${fechaCorte.toISOString()} eliminados (retención de ${meses} mes(es)).`,
    );

    // La purga se asienta en la propia bitácora, incluso cuando no borró
    // nada: sin esta entrada no quedaría evidencia de que el mecanismo de
    // retención se ejecutó, que es justo lo que pide una auditoría. Son
    // doce registros al año, así que el costo es irrelevante.
    await this.bitacoraService.registrar({
      idUsuario: null,
      accion: ACCION_PURGA,
      entidad: 'bitacora_logs',
      resultado: 'EXITO',
      detalles: {
        mesesRetencion: meses,
        fechaCorte: fechaCorte.toISOString(),
        registrosEliminados: eliminados,
        // Se deja explícito en el detalle porque es la decisión pendiente
        // descrita en la cabecera de este archivo.
        respaldoPrevio: false,
      },
    });

    return eliminados;
  }
}
