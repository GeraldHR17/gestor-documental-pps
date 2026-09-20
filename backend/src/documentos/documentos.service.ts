// src/documentos/documentos.service.ts
//
// Núcleo de la Fase 6. Cubre el ciclo de vida completo del documento
// (RF-016 a RF-026, CU-011 a CU-016) y la clasificación (RF-029 a RF-032).
//
// Mapeo de estados, tal como quedó resuelto en la Sección 0 del pliego: el
// ENUM de `documentos` sólo tiene BORRADOR, PUBLICADO e INACTIVO, así que
// "despublicar" es PUBLICADO -> BORRADOR (vuelve a ser editable y
// republicable) e "inactivar" es el retiro lógico definitivo. Nunca hay
// DELETE físico (RN-007).

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { Documento } from '../entidades/documento.entidad';
import { VersionDocumento } from '../entidades/version-documento.entidad';
import { Usuario } from '../entidades/usuario.entidad';
import { DocumentoEtiqueta } from '../entidades/documento-etiqueta.entidad';
import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { TipoDocumento } from '../entidades/tipo-documento.entidad';
import { Dependencia } from '../entidades/dependencia.entidad';
import { Etiqueta } from '../entidades/etiqueta.entidad';

import { BitacoraService } from '../bitacora/bitacora.service';
import {
  CODIGO_CATEGORIA_RAIZ_EXCLUIDA,
  MENSAJE_CATEGORIA_EXCLUIDA,
} from '../comun/constantes/categorias-itsp';
import { PermisoDenegadoException } from '../comun/excepciones/excepciones-autenticacion';
import { CachePermisosService } from '../comun/cache/cache-permisos.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import {
  AlmacenamientoDocumentosService,
  type ArchivoCargado,
} from './almacenamiento-documentos.service';

import { RegistrarDocumentoDto } from './dto/registrar-documento.dto';
import { ActualizarDocumentoDto } from './dto/actualizar-documento.dto';
import { FiltrosDocumentosDto } from './dto/filtros-documentos.dto';
import {
  DocumentoRespuestaDto,
  ListaPaginadaDocumentosRespuestaDto,
  ReferenciaCatalogoDto,
  VersionDocumentoRespuestaDto,
} from './dto/documento-respuesta.dto';

import {
  ClasificacionInvalidaException,
  DocumentoNoEncontradoException,
  DocumentoNoPublicableException,
  TransicionEstadoInvalidaException,
} from '../comun/excepciones/excepciones-documentos';

const ENTIDAD_BITACORA = 'documentos';

/**
 * Quien tenga cualquiera de estos permisos administra documentos y por lo
 * tanto ve también los borradores y los inactivos. El rol Usuario, que sólo
 * tiene `documentos.consultar`, ve exclusivamente lo PUBLICADO: para él un
 * borrador no existe.
 */
const PERMISOS_DE_GESTION = [
  'documentos.crear',
  'documentos.editar',
  'documentos.publicar',
  'documentos.inactivar',
  'versiones.cargar',
];

@Injectable()
export class DocumentosService {
  constructor(
    @InjectRepository(Documento)
    private readonly repositorioDocumentos: Repository<Documento>,
    @InjectRepository(VersionDocumento)
    private readonly repositorioVersiones: Repository<VersionDocumento>,
    @InjectRepository(Usuario)
    private readonly repositorioUsuarios: Repository<Usuario>,
    @InjectRepository(DocumentoEtiqueta)
    private readonly repositorioDocumentosEtiquetas: Repository<DocumentoEtiqueta>,
    @InjectRepository(CategoriaItsp)
    private readonly repositorioCategorias: Repository<CategoriaItsp>,
    @InjectRepository(TipoDocumento)
    private readonly repositorioTipos: Repository<TipoDocumento>,
    @InjectRepository(Dependencia)
    private readonly repositorioDependencias: Repository<Dependencia>,
    @InjectRepository(Etiqueta)
    private readonly repositorioEtiquetas: Repository<Etiqueta>,
    @InjectDataSource()
    private readonly fuenteDatos: DataSource,
    private readonly almacenamiento: AlmacenamientoDocumentosService,
    private readonly bitacoraService: BitacoraService,
    private readonly cachePermisos: CachePermisosService,
  ) {}

