// src/publico/portal-publico.service.ts
//
// Lógica del portal público de transparencia. Es la PRIMERA superficie del
// sistema abierta a Internet: hasta ahora, equivocarse en un filtro de
// visibilidad exponía un documento a una persona autenticada de la propia
// municipalidad; a partir de aquí lo expone a cualquiera.
//
// Tres cosas que este servicio NO hace, y que no son omisiones:
//
//   - No llama a BitacoraService. Las visitas públicas no se registran
//     (spec 11.5): hacerlo significaría guardar IP y hora de ciudadanos en
//     la tabla de auditoría del sistema, y además la purga trimestral la
//     dejaría inservible para lo que existe.
//   - No usa VersionesDocumentosService.obtenerArchivo, que registra la
//     descarga en bitácora y exige un PayloadJwt que aquí no hay. Abre el
//     archivo contra AlmacenamientoDocumentosService por su cuenta.
//   - No usa UsuarioActualService ni lee ninguna cookie.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReadStream } from 'node:fs';

import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { Documento } from '../entidades/documento.entidad';
import { VersionDocumento } from '../entidades/version-documento.entidad';

import { AlmacenamientoDocumentosService } from '../documentos/almacenamiento-documentos.service';

import {
  DocumentoPublicoNoDisponibleException,
  RecursoPublicoNoDisponibleException,
} from '../comun/excepciones/excepciones-portal-publico';

import { SeccionPublicaDto, SubseccionPublicaDto } from './dto/seccion-publica.dto';
import {
  DocumentoPublicoDto,
  ListaPaginadaDocumentosPublicosDto,
} from './dto/documento-publico.dto';
import {
  FiltrosListadoPublicoDto,
  LIMITE_POR_DEFECTO,
  PAGINA_POR_DEFECTO,
} from './dto/filtros-publicos.dto';

const ESTADO_PUBLICADO = 'PUBLICADO';
const ESTADO_CATEGORIA_ACTIVA = 'ACTIVO';

/** Lo que el controlador necesita para decidir entre 304 y 200 sin abrir el disco. */
export interface ArchivoPublicoResuelto {
  /** Título del documento, para construir el nombre de la descarga. */
  tituloDocumento: string;
  /** SHA-256 de la versión vigente. Es el valor del ETag. */
  hashArchivo: string;
  /** Respaldo para el nombre de la descarga si el título queda vacío al sanear. */
  nombreArchivoOriginal: string;
  tamanoBytes: number;
  mimeType: string;
  /** Ruta relativa dentro del almacenamiento. Nunca sale de la API. */
  rutaArchivo: string;
}

@Injectable()
export class PortalPublicoService {
  constructor(
    @InjectRepository(CategoriaItsp)
    private readonly repositorioCategorias: Repository<CategoriaItsp>,
    @InjectRepository(Documento)
    private readonly repositorioDocumentos: Repository<Documento>,
    @InjectRepository(VersionDocumento)
    private readonly repositorioVersiones: Repository<VersionDocumento>,
    private readonly almacenamiento: AlmacenamientoDocumentosService,
  ) {}

  // =====================================================================
  // Árbol de secciones
  // =====================================================================

  /**
   * Las cuatro raíces activas con sus subsecciones activas.
   *
   * "Participación ciudadana" (ITSP-03) SÍ aparece: la constante
   * CODIGO_CATEGORIA_RAIZ_EXCLUIDA impide ASIGNAR documentos a esa sección,
   * no mostrarla (spec 11.3). Aquí no se filtra por ella a propósito, y se
   * deja dicho para que no se "corrija" más adelante creyendo que es un
   * olvido. Que la sección no tenga recuadros en pantalla lo decide la vista.
   */
  async obtenerArbol(): Promise<SeccionPublicaDto[]> {
    const activas = await this.repositorioCategorias.find({
      where: { estado: ESTADO_CATEGORIA_ACTIVA },
    });

    const conteos = await this.contarDocumentosPublicadosPorCategoria();

    const raices = this.ordenar(activas.filter((categoria) => categoria.idCategoriaPadre === null));

    return raices.map((raiz) => this.armarSeccion(raiz, activas, conteos));
  }

  /** Una sección concreta, resuelta por su código. */
  async obtenerSeccion(codigoSeccion: string): Promise<SeccionPublicaDto> {
    const raiz = await this.buscarSeccionActiva(codigoSeccion);

    const activas = await this.repositorioCategorias.find({
      where: { estado: ESTADO_CATEGORIA_ACTIVA },
    });
    const conteos = await this.contarDocumentosPublicadosPorCategoria();

    return this.armarSeccion(raiz, activas, conteos);
  }

