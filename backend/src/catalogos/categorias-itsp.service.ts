// src/catalogos/categorias-itsp.service.ts
//
// La taxonomía ITSP es jerárquica: categorías raíz (nivel 1) y, desde
// spec-ajustes-niveles-y-estados, subcategorías a cualquier profundidad
// hasta PROFUNDIDAD_MAXIMA_CATEGORIAS niveles contando la raíz. El nivel
// nunca lo envía el cliente: lo deriva este servicio del padre, y las
// formas de romper la jerarquía (ciclos, tope, raíz que pasa a subsección
// o al revés) se rechazan explícitamente (ver `validarPadreParaCrear`,
// `validarMovimiento` y `actualizar`).
//
// El código tampoco lo envía el cliente: lo asigna este servicio como
// "máximo + 1" bajo su padre (ver codigos-categoria.ts). Es la parte de la
// URL pública (/vista/itsp-05) que se pega en WordPress, así que no
// cambia nunca, salvo cuando una subcategoría se mueve: entonces cambian
// el suyo y los de todo su subárbol, en una sola transacción.
//
// El árbol se arma en memoria desde una lectura plana de la tabla
// (JerarquiaCategorias): son decenas de filas.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';

import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { Documento } from '../entidades/documento.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import { CrearCategoriaItspDto } from './dto/crear-categoria-itsp.dto';
import { ActualizarCategoriaItspDto } from './dto/actualizar-categoria-itsp.dto';
import { FiltrosCatalogoDto } from './dto/filtros-catalogo.dto';
import {
  CategoriaItspNodoArbolDto,
  CategoriaItspRespuestaDto,
  SiguienteCodigoCategoriaRespuestaDto,
} from './dto/categoria-itsp-respuesta.dto';
import { recodificarSubarbol, siguienteCodigoHija, siguienteCodigoRaiz } from './codigos-categoria';
import { JerarquiaCategorias } from './jerarquia-categorias';
import {
  LONGITUD_MAXIMA_CODIGO_CATEGORIA,
  MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA,
  PROFUNDIDAD_MAXIMA_CATEGORIAS,
} from '../comun/constantes/categorias-itsp';
import {
  CategoriaPadreInvalidaException,
  CodigoCategoriaNoAsignadoException,
  NombreCatalogoDuplicadoException,
  RegistroCatalogoNoEncontradoException,
} from '../comun/excepciones/excepciones-catalogos';

const ETIQUETA_SINGULAR = 'Categoría ITSP';
const ETIQUETA_INDEFINIDA = 'una categoría';
const ENTIDAD_BITACORA = 'categorias_itsp';

const MENSAJE_CAMBIO_DE_NIVEL =
  'Una categoría raíz no puede convertirse en subsección ni una subsección en raíz';
const MENSAJE_CICLO =
  'Una categoría no puede moverse dentro de sí misma ni de sus subcategorías';
const MENSAJE_EXCLUIDA_CON_DOCUMENTOS =
  "No se puede mover a 'Participación ciudadana' una categoría con documentos: esa sección no los admite";

function mensajeProfundidad(niveles: number): string {
  return `La jerarquía admite como máximo ${PROFUNDIDAD_MAXIMA_CATEGORIAS} niveles; esta operación la dejaría en ${niveles}`;
}

/** Intentos de asignar código antes de responder 409 (spec §7.2). */
const INTENTOS_ASIGNACION_CODIGO = 3;

/**
 * La única restricción única de `categorias_itsp`, aparte de la clave
 * primaria autoincremental, es la del código. Por eso cualquier
 * ER_DUP_ENTRY al guardar aquí significa que otra persona ganó ese número
 * entre la lectura y la escritura. No se compara el nombre del índice: en
 * una base migrada a mano podría llamarse distinto.
 */
function esCodigoDuplicado(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: unknown }).code === 'ER_DUP_ENTRY'
  );
}

/** Un código recalculado al mover un subárbol, para la bitácora. */
interface CambioDeCodigo {
  id: number;
  codigoAnterior: string;
  codigoNuevo: string;
}

/**
 * Lista de cambios para `detalles`, recortada a
 * MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA: lo que pase del tope queda como
 * cuenta, para que un subárbol grande no infle la fila (ajuste 2).
 */