  // =====================================================================
  // Visibilidad
  // =====================================================================

  /**
   * Mismo criterio que PermisosGuard: la caché manda, y el listado que
   * viaja dentro del JWT es el respaldo cuando la caché está fría. Así una
   * revocación de permisos se refleja aquí igual que en el guard, sin
   * esperar a que expire el token.
   */
  private permisosEfectivosDe(usuario: PayloadJwt): string[] {
    return this.cachePermisos.obtener(usuario.idRol) ?? usuario.permisos ?? [];
  }

  puedeGestionar(usuario: PayloadJwt): boolean {
    const permisos = this.permisosEfectivosDe(usuario);
    return PERMISOS_DE_GESTION.some((permiso) => permisos.includes(permiso));
  }

  /**
   * Se responde 404 y no 403 cuando alguien sin permisos de gestión pide un
   * borrador: un 403 confirmaría que el documento existe, y para ese perfil
   * no debería ser distinguible de uno inexistente.
   */
  private verificarVisibilidad(documento: Documento, usuario: PayloadJwt): void {
    if (documento.estado !== 'PUBLICADO' && !this.puedeGestionar(usuario)) {
      throw new DocumentoNoEncontradoException();
    }
  }

  // =====================================================================
  // Lectura
  // =====================================================================

  async listar(
    filtros: FiltrosDocumentosDto,
    usuario: PayloadJwt,
  ): Promise<ListaPaginadaDocumentosRespuestaDto> {
    const pagina = filtros.pagina ?? 1;
    const limite = filtros.limite ?? 10;

    const consulta = this.repositorioDocumentos
      .createQueryBuilder('documento')
      .leftJoinAndSelect('documento.categoriaItsp', 'categoria')
      .leftJoinAndSelect('categoria.categoriaPadre', 'categoriaPadre')
      .leftJoinAndSelect('documento.tipoDocumento', 'tipo')
      .leftJoinAndSelect('documento.dependencia', 'dependencia')
      .leftJoinAndSelect('documento.usuarioCreador', 'creador')
      .orderBy('documento.fechaActualizacion', 'DESC')
      .addOrderBy('documento.idDocumento', 'DESC')
      .skip((pagina - 1) * limite)
      .take(limite);

    if (!this.puedeGestionar(usuario)) {
      consulta.andWhere('documento.estado = :estadoPublicado', { estadoPublicado: 'PUBLICADO' });
    } else if (filtros.estado) {
      consulta.andWhere('documento.estado = :estado', { estado: filtros.estado });
    }

    if (filtros.texto) {
      consulta.andWhere('(documento.titulo LIKE :texto OR documento.descripcion LIKE :texto)', {
        texto: `%${filtros.texto}%`,
      });
    }

    if (filtros.idCategoriaItsp) {
      consulta.andWhere('documento.idCategoriaItsp = :idCategoriaItsp', {
        idCategoriaItsp: filtros.idCategoriaItsp,
      });
    }

    if (filtros.idTipoDocumento) {
      consulta.andWhere('documento.idTipoDocumento = :idTipoDocumento', {
        idTipoDocumento: filtros.idTipoDocumento,
      });
    }

    if (filtros.anio) {
      consulta.andWhere('documento.anio = :anio', { anio: filtros.anio });
    }

    // Dependencia única (1:N): comparación directa sobre la columna.
    if (filtros.idDependencia) {
      consulta.andWhere('documento.idDependencia = :idDependencia', {
        idDependencia: filtros.idDependencia,
      });
    }

    // El filtro N:M de etiquetas va por subconsulta y no por JOIN: un JOIN
    // sobre la tabla de relación multiplicaría las filas del documento y
    // rompería tanto el conteo como la paginación.
    if (filtros.idEtiqueta) {
      consulta.andWhere(
        'documento.idDocumento IN (SELECT de.id_documento FROM documentos_etiquetas de WHERE de.id_etiqueta = :idEtiqueta)',
        { idEtiqueta: filtros.idEtiqueta },
      );
    }

    const [documentos, total] = await consulta.getManyAndCount();
    const identificadores = documentos.map((documento) => documento.idDocumento);

    const [etiquetas, versiones] = await Promise.all([
      this.cargarEtiquetasDe(identificadores),
      this.cargarVersionesDe(identificadores),
    ]);

    return new ListaPaginadaDocumentosRespuestaDto({
      datos: documentos.map((documento) =>
        this.mapear(documento, {
          etiquetas: etiquetas.get(documento.idDocumento) ?? [],
          versiones: versiones.get(documento.idDocumento) ?? [],
          incluirHistorial: false,
        }),
      ),
      total,
      pagina,
      limite,
    });
  }

