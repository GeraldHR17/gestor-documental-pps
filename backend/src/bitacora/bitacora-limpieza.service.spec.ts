// src/bitacora/bitacora-limpieza.service.spec.ts
//
// Retención de la bitácora a 3 meses. Lo que importa comprobar es el
// cálculo de la fecha de corte —ahí está el riesgo real de borrar de más o
// de menos— y que la purga quede asentada en la propia bitácora.

import {
  ACCION_PURGA,
  BitacoraLimpiezaService,
  MESES_RETENCION_POR_DEFECTO,
} from './bitacora-limpieza.service';

/**
 * El tipo del montaje se declara explícitamente: sin él, los `jest.fn()`
 * hacen que el retorno se infiera como `any` y desestructurarlo dispara
 * `no-unsafe-assignment` en cada prueba.
 */
interface Montaje {
  servicio: BitacoraLimpiezaService;
  repositorio: { delete: jest.Mock };
  bitacoraService: { registrar: jest.Mock };
}

function montar(opciones: { meses?: string; eliminados?: number } = {}): Montaje {
  const repositorio = {
    delete: jest.fn().mockResolvedValue({ affected: opciones.eliminados ?? 0 }),
  };
  const bitacoraService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const configuracion = {
    get: jest.fn().mockReturnValue(opciones.meses),
  };

  const servicio = new BitacoraLimpiezaService(
    repositorio as never,
    bitacoraService as never,
    configuracion as never,
  );

  return { servicio, repositorio, bitacoraService };
}

describe('BitacoraLimpiezaService.mesesRetencion', () => {
  it('sin configuración explícita retiene 3 meses', () => {
    const { servicio } = montar();

    expect(MESES_RETENCION_POR_DEFECTO).toBe(3);
    expect(servicio.mesesRetencion).toBe(3);
  });

  it('un valor inválido en .env no desactiva la retención: cae al valor por defecto', () => {
    const { servicio } = montar({ meses: 'tres' });

    expect(servicio.mesesRetencion).toBe(3);
  });

  it('respeta el valor configurado cuando es un número válido', () => {
    const { servicio } = montar({ meses: '6' });

    expect(servicio.mesesRetencion).toBe(6);
  });
});

describe('BitacoraLimpiezaService.calcularFechaCorte', () => {
  it('resta exactamente 3 meses a la fecha de referencia', () => {
    const { servicio } = montar();

    const corte = servicio.calcularFechaCorte(new Date(2026, 9, 3, 12, 0, 0));

    // 3 de octubre de 2026 menos 3 meses = 3 de julio de 2026.
    expect(corte.getFullYear()).toBe(2026);
    expect(corte.getMonth()).toBe(6);
    expect(corte.getDate()).toBe(3);
  });

  it('no desborda al mes siguiente cuando el día no existe en el mes destino', () => {
    const { servicio } = montar();

    // 31 de mayo menos 3 meses sería «31 de febrero»: con un setMonth
    // ingenuo JavaScript lo convertiría en marzo y la ventana quedaría
    // más corta de lo acordado. Debe recortarse al 28 de febrero.
    const corte = servicio.calcularFechaCorte(new Date(2026, 4, 31, 8, 0, 0));

    expect(corte.getMonth()).toBe(1);
    expect(corte.getDate()).toBe(28);
  });

  it('cruza el cambio de año hacia atrás', () => {
    const { servicio } = montar();

    const corte = servicio.calcularFechaCorte(new Date(2026, 1, 15, 0, 0, 0));

    expect(corte.getFullYear()).toBe(2025);
    expect(corte.getMonth()).toBe(10);
    expect(corte.getDate()).toBe(15);
  });
});

describe('BitacoraLimpiezaService.eliminarRegistrosAntiguos', () => {
  it('borra lo anterior a la fecha de corte y devuelve cuántos registros eliminó', async () => {
    const { servicio, repositorio } = montar({ eliminados: 42 });

    const eliminados = await servicio.eliminarRegistrosAntiguos();

    expect(eliminados).toBe(42);
    // LessThan(fechaCorte) se traduce a 'fecha_hora < ?' sobre el indice
    // idx_bitacora_fecha; aqui solo interesa que el criterio sea la fecha.
    expect(repositorio.delete).toHaveBeenCalledWith({
      fechaHora: expect.objectContaining({ value: expect.any(Date) }),
    });
  });

  it('asienta la purga en la bitácora, dejando constancia de que no hubo respaldo', async () => {
    const { servicio, bitacoraService } = montar({ eliminados: 7 });

    await servicio.eliminarRegistrosAntiguos();

    expect(bitacoraService.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        idUsuario: null,
        accion: ACCION_PURGA,
        entidad: 'bitacora_logs',
        resultado: 'EXITO',
        detalles: expect.objectContaining({
          mesesRetencion: 3,
          registrosEliminados: 7,
          respaldoPrevio: false,
        }),
      }),
    );
  });

  it('deja constancia aunque no haya borrado nada: la auditoría necesita saber que corrió', async () => {
    const { servicio, bitacoraService } = montar({ eliminados: 0 });

    await servicio.eliminarRegistrosAntiguos();

    expect(bitacoraService.registrar).toHaveBeenCalledTimes(1);
  });

  it('con BITACORA_RETENCION_MESES=0 no borra nada ni registra nada', async () => {
    const { servicio, repositorio, bitacoraService } = montar({ meses: '0' });

    const eliminados = await servicio.eliminarRegistrosAntiguos();

    expect(eliminados).toBe(0);
    expect(repositorio.delete).not.toHaveBeenCalled();
    expect(bitacoraService.registrar).not.toHaveBeenCalled();
  });
});