function detallarCambiosDescendientes(cambios: CambioDeCodigo[]): Record<string, unknown> {
  if (cambios.length === 0) return {};
  const omitidos = cambios.length - MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA;
  return {
    cambiosDescendientes: cambios.slice(0, MAXIMO_CAMBIOS_DETALLADOS_EN_BITACORA),
    ...(omitidos > 0 ? { cambiosDescendientesOmitidos: omitidos } : {}),
  };
}

@Injectable()
export class CategoriasItspService {
  constructor(
    @InjectRepository(CategoriaItsp)
    private readonly repositorioCategorias: Repository<CategoriaItsp>,
    @InjectRepository(Documento)
    private readonly repositorioDocumentos: Repository<Documento>,
    private readonly bitacoraService: BitacoraService,
  ) {}

  /**
   * Lista plana, pero ya en orden de despliegue: cada categoría seguida de
   * su subárbol. Así la tabla sólo tiene que indentar según `nivel`, sin
   * reordenar nada en el cliente.
   */
  async listar(filtros: FiltrosCatalogoDto = {}): Promise<CategoriaItspRespuestaDto[]> {
    const todas = await this.repositorioCategorias.find();
    const jerarquia = new JerarquiaCategorias(todas);

    // El filtro se aplica DESPUÉS de ordenar, sobre el conjunto completo:
    // si se ordenara sólo lo filtrado, una subcategoría cuyo padre no
    // coincide con la búsqueda perdería su posición en la jerarquía.
    const termino = filtros.nombre?.trim().toLowerCase();

    return jerarquia
      .ordenDeDespliegue()
      .filter((categoria) => {
        if (filtros.estado && categoria.estado !== filtros.estado) return false;
        if (termino && !categoria.nombre.toLowerCase().includes(termino)) return false;
        return true;
      })
      .map((categoria) =>
        this.mapearFila(categoria, jerarquia.obtener(categoria.idCategoriaPadre)?.nombre ?? null),
      );
  }

  /**
   * Jerarquía completa, con los hijos anidados en `hijos` a cualquier
   * profundidad. La consumen los selectores de categoría del registro de
   * documentos y de los filtros.
   *
   * El filtro `estado` poda en cualquier nivel: un nodo solo aparece si él
   * y todos sus ancestros cumplen el estado. Con `estado=ACTIVO` eso es
   * exactamente el estado efectivo (spec D-5): lo que cuelga de una
   * categoría inactiva no aparece suelto.
   */
  async obtenerArbol(filtros: FiltrosCatalogoDto = {}): Promise<CategoriaItspNodoArbolDto[]> {
    const todas = await this.repositorioCategorias.find();
    const jerarquia = new JerarquiaCategorias(todas);

    const incluir = (categoria: CategoriaItsp): boolean =>
      !filtros.estado || categoria.estado === filtros.estado;

    const armar = (categoria: CategoriaItsp): CategoriaItspNodoArbolDto =>
      this.mapearNodo(
        categoria,
        jerarquia.hijos(categoria.idCategoriaItsp).filter(incluir).map(armar),
      );

    return jerarquia.raices().filter(incluir).map(armar);
  }

  async obtener(id: number): Promise<CategoriaItspRespuestaDto> {
    const categoria = await this.buscarPorId(id);
    const padre =
      categoria.idCategoriaPadre !== null
        ? await this.repositorioCategorias.findOne({
            where: { idCategoriaItsp: categoria.idCategoriaPadre },
          })
        : null;

    return this.mapearFila(categoria, padre?.nombre ?? null);
  }

  async crear(
    dto: CrearCategoriaItspDto,
    usuarioAutenticado: PayloadJwt,
  ): Promise<CategoriaItspRespuestaDto> {
    const nombre = dto.nombre.trim();
    const idCategoriaPadre = dto.idCategoriaPadre ?? null;

    const nivel = await this.validarPadreParaCrear(idCategoriaPadre);
    await this.verificarNombreDisponibleEntreHermanas(nombre, idCategoriaPadre, null);

    const guardada = await this.conCodigoAsignado(async (repositorio) => {
      const codigo = await this.calcularSiguienteCodigo(repositorio, idCategoriaPadre);
      this.verificarLongitudCodigo(codigo);

      return repositorio.save(
        repositorio.create({
          nombre,
          codigo,
          descripcion: this.normalizarTexto(dto.descripcion),
          idCategoriaPadre,
          // Derivado, nunca recibido: el del padre + 1.
          nivel,
          orden: dto.orden ?? 0,
          estado: 'ACTIVO',
        }),
      );
    });

    await this.registrarEnBitacora('CREAR', guardada, usuarioAutenticado, {
      nombre,
      codigo: guardada.codigo,
    });

    return this.obtener(guardada.idCategoriaItsp);
  }