  async obtener(id: number, usuario: PayloadJwt): Promise<DocumentoRespuestaDto> {
    const documento = await this.buscarEntidadAccesible(id, usuario);

    const [etiquetas, versiones] = await Promise.all([
      this.cargarEtiquetasDe([id]),
      this.cargarVersionesDe([id]),
    ]);

    return this.mapear(documento, {
      etiquetas: etiquetas.get(id) ?? [],
      versiones: versiones.get(id) ?? [],
      incluirHistorial: true,
    });
  }

  /**
   * Entidad completa con sus relaciones directas, ya filtrada por
   * visibilidad. La usa también VersionesDocumentosService para no duplicar
   * la regla de quién puede ver qué.
   */
  async buscarEntidadAccesible(id: number, usuario: PayloadJwt): Promise<Documento> {
    const documento = await this.repositorioDocumentos.findOne({
      where: { idDocumento: id },
      relations: {
        categoriaItsp: { categoriaPadre: true },
        tipoDocumento: true,
        dependencia: true,
        usuarioCreador: true,
      },
    });

    if (!documento) {
      throw new DocumentoNoEncontradoException();
    }

    this.verificarVisibilidad(documento, usuario);
    return documento;
  }

  // =====================================================================
  // Registro (RF-016 a RF-020, CU-011)
  // =====================================================================

  async registrar(
    dto: RegistrarDocumentoDto,
    archivo: ArchivoCargado | undefined,
    usuario: PayloadJwt,
  ): Promise<DocumentoRespuestaDto> {
    // "Confirmar y publicar" exige el permiso de publicar además del de
    // crear. Se comprueba antes de escribir nada: si falta, no debe quedar
    // ni el archivo ni el documento a medias.
    if (dto.publicarInmediatamente && !this.permisosEfectivosDe(usuario).includes('documentos.publicar')) {
      throw new PermisoDenegadoException();
    }

    await this.verificarClasificacion(dto.idCategoriaItsp, dto.idTipoDocumento);
    const idDependencia = await this.resolverDependenciaParaRegistro(dto.idDependencia, usuario);
    const etiquetas = await this.verificarEtiquetas(dto.etiquetas);

    // El archivo se valida y se escribe ANTES de abrir la transacción: no
    // tiene sentido mantener filas bloqueadas mientras se copian 40 MB a
    // disco. Si la transacción falla después, el archivo se descarta.
    const almacenado = await this.almacenamiento.almacenar(archivo);

    let idDocumento: number;

    try {
      idDocumento = await this.fuenteDatos.transaction(async (gestor) => {
        const documento = gestor.create(Documento, {
          titulo: dto.titulo.trim(),
          descripcion: this.normalizarTexto(dto.descripcion),
          anio: dto.anio,
          estado: 'BORRADOR' as const,
          idCategoriaItsp: dto.idCategoriaItsp,
          idTipoDocumento: dto.idTipoDocumento,
          idDependencia,
          idUsuarioCreador: usuario.idUsuario,
        });

        const guardado = await gestor.save(documento);

        // Primera versión (RF-018): la numeración arranca en 1 y la asigna
        // siempre el servidor.
        await gestor.save(
          gestor.create(VersionDocumento, {
            idDocumento: guardado.idDocumento,
            numeroVersion: 1,
            nombreArchivoOriginal: (archivo as ArchivoCargado).originalname,
            nombreArchivoSistema: almacenado.nombreArchivoSistema,
            rutaArchivo: almacenado.rutaArchivo,
            hashArchivo: almacenado.hashArchivo,
            algoritmoHash: almacenado.algoritmoHash,
            tamanoBytes: String(almacenado.tamanoBytes),
            mimeType: 'application/pdf',
            numeroPaginas: almacenado.numeroPaginas,
            comentarioVersion: 'Versión inicial',
            idUsuarioCarga: usuario.idUsuario,
          }),
        );

        await this.sincronizarEtiquetas(gestor, guardado.idDocumento, etiquetas);

        return guardado.idDocumento;
      });
    } catch (error) {
      await this.almacenamiento.descartar(almacenado.rutaArchivo);
      throw error;
    }

    await this.registrarEnBitacora('CREAR_DOCUMENTO', idDocumento, usuario, {
      titulo: dto.titulo.trim(),
      anio: dto.anio,
      hashArchivo: almacenado.hashArchivo,
      tamanoBytes: almacenado.tamanoBytes,
      idDependencia,
    });

    // CU-011 seguido de CU-014 en una sola operación (asistente de
    // registro, paso "Confirmar y publicar"). Queda con sus dos entradas
    // de bitácora, igual que si se hubiera hecho en dos pasos.
    if (dto.publicarInmediatamente) {
      return this.publicar(idDocumento, usuario);
    }

    return this.obtener(idDocumento, usuario);
  }

