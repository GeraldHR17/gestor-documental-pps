// src/bitacora/bitacora.service.spec.ts
//
// Consulta de la bitácora (pulido de Fase 6, E.4). Se comprueba qué
// filtros se aplican al query builder y cómo se mapea cada entrada; la
// escritura (registrar) ya la cubren indirectamente las specs de cada
// módulo que la invoca.

import { BitacoraService } from './bitacora.service';

function montar(entradas: Array<Record<string, unknown>> = []) {
  const consulta = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([entradas, entradas.length]),
  };
  const repositorio = {
    createQueryBuilder: jest.fn().mockReturnValue(consulta),
    create: jest.fn(),
    save: jest.fn(),
  };
  const servicio = new BitacoraService(repositorio as never);
  return { servicio, consulta };
}

describe('BitacoraService.consultar', () => {
  it('sin filtros devuelve la página ordenada de la más reciente a la más antigua', async () => {
    const { servicio, consulta } = montar();

    const resultado = await servicio.consultar({});

    expect(consulta.orderBy).toHaveBeenCalledWith('log.fechaHora', 'DESC');
    expect(consulta.andWhere).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ total: 0, pagina: 1, limite: 20 });
  });

  it('filtra por entidad e idRegistro: es lo que usa "Cambios recientes" del usuario', async () => {
    const { servicio, consulta } = montar();

    await servicio.consultar({ entidad: 'usuarios', idRegistro: 7 });

    expect(consulta.andWhere).toHaveBeenCalledWith('log.entidad = :entidad', { entidad: 'usuarios' });
    expect(consulta.andWhere).toHaveBeenCalledWith('log.idRegistro = :idRegistro', { idRegistro: 7 });
  });

  it('pagina con skip/take a partir de pagina y limite', async () => {
    const { servicio, consulta } = montar();

    await servicio.consultar({ pagina: 3, limite: 5 });

    expect(consulta.skip).toHaveBeenCalledWith(10);
    expect(consulta.take).toHaveBeenCalledWith(5);
  });

  it('mapea cada entrada con el nombre de quien actuó y los BIGINT como texto', async () => {
    const { servicio } = montar([
      {
        idLog: '123',
        accion: 'ACTUALIZAR_USUARIO',
        entidad: 'usuarios',
        idRegistro: '7',
        fechaHora: new Date('2026-06-12T14:22:00Z'),
        resultado: 'EXITO',
        ipOrigen: null,
        detalles: { camposActualizados: ['idDependencia'] },
        idUsuario: 1,
        usuario: { nombreCompleto: 'Gerald Huertas' },
      },
    ]);

    const resultado = await servicio.consultar({});

    expect(resultado.datos[0]).toMatchObject({
      id: '123',
      accion: 'ACTUALIZAR_USUARIO',
      idRegistro: '7',
      nombreUsuario: 'Gerald Huertas',
      detalles: { camposActualizados: ['idDependencia'] },
    });
  });

  it('deja nombreUsuario en null cuando la cuenta ya no existe', async () => {
    const { servicio } = montar([
      { idLog: '1', accion: 'LOGIN_EXITOSO', entidad: 'usuarios', idRegistro: null, fechaHora: new Date(), resultado: 'EXITO', ipOrigen: null, detalles: null, idUsuario: null, usuario: null },
    ]);

    const resultado = await servicio.consultar({});

    expect(resultado.datos[0].nombreUsuario).toBeNull();
    expect(resultado.datos[0].idRegistro).toBeNull();
  });
});