  /**
   * Código que recibiría ahora una categoría nueva con ese padre (`null` =
   * raíz). Es sólo una previsión: si otra persona crea antes, el código
   * final puede ser el siguiente, y la respuesta del guardado lo trae.
   */
  async obtenerSiguienteCodigo(
    idCategoriaPadre: number | null,
  ): Promise<SiguienteCodigoCategoriaRespuestaDto> {
    await this.validarPadreParaCrear(idCategoriaPadre);

    return new SiguienteCodigoCategoriaRespuestaDto({
      codigo: await this.calcularSiguienteCodigo(this.repositorioCategorias, idCategoriaPadre),
    });
  }

  async actualizar(
    id: number,
    dto: ActualizarCategoriaItspDto,
    usuarioAutenticado: PayloadJwt,
  ): Promise<CategoriaItspRespuestaDto> {
    const categoria = await this.buscarPorId(id);
    const codigoAnterior = categoria.codigo;
    let idPadreNuevo: number | null = null;

    if (dto.idCategoriaPadre !== undefined) {
      const nuevoPadre = dto.idCategoriaPadre ?? null;

      if (nuevoPadre === categoria.idCategoriaItsp) {
        throw new CategoriaPadreInvalidaException(
          'Una categoría no puede ser su propia categoría padre',
        );
      }

      // Una raíz sigue siendo raíz y una subcategoría sigue siendo
      // subcategoría (C-9). Con códigos automáticos, cambiar de nivel
      // dejaría una URL sin sentido (una raíz llamada ITSP-02-03, o al
      // revés). Una subcategoría sí puede moverse bajo cualquier otra
      // categoría, raíz o no.
      const esRaiz = categoria.idCategoriaPadre === null;
      if (esRaiz !== (nuevoPadre === null)) {
        throw new CategoriaPadreInvalidaException(MENSAJE_CAMBIO_DE_NIVEL);
      }

      if (nuevoPadre !== null && nuevoPadre !== categoria.idCategoriaPadre) {
        await this.validarMovimiento(categoria.idCategoriaItsp, nuevoPadre);
        idPadreNuevo = nuevoPadre;
      }
    }

    // También se revisa el nombre cuando cambia el padre: el nombre pudo no
    // cambiar, pero el grupo de hermanas contra el que compite sí.
    const nombre = dto.nombre !== undefined ? dto.nombre.trim() : categoria.nombre;
    if (nombre !== categoria.nombre || idPadreNuevo !== null) {
      await this.verificarNombreDisponibleEntreHermanas(
        nombre,
        idPadreNuevo ?? categoria.idCategoriaPadre,
        categoria.idCategoriaItsp,
      );
    }
    categoria.nombre = nombre;

    if (dto.descripcion !== undefined) {
      categoria.descripcion = this.normalizarTexto(dto.descripcion);
    }

    if (dto.orden !== undefined) {
      categoria.orden = dto.orden;
    }

    let cambiosDescendientes: CambioDeCodigo[] = [];
    if (idPadreNuevo !== null) {
      cambiosDescendientes = await this.moverConSubarbol(categoria, idPadreNuevo, codigoAnterior);
    } else {
      await this.repositorioCategorias.save(categoria);
    }

    await this.registrarEnBitacora('ACTUALIZAR', categoria, usuarioAutenticado, {
      camposActualizados: Object.keys(dto),
      ...(categoria.codigo !== codigoAnterior
        ? {
            codigoAnterior,
            codigoNuevo: categoria.codigo,
            // Cuántas direcciones públicas dejan de valer: la propia y las
            // de sus descendientes (spec D-17).
            cantidadUrlCambiadas: 1 + cambiosDescendientes.length,
            ...detallarCambiosDescendientes(cambiosDescendientes),
          }
        : {}),
    });

    return this.obtener(categoria.idCategoriaItsp);
  }