  // =====================================================================
  // Listados de documentos
  // =====================================================================

  /**
   * Documentos colgados DIRECTAMENTE de una raíz, no de sus subsecciones.
   *
   * No es un endpoint hipotético: el modelo permite esa clasificación.
   * `DocumentosService.verificarClasificacion` comprueba que la categoría
   * exista, esté activa y no sea la excluida, pero NO exige que sea una
   * subsección; y en el frontend `idCategoriaEfectiva` cae a la raíz cuando
   * esa raíz no tiene subsecciones. Hoy las cuatro tienen, así que el
   * formulario siempre pide una, pero por la API se puede clasificar en la
   * raíz. Sin este endpoint, esos documentos se contarían en el árbol y no
   * habría manera de abrirlos.
   */
  async listarDocumentosDeSeccion(
    codigoSeccion: string,
    filtros: FiltrosListadoPublicoDto,
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    const raiz = await this.buscarSeccionActiva(codigoSeccion);
    return this.listarDocumentosDeCategoria(raiz.idCategoriaItsp, filtros);
  }

  /**
   * Documentos de una subsección.
   *
   * La jerarquía se valida, no se ignora: pedir `itsp-02/itsp-01-01` da 404
   * aunque las dos categorías existan y estén activas. Si no se comprobara,
   * cualquier combinación de códigos abriría cualquier subsección, y la ruta
   * dejaría de significar lo que dice.
   */
  async listarDocumentosDeSubseccion(
    codigoSeccion: string,
    codigoSubseccion: string,
    filtros: FiltrosListadoPublicoDto,
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    const raiz = await this.buscarSeccionActiva(codigoSeccion);

    const subseccion = await this.repositorioCategorias.findOne({
      where: { codigo: codigoSubseccion, estado: ESTADO_CATEGORIA_ACTIVA },
    });

    if (!subseccion || subseccion.idCategoriaPadre !== raiz.idCategoriaItsp) {
      throw new RecursoPublicoNoDisponibleException();
    }

    return this.listarDocumentosDeCategoria(subseccion.idCategoriaItsp, filtros);
  }

  // =====================================================================
  // Archivo
  // =====================================================================

  /**
   * Resuelve el documento y su versión vigente SIN tocar el disco.
   *
   * Se separa de la apertura del archivo a propósito: el controlador tiene
   * que poder comparar el ETag entre la comprobación de visibilidad y la
   * lectura, de modo que un documento en borrador con el ETag correcto siga
   * devolviendo 404 y nunca un 304 (spec 12.4).
   */
  async resolverArchivoPublico(idDocumento: number): Promise<ArchivoPublicoResuelto> {
    const documento = await this.repositorioDocumentos.findOne({
      where: { idDocumento, estado: ESTADO_PUBLICADO },
      relations: { categoriaItsp: { categoriaPadre: true } },
    });

    if (!documento || !this.categoriaVisible(documento.categoriaItsp)) {
      throw new RecursoPublicoNoDisponibleException();
    }

    const version = await this.repositorioVersiones.findOne({
      where: { idDocumento },
      order: { numeroVersion: 'DESC' },
    });

    if (!version) {
      // Publicar exige al menos una versión, así que esto solo puede pasar
      // si la fila se manipuló a mano. Se trata como "no disponible" y no
      // como error: el ciudadano no tiene por qué ver un 500 por eso.
      throw new RecursoPublicoNoDisponibleException();
    }

    return {
      tituloDocumento: documento.titulo,
      hashArchivo: version.hashArchivo,
      nombreArchivoOriginal: version.nombreArchivoOriginal,
      tamanoBytes: Number(version.tamanoBytes),
      mimeType: version.mimeType,
      rutaArchivo: version.rutaArchivo,
    };
  }

  /**
   * Abre el archivo para transmitirlo.
   *
   * La ruta no viene nunca del cliente: sale de la fila de
   * `versiones_documentos`, y `AlmacenamientoDocumentosService` la resuelve
   * contra la raíz configurada y comprueba que el resultado no se salga de
   * ella. Esa defensa ya existe y aquí se hereda usando el mismo servicio,
   * en vez de duplicarla.
   *
   * DISCREPANCIA CON EL SPEC, resuelta aquí: el spec (8.3 y 8.5) dice que
   * este caso responde 503 reutilizando `ArchivoNoDisponibleException`, pero
   * esa excepción ya existe y es 410 GONE, con un mensaje escrito para un
   * funcionario ("...en el almacenamiento del servidor"). Se traduce al
   * contrato público que el spec documenta —503 y mensaje genérico— y se
   * deja que el almacenamiento siga lanzando y registrando la suya.
   */
  async abrirArchivo(rutaArchivo: string): Promise<ReadStream> {
    try {
      return await this.almacenamiento.abrirLectura(rutaArchivo);
    } catch {
      throw new DocumentoPublicoNoDisponibleException();
    }
  }

