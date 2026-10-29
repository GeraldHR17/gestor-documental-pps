// src/reportes/reportes.service.spec.ts
//
// Se prueban las decisiones del servicio (qué se cuenta, qué se excluye,
// cómo se agrupa), no el SQL: los repositorios son dobles y el query
// builder se simula devolviendo lo que habría traído la base.

import { ReportesService, ETIQUETA_SIN_DEPENDENCIA } from './reportes.service';

/**
 * Doble del query builder. getCount() consume de una cola —el servicio
 * hace dos conteos distintos en obtenerResumen()— y getRawMany() devuelve
 * las filas del GROUP BY. Ambas colas son independientes, así que cada prueba
 * puede llamar sólo al método que le interesa sin desincronizar la otra.
 */
function constructorConsulta(conteos: number[], filas: unknown[]) {
  const consulta: Record<string, jest.Mock> = {};
  for (const metodo of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) {
    consulta[metodo] = jest.fn().mockReturnValue(consulta);
  }
  consulta.getCount = jest.fn().mockImplementation(() => Promise.resolve(conteos.shift() ?? 0));
  consulta.getRawMany = jest.fn().mockResolvedValue(filas);
  return consulta;
}

function montar(
  opciones: {
    total?: number;
    esteMes?: number;
    publicados?: number;
    pendientes?: number;
    rezagados?: number;
    operaciones?: number;
    categorias?: Array<Record<string, unknown>>;
    filasCategoria?: Array<{ idCategoria: number; cantidad: string }>;
    dependencias?: Array<Record<string, unknown>>;
    filasDependencia?: Array<{ idDependencia: number | null; cantidad: string }>;
  } = {},
) {
  // Orden de los conteos en obtenerResumen: documentos del mes, luego
  // borradores rezagados.
  const consultaDocumentos = constructorConsulta(
    [opciones.esteMes ?? 0, opciones.rezagados ?? 0],
    opciones.filasCategoria ?? opciones.filasDependencia ?? [],
  );

  const repositorioDocumentos = {
    count: jest.fn().mockImplementation((criterio?: { where?: { estado?: string } }) => {
      if (criterio?.where?.estado === 'PUBLICADO') return Promise.resolve(opciones.publicados ?? 0);
      if (criterio?.where?.estado === 'BORRADOR') return Promise.resolve(opciones.pendientes ?? 0);
      return Promise.resolve(opciones.total ?? 0);
    }),
    createQueryBuilder: jest.fn().mockReturnValue(consultaDocumentos),
  };
  const repositorioCategorias = { find: jest.fn().mockResolvedValue(opciones.categorias ?? []) };
  const repositorioDependencias = { find: jest.fn().mockResolvedValue(opciones.dependencias ?? []) };
  const repositorioBitacora = {
    createQueryBuilder: jest.fn().mockReturnValue(constructorConsulta([opciones.operaciones ?? 0], [])),
  };

  const servicio = new ReportesService(
    repositorioDocumentos as never,
    repositorioCategorias as never,
    repositorioDependencias as never,
    repositorioBitacora as never,
  );
  return { servicio, repositorioDocumentos };
}

describe('ReportesService.obtenerResumen', () => {
  it('calcula el porcentaje de publicados sobre el total histórico', async () => {
    const { servicio } = montar({ total: 310, publicados: 246, pendientes: 12, esteMes: 18, rezagados: 4, operaciones: 5894 });

    const resumen = await servicio.obtenerResumen();

    expect(resumen).toMatchObject({
      documentosRegistrados: 310,
      documentosEsteMes: 18,
      publicados: 246,
      porcentajePublicados: 79,
      pendientes: 12,
      pendientesMasDe15Dias: 4,
      operacionesBitacora90Dias: 5894,
    });
  });

  // Sin documentos la división no está definida; la tarjeta debe poder
  // pintar un 0 en vez de NaN.
  it('informa 0 % cuando todavía no hay documentos', async () => {
    const { servicio } = montar({ total: 0, publicados: 0 });

    await expect(servicio.obtenerResumen()).resolves.toMatchObject({ porcentajePublicados: 0 });
  });

  it('cuenta el total sin filtrar por estado: los documentos nunca se borran', async () => {
    const { servicio, repositorioDocumentos } = montar({ total: 7 });

    await servicio.obtenerResumen();

    expect(repositorioDocumentos.count).toHaveBeenCalledWith();
  });
});