  // Regla #1: nunca eliminación física, sólo estado -> INACTIVO. Los
  // descendientes de una categoría inactiva conservan su propio estado; al
  // quedar ella fuera del árbol activo dejan de ser alcanzables (estado
  // efectivo, spec D-5), y reactivarla los devuelve tal como estaban.
  async cambiarEstado(
    id: number,
    nuevoEstado: 'ACTIVO' | 'INACTIVO',
    usuarioAutenticado: PayloadJwt,
  ): Promise<CategoriaItspRespuestaDto> {
    const categoria = await this.buscarPorId(id);
    categoria.estado = nuevoEstado;
    await this.repositorioCategorias.save(categoria);

    await this.registrarEnBitacora(
      nuevoEstado === 'INACTIVO' ? 'INACTIVAR' : 'REACTIVAR',
      categoria,
      usuarioAutenticado,
    );

    return this.obtener(categoria.idCategoriaItsp);
  }

  // ---------- Apoyo interno ----------

  private async buscarPorId(id: number): Promise<CategoriaItsp> {
    const categoria = await this.repositorioCategorias.findOne({ where: { idCategoriaItsp: id } });
    if (!categoria) {
      throw new RegistroCatalogoNoEncontradoException(ETIQUETA_SINGULAR);
    }
    return categoria;
  }

  /**
   * Valida el padre de una categoría nueva y devuelve el nivel que tendrá.
   * `null` es válido (la categoría es raíz, nivel 1); si viene un id, debe
   * existir y dejar espacio bajo el tope de profundidad.
   */
  private async validarPadreParaCrear(idCategoriaPadre: number | null): Promise<number> {
    if (idCategoriaPadre === null) return 1;

    const jerarquia = new JerarquiaCategorias(await this.repositorioCategorias.find());
    if (!jerarquia.obtener(idCategoriaPadre)) {
      throw new CategoriaPadreInvalidaException('La categoría padre seleccionada no existe');
    }

    // La profundidad sale de la cadena de padres, no de la columna `nivel`:
    // si alguna fila tuviera un nivel guardado inconsistente, el tope se
    // seguiría respetando.
    const nivel = jerarquia.profundidad(idCategoriaPadre) + 1;
    if (nivel > PROFUNDIDAD_MAXIMA_CATEGORIAS) {
      throw new CategoriaPadreInvalidaException(mensajeProfundidad(nivel));
    }
    return nivel;
  }

  /**
   * Reglas para mover una subcategoría (con su subárbol) bajo otra
   * categoría (spec §7.3): el destino existe, no está dentro de lo que se
   * mueve, el subárbol entero cabe bajo el tope, y no se lleva documentos
   * al subárbol de Participación ciudadana (D-7).
   */
  private async validarMovimiento(idMovida: number, idPadreNuevo: number): Promise<void> {
    const jerarquia = new JerarquiaCategorias(await this.repositorioCategorias.find());

    if (!jerarquia.obtener(idPadreNuevo)) {
      throw new CategoriaPadreInvalidaException('La categoría padre seleccionada no existe');
    }

    if (jerarquia.estaEnSubarbol(idPadreNuevo, idMovida)) {
      throw new CategoriaPadreInvalidaException(MENSAJE_CICLO);
    }

    const niveles = jerarquia.profundidad(idPadreNuevo) + jerarquia.altura(idMovida);
    if (niveles > PROFUNDIDAD_MAXIMA_CATEGORIAS) {
      throw new CategoriaPadreInvalidaException(mensajeProfundidad(niveles));
    }

    if (jerarquia.enSubarbolExcluido(idPadreNuevo) && !jerarquia.enSubarbolExcluido(idMovida)) {
      const ids = [
        idMovida,
        ...jerarquia.descendientes(idMovida).map((categoria) => categoria.idCategoriaItsp),
      ];
      const documentos = await this.repositorioDocumentos.count({
        where: { idCategoriaItsp: In(ids) },
      });
      if (documentos > 0) {
        throw new CategoriaPadreInvalidaException(MENSAJE_EXCLUIDA_CON_DOCUMENTOS);
      }
    }
  }