  /**
   * Precarga, no imposición: si el cliente no envía dependencia se toma la
   * del usuario autenticado (puede ser ninguna); si la envía, se respeta,
   * lo que permite registrar en nombre de otra dependencia.
   */
  private async resolverDependenciaParaRegistro(
    idDependenciaEnviada: number | undefined,
    usuario: PayloadJwt,
  ): Promise<number | null> {
    if (idDependenciaEnviada !== undefined) {
      await this.verificarDependencia(idDependenciaEnviada);
      return idDependenciaEnviada;
    }

    const usuarioActual = await this.repositorioUsuarios.findOne({
      where: { idUsuario: usuario.idUsuario },
    });
    return usuarioActual?.idDependencia ?? null;
  }

  // =====================================================================
  // Edición de metadatos (RF-021, CU-012)
  // =====================================================================

  async actualizar(
    id: number,
    dto: ActualizarDocumentoDto,
    usuario: PayloadJwt,
  ): Promise<DocumentoRespuestaDto> {
    const documento = await this.buscarEntidadAccesible(id, usuario);

    if (documento.estado === 'INACTIVO') {
      throw new TransicionEstadoInvalidaException(
        'No se pueden editar los metadatos de un documento inactivo',
      );
    }

    const idCategoria = dto.idCategoriaItsp ?? documento.idCategoriaItsp;
    const idTipo = dto.idTipoDocumento ?? documento.idTipoDocumento;

    if (dto.idCategoriaItsp !== undefined || dto.idTipoDocumento !== undefined) {
      await this.verificarClasificacion(idCategoria, idTipo);
    }

    if (dto.idDependencia !== undefined && dto.idDependencia !== null) {
      await this.verificarDependencia(dto.idDependencia);
    }
    const etiquetas =
      dto.etiquetas !== undefined ? await this.verificarEtiquetas(dto.etiquetas) : null;

    // Se actualizan columnas explícitas con `update` y no con `save` sobre
    // la entidad cargada: esa entidad trae las relaciones resueltas
    // (dependencia, categoría...) y al guardarla TypeORM persiste la llave
    // foránea desde el objeto relacionado, con lo que poner
    // `idDependencia = null` quedaba sin efecto. Con `update` manda la
    // columna, que es lo que el cliente pidió cambiar.
    const cambios: QueryDeepPartialEntity<Documento> = {
      idCategoriaItsp: idCategoria,
      idTipoDocumento: idTipo,
    };
    if (dto.titulo !== undefined) cambios.titulo = dto.titulo.trim();
    if (dto.descripcion !== undefined) cambios.descripcion = this.normalizarTexto(dto.descripcion);
    if (dto.anio !== undefined) cambios.anio = dto.anio;
    // Omitido = no tocar; `null` explícito = quitar la dependencia.
    if (dto.idDependencia !== undefined) cambios.idDependencia = dto.idDependencia;

    await this.fuenteDatos.transaction(async (gestor) => {
      await gestor.update(Documento, { idDocumento: id }, cambios);

      // `null` significa "el cliente no envió el campo": las asociaciones
      // se dejan como estaban. Un arreglo vacío sí es una instrucción de
      // borrado, y por eso se distingue de la ausencia del campo.
      await this.sincronizarEtiquetas(gestor, id, etiquetas);
    });

    await this.registrarEnBitacora('ACTUALIZAR_DOCUMENTO', id, usuario, {
      camposModificados: Object.keys(dto),
    });

    return this.obtener(id, usuario);
  }