  // =====================================================================
  // Interno
  // =====================================================================

  /**
   * Busca una raíz activa por su código.
   *
   * No se normaliza el código a minúsculas: la columna usa la colación
   * `utf8mb4_0900_ai_ci`, insensible a mayúsculas y acentos, de modo que
   * `itsp-01` ya encuentra `ITSP-01`. Convertirlo sería trabajo inútil que
   * además daría a entender que la comparación es sensible. Hay una prueba
   * que fija ese comportamiento, para que un cambio de colación no lo rompa
   * en silencio.
   */
  private async buscarSeccionActiva(codigoSeccion: string): Promise<CategoriaItsp> {
    const categoria = await this.repositorioCategorias.findOne({
      where: { codigo: codigoSeccion, estado: ESTADO_CATEGORIA_ACTIVA },
    });

    // Que sea raíz es parte de la condición: un código de subsección usado
    // como sección es 404, no un atajo.
    if (!categoria || categoria.idCategoriaPadre !== null) {
      throw new RecursoPublicoNoDisponibleException();
    }

    return categoria;
  }

  /**
   * Un documento solo es visible si su categoría está activa Y, cuando es
   * una subsección, también su sección padre.
   *
   * Lo segundo no es un detalle: quien desactiva "Rendición de cuentas"
   * desde el catálogo espera que desaparezca del portal con todo lo que
   * cuelga de ella. Sin esta condición, sus subsecciones seguirían siendo
   * alcanzables escribiendo la URL (spec 11.1).
   */
  private categoriaVisible(categoria: CategoriaItsp | null | undefined): boolean {
    if (!categoria || categoria.estado !== ESTADO_CATEGORIA_ACTIVA) {
      return false;
    }
    if (categoria.idCategoriaPadre === null) {
      return true;
    }
    return categoria.categoriaPadre?.estado === ESTADO_CATEGORIA_ACTIVA;
  }

