// src/salud/salud.service.ts
//
// Comprobación de salud del servicio, pensada para la verificación del
// despliegue y para que Apache o una tarea programada puedan distinguir
// «el proceso está arriba» de «el proceso funciona».
//
// Deliberadamente no devuelve nada que sirva a un atacante: ni versión, ni
// nombre de host, ni datos de la base. El endpoint es público, así que
// cualquiera puede llamarlo.

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface EstadoSalud {
  estado: 'ok';
  baseDatos: 'ok';
}

@Injectable()
export class SaludService {
  private readonly logger = new Logger(SaludService.name);

  constructor(
    @InjectDataSource()
    private readonly fuenteDatos: DataSource,
  ) {}

  /**
   * Un `SELECT 1` basta: comprueba que el pool tiene conexión viva y que
   * MySQL responde, que es la única dependencia externa sin la cual el
   * sistema no puede atender nada. No se consulta ninguna tabla para que
   * la comprobación no dependa del estado del esquema.
   */
  async verificar(): Promise<EstadoSalud> {
    try {
      await this.fuenteDatos.query('SELECT 1');
    } catch (error) {
      // El detalle (host, usuario, driver) queda en el log del servidor;
      // al cliente solo se le dice que el servicio no está disponible.
      this.logger.error('La comprobación de salud no pudo consultar la base de datos', error as Error);
      throw new ServiceUnavailableException('El servicio no está disponible');
    }

    return { estado: 'ok', baseDatos: 'ok' };
  }
}