  /**
   * Mueve la categoría bajo su padre nuevo y recalcula el código y el nivel
   * de todo su subárbol, en una transacción con reintento por colisión
   * (spec C-8). Devuelve los códigos de descendientes que cambiaron.
   *
   * Lo que se guarda son copias: si un intento falla y se reintenta, las
   * entidades leídas no quedan a medio modificar.
   */
  private async moverConSubarbol(
    categoria: CategoriaItsp,
    idPadreNuevo: number,
    codigoAnterior: string,
  ): Promise<CambioDeCodigo[]> {
    const id = categoria.idCategoriaItsp;

    const resultado = await this.conCodigoAsignado(async (repositorio) => {
      const jerarquia = new JerarquiaCategorias(await repositorio.find());
      const padre = jerarquia.obtener(idPadreNuevo) as CategoriaItsp;

      const codigoNuevo = siguienteCodigoHija(
        padre.codigo,
        jerarquia
          .hijos(idPadreNuevo)
          .filter((hija) => hija.idCategoriaItsp !== id)
          .map((hija) => hija.codigo),
      );

      const descendientes = jerarquia.descendientes(id);
      const codigosNuevos = recodificarSubarbol(
        id,
        codigoAnterior,
        codigoNuevo,
        descendientes.map((descendiente) => ({
          id: descendiente.idCategoriaItsp,
          idPadre: descendiente.idCategoriaPadre as number,
          codigo: descendiente.codigo,
        })),
      );

      this.verificarLongitudCodigo(codigoNuevo);
      for (const codigo of codigosNuevos.values()) this.verificarLongitudCodigo(codigo);

      // El nivel se recalcula aunque el código no cambie: el subárbol
      // entero sube o baja tantos niveles como la categoría movida.
      const nivelNuevo = jerarquia.profundidad(idPadreNuevo) + 1;
      const desplazamiento = nivelNuevo - jerarquia.profundidad(id);

      const cambios: CambioDeCodigo[] = [];
      const filas: CategoriaItsp[] = [
        { ...categoria, idCategoriaPadre: idPadreNuevo, codigo: codigoNuevo, nivel: nivelNuevo },
      ];
      for (const descendiente of descendientes) {
        const codigo = codigosNuevos.get(descendiente.idCategoriaItsp) as string;
        if (codigo !== descendiente.codigo) {
          cambios.push({
            id: descendiente.idCategoriaItsp,
            codigoAnterior: descendiente.codigo,
            codigoNuevo: codigo,
          });
        }
        filas.push({
          ...descendiente,
          codigo,
          nivel: jerarquia.profundidad(descendiente.idCategoriaItsp) + desplazamiento,
        });
      }

      await repositorio.save(filas);
      return { codigoNuevo, nivelNuevo, cambios };
    });

    categoria.idCategoriaPadre = idPadreNuevo;
    categoria.codigo = resultado.codigoNuevo;
    categoria.nivel = resultado.nivelNuevo;
    return resultado.cambios;
  }

  /**
   * El nombre se exige único entre hermanas, no en toda la tabla: dos
   * categorías distintas pueden tener cada una una hija llamada
   * "Información".
   */
  private async verificarNombreDisponibleEntreHermanas(
    nombre: string,
    idCategoriaPadre: number | null,
    idCategoriaExcluida: number | null,
  ): Promise<void> {
    const todas = await this.repositorioCategorias.find();

    const duplicada = todas.some(
      (otra) =>
        otra.idCategoriaPadre === idCategoriaPadre &&
        otra.idCategoriaItsp !== idCategoriaExcluida &&
        otra.nombre.toLowerCase() === nombre.toLowerCase(),
    );

    if (duplicada) {
      throw new NombreCatalogoDuplicadoException(ETIQUETA_INDEFINIDA);
    }
  }