  /** Por `orden` y, a igualdad, por nombre, para que el resultado no dependa del motor. */
  private ordenar(categorias: CategoriaItsp[]): CategoriaItsp[] {
    return [...categorias].sort(
      (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'),
    );
  }

  private armarSeccion(
    raiz: CategoriaItsp,
    activas: CategoriaItsp[],
    conteos: Map<number, number>,
  ): SeccionPublicaDto {
    const hijas = this.ordenar(
      activas.filter((categoria) => categoria.idCategoriaPadre === raiz.idCategoriaItsp),
    );

    const subsecciones = hijas.map(
      (hija) =>
        new SubseccionPublicaDto({
          codigo: this.codigoPublico(hija),
          nombre: hija.nombre,
          descripcion: hija.descripcion,
          orden: hija.orden,
          cantidadDocumentos: conteos.get(hija.idCategoriaItsp) ?? 0,
        }),
    );

    // Los documentos de la propia raíz se suman a los de sus subsecciones
    // activas. Los de una subsección inactiva no se cuentan: esa subsección
    // no aparece y sus documentos no son alcanzables.
    const propios = conteos.get(raiz.idCategoriaItsp) ?? 0;
    const deSubsecciones = subsecciones.reduce((total, hija) => total + hija.cantidadDocumentos, 0);

    return new SeccionPublicaDto({
      codigo: this.codigoPublico(raiz),
      nombre: raiz.nombre,
      descripcion: raiz.descripcion,
      orden: raiz.orden,
      cantidadDocumentos: propios + deSubsecciones,
      subsecciones,
    });
  }

  /**
   * El código sale siempre en minúsculas, aunque en la base esté en
   * mayúsculas: así el portal genera una sola URL por sección y no tres.
   * Que las otras grafías funcionen al entrar es tolerancia ante un enlace
   * escrito a mano, no una invitación a mezclarlas (spec 8.2).
   */
  private codigoPublico(categoria: CategoriaItsp): string {
    return (categoria.codigo ?? '').toLowerCase();
  }

  /**
   * Una sola consulta agrupada para todo el árbol, no una por subsección.
   * Con 13 subsecciones la diferencia es pequeña, pero el patrón N+1 se
   * evita desde el principio y no cuando ya duele (spec 13).
   */
  private async contarDocumentosPublicadosPorCategoria(): Promise<Map<number, number>> {
    const filas = await this.repositorioDocumentos
      .createQueryBuilder('documento')
      .select('documento.idCategoriaItsp', 'idCategoria')
      .addSelect('COUNT(*)', 'total')
      .where('documento.estado = :estado', { estado: ESTADO_PUBLICADO })
      .groupBy('documento.idCategoriaItsp')
      .getRawMany<{ idCategoria: number; total: string }>();

    return new Map(filas.map((fila) => [Number(fila.idCategoria), Number(fila.total)]));
  }

  private async listarDocumentosDeCategoria(
    idCategoriaItsp: number,
    filtros: FiltrosListadoPublicoDto,
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    const pagina = filtros.pagina ?? PAGINA_POR_DEFECTO;
    const limite = filtros.limite ?? LIMITE_POR_DEFECTO;

    const [documentos, total] = await this.repositorioDocumentos
      .createQueryBuilder('documento')
      .leftJoinAndSelect('documento.tipoDocumento', 'tipo')
      .leftJoinAndSelect('documento.dependencia', 'dependencia')
      .where('documento.idCategoriaItsp = :idCategoriaItsp', { idCategoriaItsp })
      .andWhere('documento.estado = :estado', { estado: ESTADO_PUBLICADO })
      // `id DESC` como desempate para que el orden sea determinista entre
      // páginas: sin él, dos documentos publicados en el mismo instante
      // pueden alternarse y uno aparecería dos veces o ninguna.
      .orderBy('documento.fechaPublicacion', 'DESC')
      .addOrderBy('documento.idDocumento', 'DESC')
      .skip((pagina - 1) * limite)
      .take(limite)
      .getManyAndCount();

    const ids = documentos.map((documento) => documento.idDocumento);
    const versiones = await this.obtenerVersionesVigentes(ids);
    const etiquetas = await this.obtenerEtiquetas(ids);

    const datos = documentos
      // Un documento publicado sin versión se omite en vez de salir a medias
      // o de reventar el listado entero (spec 14.1, caso 7).
      .filter((documento) => versiones.has(documento.idDocumento))
      .map((documento) => {
        const version = versiones.get(documento.idDocumento)!;

        return new DocumentoPublicoDto({
          id: documento.idDocumento,
          titulo: documento.titulo,
          descripcion: documento.descripcion,
          anio: Number(documento.anio),
          fechaPublicacion: documento.fechaPublicacion,
          tipoDocumento: documento.tipoDocumento?.nombre ?? '',
          dependencia: documento.dependencia?.nombre ?? null,
          numeroPaginas: version.numeroPaginas,
          tamanoBytes: Number(version.tamanoBytes),
          etiquetas: etiquetas.get(documento.idDocumento) ?? [],
        });
      });

    return new ListaPaginadaDocumentosPublicosDto({ datos, total, pagina, limite });
  }

  /**
   * Versión vigente de cada documento de la página, en UNA consulta.
   *
   * La vigente es la de mayor `numero_version`, y se resuelve con una
   * subconsulta agrupada en vez de abrir cada documento por separado.
   */
  private async obtenerVersionesVigentes(
    ids: number[],
  ): Promise<Map<number, VersionDocumento>> {
    if (ids.length === 0) {
      return new Map();
    }

    const versiones = await this.repositorioVersiones
      .createQueryBuilder('version')
      .where('version.idDocumento IN (:...ids)', { ids })
      .andWhere(
        `version.numeroVersion = (
           SELECT MAX(interna.numero_version)
           FROM versiones_documentos interna
           WHERE interna.id_documento = version.id_documento
         )`,
      )
      .getMany();

    return new Map(versiones.map((version) => [version.idDocumento, version]));
  }

  /** Nombres de las etiquetas de cada documento de la página, en UNA consulta. */
  private async obtenerEtiquetas(ids: number[]): Promise<Map<number, string[]>> {
    if (ids.length === 0) {
      return new Map();
    }

    const filas = await this.repositorioDocumentos.manager
      .createQueryBuilder()
      .select('relacion.id_documento', 'idDocumento')
      .addSelect('etiqueta.nombre', 'nombre')
      .from('documentos_etiquetas', 'relacion')
      .innerJoin('etiquetas', 'etiqueta', 'etiqueta.id_etiqueta = relacion.id_etiqueta')
      .where('relacion.id_documento IN (:...ids)', { ids })
      .orderBy('etiqueta.nombre', 'ASC')
      .getRawMany<{ idDocumento: number; nombre: string }>();

    const porDocumento = new Map<number, string[]>();
    for (const fila of filas) {
      const id = Number(fila.idDocumento);
      const actuales = porDocumento.get(id) ?? [];
      actuales.push(fila.nombre);
      porDocumento.set(id, actuales);
    }
    return porDocumento;
  }
}
