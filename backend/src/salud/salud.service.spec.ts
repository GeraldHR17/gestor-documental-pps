// src/salud/salud.service.spec.ts
//
// La comprobación de salud se usa como criterio de «el despliegue quedó
// bien», así que lo importante es que no mienta: si la base no responde,
// no puede devolver ok, y el motivo no puede filtrarse al cliente.

import { ServiceUnavailableException } from '@nestjs/common';

import { SaludService } from './salud.service';

interface Montaje {
  servicio: SaludService;
  fuenteDatos: { query: jest.Mock };
}

function montar(opciones: { falla?: Error } = {}): Montaje {
  const fuenteDatos = {
    query: opciones.falla
      ? jest.fn().mockRejectedValue(opciones.falla)
      : jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  return { servicio: new SaludService(fuenteDatos as never), fuenteDatos };
}

describe('SaludService.verificar', () => {
  it('con la base de datos respondiendo devuelve ok', async () => {
    const { servicio, fuenteDatos } = montar();

    await expect(servicio.verificar()).resolves.toEqual({ estado: 'ok', baseDatos: 'ok' });
    // Un SELECT 1, sin tocar ninguna tabla: la comprobación no debe
    // depender del estado del esquema.
    expect(fuenteDatos.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('si la base de datos no responde, falla con 503 en vez de devolver ok', async () => {
    const { servicio } = montar({ falla: new Error('ECONNREFUSED 127.0.0.1:3306') });

    await expect(servicio.verificar()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('el mensaje de error no filtra el detalle de la conexion', async () => {
    const detalleInterno = "Access denied for user 'munidata_app'@'localhost'";
    const { servicio } = montar({ falla: new Error(detalleInterno) });

    await expect(servicio.verificar()).rejects.toThrow('El servicio no está disponible');
    await expect(servicio.verificar()).rejects.not.toThrow(detalleInterno);
  });
});