  // =====================================================================
  // Transiciones de estado (RF-024 a RF-026, CU-014 a CU-016)
  // =====================================================================

  /**
   * VP-03 / RN-009: los metadatos obligatorios ya los garantiza el esquema
   * (son NOT NULL), así que lo único que queda por comprobar aquí es que el
   * documento tenga al menos una versión de PDF cargada. Dependencias y
   * etiquetas son opcionales y no bloquean.
   */
  async publicar(id: number, usuario: PayloadJwt, motivo?: string): Promise<DocumentoRespuestaDto> {
    const documento = await this.buscarEntidadAccesible(id, usuario);

    if (documento.estado === 'INACTIVO') {
      throw new TransicionEstadoInvalidaException('Un documento inactivo no se puede publicar');
    }

    if (documento.estado === 'PUBLICADO') {
      throw new TransicionEstadoInvalidaException('El documento ya está publicado');
    }

    const cantidadVersiones = await this.repositorioVersiones.count({
      where: { idDocumento: id },
    });

    if (cantidadVersiones === 0) {
      throw new DocumentoNoPublicableException(
        'Para publicar el documento debe cargarse al menos una versión en PDF',
      );
    }

    documento.estado = 'PUBLICADO';
    documento.fechaPublicacion = new Date();
    await this.repositorioDocumentos.save(documento);

    await this.registrarEnBitacora('PUBLICAR_DOCUMENTO', id, usuario, { motivo: motivo ?? null });

    return this.obtener(id, usuario);
  }

  async despublicar(
    id: number,
    usuario: PayloadJwt,
    motivo?: string,
  ): Promise<DocumentoRespuestaDto> {
    const documento = await this.buscarEntidadAccesible(id, usuario);

    if (documento.estado !== 'PUBLICADO') {
      throw new TransicionEstadoInvalidaException(
        'Sólo se puede despublicar un documento que está publicado',
      );
    }

    documento.estado = 'BORRADOR';
    // Se limpia porque la columna describe la publicación vigente, no el
    // historial: dejar una fecha en un documento que ya no está publicado
    // haría que el listado mostrara como publicado algo que no lo está. El
    // rastro de cuándo estuvo publicado queda en la bitácora.
    documento.fechaPublicacion = null;
    await this.repositorioDocumentos.save(documento);

    await this.registrarEnBitacora('DESPUBLICAR_DOCUMENTO', id, usuario, { motivo: motivo ?? null });

    return this.obtener(id, usuario);
  }

  /** RN-007: retiro lógico. La fila y sus archivos permanecen intactos. */
  async inactivar(id: number, usuario: PayloadJwt, motivo?: string): Promise<DocumentoRespuestaDto> {
    const documento = await this.buscarEntidadAccesible(id, usuario);

    if (documento.estado === 'INACTIVO') {
      throw new TransicionEstadoInvalidaException('El documento ya está inactivo');
    }

    documento.estado = 'INACTIVO';
    documento.fechaPublicacion = null;
    await this.repositorioDocumentos.save(documento);

    await this.registrarEnBitacora('INACTIVAR_DOCUMENTO', id, usuario, { motivo: motivo ?? null });

    return this.obtener(id, usuario);
  }

  // =====================================================================
  // Clasificación (RF-029 a RF-032)
  // =====================================================================

  private async verificarClasificacion(idCategoria: number, idTipo: number): Promise<void> {
    const categoria = await this.repositorioCategorias.findOne({
      where: { idCategoriaItsp: idCategoria },
      relations: { categoriaPadre: true },
    });

    if (!categoria) {
      throw new ClasificacionInvalidaException('La categoría ITSP seleccionada no existe');
    }

    if (categoria.estado !== 'ACTIVO') {
      throw new ClasificacionInvalidaException('La categoría ITSP seleccionada está inactiva');
    }

    // La sección informativa no clasifica documentos: ni la raíz ni sus
    // subsecciones. El formulario ya la oculta; aquí se impone de verdad.
    if (
      categoria.codigo === CODIGO_CATEGORIA_RAIZ_EXCLUIDA ||
      categoria.categoriaPadre?.codigo === CODIGO_CATEGORIA_RAIZ_EXCLUIDA
    ) {
      throw new ClasificacionInvalidaException(MENSAJE_CATEGORIA_EXCLUIDA);
    }

    const tipo = await this.repositorioTipos.findOne({ where: { idTipoDocumento: idTipo } });

    if (!tipo) {
      throw new ClasificacionInvalidaException('El tipo documental seleccionado no existe');
    }

    if (tipo.estado !== 'ACTIVO') {
      throw new ClasificacionInvalidaException('El tipo documental seleccionado está inactivo');
    }
  }