  /**
   * Siguiente código para una categoría nueva con ese padre, contando
   * activas e inactivas (inactivar no libera el número, RN-3). Se leen
   * todas las filas, como en `verificarNombreDisponibleEntreHermanas`: son
   * decenas. El padre ya viene validado por `validarPadreParaCrear`.
   */
  private async calcularSiguienteCodigo(
    repositorio: Repository<CategoriaItsp>,
    idCategoriaPadre: number | null,
  ): Promise<string> {
    const todas = await repositorio.find();

    if (idCategoriaPadre === null) {
      return siguienteCodigoRaiz(
        todas.filter((otra) => otra.idCategoriaPadre === null).map((raiz) => raiz.codigo),
      );
    }

    const codigoPadre =
      todas.find((otra) => otra.idCategoriaItsp === idCategoriaPadre)?.codigo.trim() ?? '';
    if (codigoPadre === '') {
      // Sólo antes de la migración 10, que rellena los códigos vacíos.
      throw new CategoriaPadreInvalidaException(
        'La categoría padre no tiene código; no se puede numerar la subcategoría',
      );
    }

    return siguienteCodigoHija(
      codigoPadre,
      todas.filter((otra) => otra.idCategoriaPadre === idCategoriaPadre).map((hija) => hija.codigo),
    );
  }

  /**
   * Con códigos de dos dígitos, 10 niveles caben con holgura en la columna
   * (34 caracteres). Solo una raíz con un código irregular muy largo podría
   * pasarse; entonces se responde 400 en vez de dejar que falle la base.
   */
  private verificarLongitudCodigo(codigo: string): void {
    if (codigo.length > LONGITUD_MAXIMA_CODIGO_CATEGORIA) {
      throw new CategoriaPadreInvalidaException(
        `El código resultante supera los ${LONGITUD_MAXIMA_CODIGO_CATEGORIA} caracteres; elija otra categoría superior`,
      );
    }
  }

  /**
   * Lee el máximo y escribe dentro de una transacción, y reintenta si otra
   * persona se llevó el mismo número entre medio (spec §7.2). El índice
   * único es la garantía; no hace falta `SELECT ... FOR UPDATE`.
   */
  private async conCodigoAsignado<T>(
    operacion: (repositorio: Repository<CategoriaItsp>) => Promise<T>,
  ): Promise<T> {
    for (let intento = 1; ; intento++) {
      try {
        return await this.repositorioCategorias.manager.transaction((gestor) =>
          operacion(gestor.getRepository(CategoriaItsp)),
        );
      } catch (error) {
        if (!esCodigoDuplicado(error)) throw error;
        if (intento >= INTENTOS_ASIGNACION_CODIGO) {
          throw new CodigoCategoriaNoAsignadoException();
        }
      }
    }
  }

  /** Cadena vacía se guarda como NULL, no como texto en blanco. */
  private normalizarTexto(valor?: string | null): string | null {
    const texto = (valor ?? '').trim();
    return texto === '' ? null : texto;
  }

  private mapearFila(
    categoria: CategoriaItsp,
    nombreCategoriaPadre: string | null,
  ): CategoriaItspRespuestaDto {
    return new CategoriaItspRespuestaDto({
      id: categoria.idCategoriaItsp,
      codigo: categoria.codigo,
      nombre: categoria.nombre,
      descripcion: categoria.descripcion,
      nivel: categoria.nivel,
      orden: categoria.orden,
      estado: categoria.estado as 'ACTIVO' | 'INACTIVO',
      idCategoriaPadre: categoria.idCategoriaPadre,
      nombreCategoriaPadre,
    });
  }

  private mapearNodo(
    categoria: CategoriaItsp,
    hijos: CategoriaItspNodoArbolDto[],
  ): CategoriaItspNodoArbolDto {
    return new CategoriaItspNodoArbolDto({
      id: categoria.idCategoriaItsp,
      codigo: categoria.codigo,
      nombre: categoria.nombre,
      descripcion: categoria.descripcion,
      nivel: categoria.nivel,
      orden: categoria.orden,
      estado: categoria.estado as 'ACTIVO' | 'INACTIVO',
      hijos,
    });
  }

  private async registrarEnBitacora(
    prefijoAccion: string,
    categoria: CategoriaItsp,
    usuarioAutenticado: PayloadJwt,
    detalles?: Record<string, unknown>,
  ): Promise<void> {
    await this.bitacoraService.registrar({
      idUsuario: usuarioAutenticado.idUsuario,
      accion: `${prefijoAccion}_CATEGORIA_ITSP`,
      entidad: ENTIDAD_BITACORA,
      idRegistro: categoria.idCategoriaItsp,
      resultado: 'EXITO',
      detalles,
    });
  }
}