const CATEGORIAS = [
  { idCategoriaItsp: 1, codigo: 'ITSP-01', nombre: 'Información institucional', nivel: 1, orden: 1, idCategoriaPadre: null },
  { idCategoriaItsp: 2, codigo: 'ITSP-02', nombre: 'Rendición de cuentas', nivel: 1, orden: 2, idCategoriaPadre: null },
  { idCategoriaItsp: 3, codigo: 'ITSP-03', nombre: 'Participación ciudadana', nivel: 1, orden: 3, idCategoriaPadre: null },
  { idCategoriaItsp: 4, codigo: 'ITSP-04', nombre: 'Datos abiertos de gobierno', nivel: 1, orden: 4, idCategoriaPadre: null },
  { idCategoriaItsp: 12, codigo: 'ITSP-02-01', nombre: 'Planes institucionales', nivel: 2, orden: 1, idCategoriaPadre: 2 },
  { idCategoriaItsp: 13, codigo: 'ITSP-02-02', nombre: 'Informes institucionales', nivel: 2, orden: 2, idCategoriaPadre: 2 },
];

describe('ReportesService.obtenerPorCategoria', () => {
  it('excluye "Participación ciudadana" y devuelve sólo las 3 raíces clasificables', async () => {
    const { servicio } = montar({ categorias: CATEGORIAS });

    const desglose = await servicio.obtenerPorCategoria();

    expect(desglose.map((fila) => fila.nombre)).toEqual([
      'Información institucional',
      'Rendición de cuentas',
      'Datos abiertos de gobierno',
    ]);
  });

  // Los documentos se clasifican en subsecciones; el desglose es por raíz.
  it('suma las subsecciones dentro de su categoría raíz', async () => {
    const { servicio } = montar({
      categorias: CATEGORIAS,
      filasCategoria: [
        { idCategoria: 12, cantidad: '5' },
        { idCategoria: 13, cantidad: '3' },
        { idCategoria: 1, cantidad: '2' },
      ],
    });

    const desglose = await servicio.obtenerPorCategoria();

    expect(desglose).toEqual([
      { id: 1, nombre: 'Información institucional', cantidad: 2 },
      { id: 2, nombre: 'Rendición de cuentas', cantidad: 8 },
      { id: 4, nombre: 'Datos abiertos de gobierno', cantidad: 0 },
    ]);
  });

  // Con N niveles el padre directo ya no es la raíz (spec D-9).
  it('suma los documentos de un nieto en su raíz real, no en su padre', async () => {
    const { servicio } = montar({
      categorias: [
        ...CATEGORIAS,
        { idCategoriaItsp: 20, codigo: 'ITSP-02-01-01', nombre: '2026', nivel: 3, orden: 1, idCategoriaPadre: 12 },
      ],
      filasCategoria: [{ idCategoria: 20, cantidad: '4' }],
    });

    const desglose = await servicio.obtenerPorCategoria();

    expect(desglose.find((fila) => fila.id === 2)?.cantidad).toBe(4);
  });

  it('devuelve las raíces con 0 aunque no tengan documentos', async () => {
    const { servicio } = montar({ categorias: CATEGORIAS, filasCategoria: [] });

    const desglose = await servicio.obtenerPorCategoria();

    expect(desglose.every((fila) => fila.cantidad === 0)).toBe(true);
    expect(desglose).toHaveLength(3);
  });
});

describe('ReportesService.obtenerPorDependencia', () => {
  const DEPENDENCIAS = [
    { idDependencia: 1, nombre: 'Alcaldía Municipal', estado: 'ACTIVO' },
    { idDependencia: 2, nombre: 'Hacienda Municipal', estado: 'ACTIVO' },
  ];

  it('cuenta por dependencia e incluye las que no tienen documentos', async () => {
    const { servicio } = montar({
      dependencias: DEPENDENCIAS,
      filasDependencia: [{ idDependencia: 1, cantidad: '4' }],
    });

    const desglose = await servicio.obtenerPorDependencia();

    expect(desglose).toEqual([
      { id: 1, nombre: 'Alcaldía Municipal', cantidad: 4 },
      { id: 2, nombre: 'Hacienda Municipal', cantidad: 0 },
    ]);
  });

  // La dependencia nunca fue obligatoria (VP-03), así que los NULL son un
  // grupo legítimo y no un dato faltante que haya que esconder.
  it('agrega al final el grupo de documentos sin dependencia', async () => {
    const { servicio } = montar({
      dependencias: DEPENDENCIAS,
      filasDependencia: [
        { idDependencia: 1, cantidad: '4' },
        { idDependencia: null, cantidad: '6' },
      ],
    });

    const desglose = await servicio.obtenerPorDependencia();

    expect(desglose[desglose.length - 1]).toEqual({
      id: null,
      nombre: ETIQUETA_SIN_DEPENDENCIA,
      cantidad: 6,
    });
  });

  it('omite el grupo "sin dependencia" cuando no hay ninguno', async () => {
    const { servicio } = montar({
      dependencias: DEPENDENCIAS,
      filasDependencia: [{ idDependencia: 2, cantidad: '1' }],
    });

    const desglose = await servicio.obtenerPorDependencia();

    expect(desglose.some((fila) => fila.id === null)).toBe(false);
  });
});