  private async verificarDependencia(idDependencia: number): Promise<void> {
    const dependencia = await this.repositorioDependencias.findOne({ where: { idDependencia } });

    if (!dependencia) {
      throw new ClasificacionInvalidaException('La dependencia seleccionada no existe');
    }

    if (dependencia.estado !== 'ACTIVO') {
      throw new ClasificacionInvalidaException('La dependencia seleccionada está inactiva');
    }
  }

  /**
   * Comprueba de una sola consulta que todas las etiquetas existan y
   * estén activas. Se rechaza el conjunto completo en vez de filtrar las
   * inválidas en silencio: si alguien intenta clasificar con una etiqueta
   * inactiva, debe enterarse, no ver cómo desaparece de su formulario.
   */
  private async verificarEtiquetas(identificadores?: number[]): Promise<number[]> {
    if (!identificadores || identificadores.length === 0) {
      return [];
    }

    const unicos = [...new Set(identificadores)];
    const encontradas = await this.repositorioEtiquetas.find({ where: { idEtiqueta: In(unicos) } });

    if (encontradas.length !== unicos.length) {
      throw new ClasificacionInvalidaException('Hay una etiqueta seleccionada que no existe');
    }

    if (encontradas.some((etiqueta) => etiqueta.estado !== 'ACTIVO')) {
      throw new ClasificacionInvalidaException('No se puede clasificar con una etiqueta inactiva');
    }

    return unicos;
  }

  /**
   * Reemplaza el conjunto de etiquetas (N:M). Se borra y se vuelve a
   * insertar en vez de calcular el diferencial: es una tabla de dos
   * columnas sin datos propios, así que el diferencial no ahorraría nada
   * y sí agregaría casos que probar.
   *
   * `null` significa "no tocar".
   */
  private async sincronizarEtiquetas(
    gestor: EntityManager,
    idDocumento: number,
    etiquetas: number[] | null,
  ): Promise<void> {
    if (etiquetas === null) return;

    await gestor.delete(DocumentoEtiqueta, { idDocumento });
    if (etiquetas.length > 0) {
      await gestor.insert(
        DocumentoEtiqueta,
        etiquetas.map((idEtiqueta) => ({ idDocumento, idEtiqueta })),
      );
    }
  }

  // =====================================================================
  // Carga de relaciones y mapeo
  // =====================================================================

  private async cargarEtiquetasDe(
    identificadores: number[],
  ): Promise<Map<number, ReferenciaCatalogoDto[]>> {
    if (identificadores.length === 0) return new Map();

    const filas = await this.repositorioDocumentosEtiquetas.find({
      where: { idDocumento: In(identificadores) },
      relations: { etiqueta: true },
    });

    return this.agrupar(filas, (fila) => fila.idDocumento, (fila) =>
      new ReferenciaCatalogoDto({
        id: fila.idEtiqueta,
        nombre: fila.etiqueta?.nombre ?? '',
      }),
    );
  }

  /**
   * Historial completo por documento, ordenado de la más reciente a la más
   * antigua y con `esVigente` marcado en la de mayor `numeroVersion`
   * (VP-05). Es público porque VersionesDocumentosService lo reutiliza para
   * responder `GET /documentos/:id/versiones`.
   */
  async cargarVersionesDe(
    identificadores: number[],
  ): Promise<Map<number, VersionDocumentoRespuestaDto[]>> {
    if (identificadores.length === 0) return new Map();

    const filas = await this.repositorioVersiones.find({
      where: { idDocumento: In(identificadores) },
      relations: { usuarioCarga: true },
      order: { idDocumento: 'ASC', numeroVersion: 'DESC' },
    });

    const vigentePorDocumento = new Map<number, number>();
    for (const fila of filas) {
      const vigente = vigentePorDocumento.get(fila.idDocumento) ?? 0;
      if (fila.numeroVersion > vigente) {
        vigentePorDocumento.set(fila.idDocumento, fila.numeroVersion);
      }
    }

    return this.agrupar(filas, (fila) => fila.idDocumento, (fila) =>
      this.mapearVersion(fila, vigentePorDocumento.get(fila.idDocumento) ?? 0),
    );
  }

