// src/reportes/reportes.service.ts
//
// Indicadores de gestión documental (MF-08, RF-055 a RF-058). Todo se
// resuelve con COUNT/GROUP BY sobre las tablas que ya existen: no hay
// entidad ni tabla nueva, y por eso tampoco hay nada que mantener
// sincronizado cuando cambia un documento.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Documento } from '../entidades/documento.entidad';
import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { Dependencia } from '../entidades/dependencia.entidad';
import { BitacoraLog } from '../entidades/bitacora-log.entidad';
import { CODIGO_CATEGORIA_RAIZ_EXCLUIDA } from '../comun/constantes/categorias-itsp';

import { ConteoPorGrupoDto, ResumenReportesDto } from './dto/reportes-respuesta.dto';

/** Antigüedad a partir de la cual un borrador se considera rezagado. */
const DIAS_PENDIENTE_REZAGADO = 15;
/** Ventana de la métrica de actividad en bitácora. */
const DIAS_VENTANA_BITACORA = 90;

export const ETIQUETA_SIN_DEPENDENCIA = 'Sin dependencia asignada';

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Documento)
    private readonly repositorioDocumentos: Repository<Documento>,
    @InjectRepository(CategoriaItsp)
    private readonly repositorioCategorias: Repository<CategoriaItsp>,
    @InjectRepository(Dependencia)
    private readonly repositorioDependencias: Repository<Dependencia>,
    @InjectRepository(BitacoraLog)
    private readonly repositorioBitacora: Repository<BitacoraLog>,
  ) {}

  async obtenerResumen(): Promise<ResumenReportesDto> {
    const inicioDeMes = new Date();
    inicioDeMes.setDate(1);
    inicioDeMes.setHours(0, 0, 0, 0);

    const [documentosRegistrados, documentosEsteMes, publicados, pendientes] = await Promise.all([
      // Sin filtro de estado: los documentos nunca se borran (RN-007), así
      // que el total histórico es el conteo completo de la tabla.
      this.repositorioDocumentos.count(),
      this.repositorioDocumentos
        .createQueryBuilder('documento')
        .where('documento.fechaCreacion >= :inicioDeMes', { inicioDeMes })
        .getCount(),
      this.repositorioDocumentos.count({ where: { estado: 'PUBLICADO' } }),
      this.repositorioDocumentos.count({ where: { estado: 'BORRADOR' } }),
    ]);

    const pendientesMasDe15Dias = await this.repositorioDocumentos
      .createQueryBuilder('documento')
      .where('documento.estado = :estado', { estado: 'BORRADOR' })
      .andWhere('documento.fechaCreacion < :limite', { limite: this.hace(DIAS_PENDIENTE_REZAGADO) })
      .getCount();

    const operacionesBitacora90Dias = await this.repositorioBitacora
      .createQueryBuilder('log')
      .where('log.fechaHora >= :desde', { desde: this.hace(DIAS_VENTANA_BITACORA) })
      .getCount();

    return new ResumenReportesDto({
      documentosRegistrados,
      documentosEsteMes,
      publicados,
      // Sin documentos el porcentaje no está definido; se informa 0 en vez
      // de NaN para que la tarjeta pueda pintarlo sin casos especiales.
      porcentajePublicados:
        documentosRegistrados === 0 ? 0 : Math.round((publicados / documentosRegistrados) * 100),
      pendientes,
      pendientesMasDe15Dias,
      operacionesBitacora90Dias,
    });
  }

  /**
   * Conteo por categoría raíz. Un documento se clasifica en una subsección,
   * así que se agrupa por la raíz a la que pertenece (o por sí misma si la
   * categoría ya es raíz).
   *
   * "Participación ciudadana" queda fuera: desde el pulido de Fase 6 no
   * clasifica documentos, de modo que su conteo sería siempre 0 y sólo
   * añadiría ruido al desglose. Se usa la misma constante que impone esa
   * exclusión en DocumentosService.
   */
  async obtenerPorCategoria(): Promise<ConteoPorGrupoDto[]> {
    const categorias = await this.repositorioCategorias.find();
    const porId = new Map(categorias.map((categoria) => [categoria.idCategoriaItsp, categoria]));

    const raices = categorias
      .filter((categoria) => categoria.idCategoriaPadre === null)
      .filter((categoria) => categoria.codigo !== CODIGO_CATEGORIA_RAIZ_EXCLUIDA)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

    const filas = await this.repositorioDocumentos
      .createQueryBuilder('documento')
      .select('documento.idCategoriaItsp', 'idCategoria')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('documento.idCategoriaItsp')
      .getRawMany<{ idCategoria: number; cantidad: string }>();

    const conteoPorRaiz = new Map<number, number>();
    for (const fila of filas) {
      const categoria = porId.get(Number(fila.idCategoria));
      if (!categoria) continue;
      const idRaiz = categoria.idCategoriaPadre ?? categoria.idCategoriaItsp;
      conteoPorRaiz.set(idRaiz, (conteoPorRaiz.get(idRaiz) ?? 0) + Number(fila.cantidad));
    }

    return raices.map(
      (raiz) =>
        new ConteoPorGrupoDto({
          id: raiz.idCategoriaItsp,
          nombre: raiz.nombre,
          cantidad: conteoPorRaiz.get(raiz.idCategoriaItsp) ?? 0,
        }),
    );
  }

  /**
   * Conteo por dependencia (RF-058). Se listan todas las dependencias
   * activas aunque no tengan documentos —un cero también informa— y se
   * agrega al final el grupo de los documentos sin dependencia, que es un
   * caso válido: la dependencia nunca fue obligatoria.
   */
  async obtenerPorDependencia(): Promise<ConteoPorGrupoDto[]> {
    const dependencias = await this.repositorioDependencias.find({
      where: { estado: 'ACTIVO' },
      order: { nombre: 'ASC' },
    });

    const filas = await this.repositorioDocumentos
      .createQueryBuilder('documento')
      .select('documento.idDependencia', 'idDependencia')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('documento.idDependencia')
      .getRawMany<{ idDependencia: number | null; cantidad: string }>();

    const conteo = new Map<number | null, number>();
    for (const fila of filas) {
      const clave = fila.idDependencia === null ? null : Number(fila.idDependencia);
      conteo.set(clave, Number(fila.cantidad));
    }

    const resultado = dependencias.map(
      (dependencia) =>
        new ConteoPorGrupoDto({
          id: dependencia.idDependencia,
          nombre: dependencia.nombre,
          cantidad: conteo.get(dependencia.idDependencia) ?? 0,
        }),
    );

    const sinDependencia = conteo.get(null) ?? 0;
    if (sinDependencia > 0) {
      resultado.push(
        new ConteoPorGrupoDto({
          id: null,
          nombre: ETIQUETA_SIN_DEPENDENCIA,
          cantidad: sinDependencia,
        }),
      );
    }

    return resultado;
  }

  /** Fecha de hace `dias` días, para las ventanas temporales. */
  private hace(dias: number): Date {
    return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  }
}