  private mapearVersion(
    version: VersionDocumento,
    numeroVersionVigente: number,
  ): VersionDocumentoRespuestaDto {
    return new VersionDocumentoRespuestaDto({
      id: version.idVersion,
      numeroVersion: version.numeroVersion,
      nombreArchivoOriginal: version.nombreArchivoOriginal,
      hashArchivo: version.hashArchivo,
      algoritmoHash: version.algoritmoHash,
      // La columna es BIGINT y TypeORM la entrega como string para no
      // perder precisión; el techo real son 40 MB, así que cabe en number.
      tamanoBytes: Number(version.tamanoBytes),
      mimeType: version.mimeType,
      numeroPaginas: version.numeroPaginas,
      comentarioVersion: version.comentarioVersion,
      fechaCarga: version.fechaCarga,
      idUsuarioCarga: version.idUsuarioCarga,
      nombreUsuarioCarga: version.usuarioCarga?.nombreCompleto ?? null,
      esVigente: version.numeroVersion === numeroVersionVigente,
    });
  }

  private agrupar<T, R>(
    filas: T[],
    obtenerClave: (fila: T) => number,
    mapear: (fila: T) => R,
  ): Map<number, R[]> {
    const agrupado = new Map<number, R[]>();
    for (const fila of filas) {
      const clave = obtenerClave(fila);
      const acumulado = agrupado.get(clave);
      if (acumulado) {
        acumulado.push(mapear(fila));
      } else {
        agrupado.set(clave, [mapear(fila)]);
      }
    }
    return agrupado;
  }

  private mapear(
    documento: Documento,
    extras: {
      etiquetas: ReferenciaCatalogoDto[];
      versiones: VersionDocumentoRespuestaDto[];
      incluirHistorial: boolean;
    },
  ): DocumentoRespuestaDto {
    const categoria = documento.categoriaItsp;

    return new DocumentoRespuestaDto({
      id: documento.idDocumento,
      titulo: documento.titulo,
      descripcion: documento.descripcion,
      anio: Number(documento.anio),
      estado: documento.estado,
      fechaPublicacion: documento.fechaPublicacion,
      fechaCreacion: documento.fechaCreacion,
      fechaActualizacion: documento.fechaActualizacion,

      idCategoriaItsp: documento.idCategoriaItsp,
      nombreCategoriaItsp: categoria?.nombre ?? '',
      nombreCategoriaRaiz: categoria?.categoriaPadre?.nombre ?? null,

      idTipoDocumento: documento.idTipoDocumento,
      nombreTipoDocumento: documento.tipoDocumento?.nombre ?? '',

      idDependencia: documento.idDependencia,
      nombreDependencia: documento.dependencia?.nombre ?? null,

      idUsuarioCreador: documento.idUsuarioCreador,
      nombreUsuarioCreador: documento.usuarioCreador?.nombreCompleto ?? null,

      etiquetas: extras.etiquetas,

      cantidadVersiones: extras.versiones.length,
      versionVigente: extras.versiones.find((version) => version.esVigente) ?? null,
      versiones: extras.incluirHistorial ? extras.versiones : undefined,
    });
  }

  /** Cadena vacía y sólo-espacios se guardan como NULL, no como ''. */
  private normalizarTexto(valor?: string | null): string | null {
    const limpio = valor?.trim();
    return limpio ? limpio : null;
  }

  private async registrarEnBitacora(
    accion: string,
    idDocumento: number,
    usuario: PayloadJwt,
    detalles: Record<string, unknown>,
  ): Promise<void> {
    await this.bitacoraService.registrar({
      idUsuario: usuario.idUsuario,
      accion,
      entidad: ENTIDAD_BITACORA,
      idRegistro: idDocumento,
      resultado: 'EXITO',
      detalles,
    });
  }
}
