// src/catalogos/categorias-itsp.service.ts
//
// La taxonomía ITSP es jerárquica de exactamente dos niveles: categorías
// raíz (nivel 1) y sus subsecciones (nivel 2). Ese límite no es decorativo:
// el formulario de registro de documento (Fase 6) la consume con dos
// selects en cascada, así que un tercer nivel no tendría dónde mostrarse.
// Por eso el nivel nunca lo envía el cliente, lo deriva este servicio del
// padre, y las formas de romper la jerarquía se rechazan explícitamente
// (ver `resolverPadre` y `actualizar`).

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CategoriaItsp } from '../entidades/categoria-itsp.entidad';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import { CrearCategoriaItspDto } from './dto/crear-categoria-itsp.dto';
import { ActualizarCategoriaItspDto } from './dto/actualizar-categoria-itsp.dto';
import { FiltrosCatalogoDto } from './dto/filtros-catalogo.dto';
import {
  CategoriaItspNodoArbolDto,
  CategoriaItspRespuestaDto,
} from './dto/categoria-itsp-respuesta.dto';
import {
  CategoriaPadreInvalidaException,
  CodigoCategoriaDuplicadoException,
  NombreCatalogoDuplicadoException,
  RegistroCatalogoNoEncontradoException,
} from '../comun/excepciones/excepciones-catalogos';

const ETIQUETA_SINGULAR = 'Categoría ITSP';
const ETIQUETA_INDEFINIDA = 'una categoría';
const ENTIDAD_BITACORA = 'categorias_itsp';

@Injectable()
export class CategoriasItspService {
  constructor(
    @InjectRepository(CategoriaItsp)
    private readonly repositorioCategorias: Repository<CategoriaItsp>,
    private readonly bitacoraService: BitacoraService,
  ) {}

  /**
   * Lista plana, pero ya en orden de despliegue: cada raíz seguida de sus
   * subsecciones. Así la tabla sólo tiene que indentar según `nivel`, sin
   * reordenar nada en el cliente.
   */
  async listar(filtros: FiltrosCatalogoDto = {}): Promise<CategoriaItspRespuestaDto[]> {
    const todas = await this.repositorioCategorias.find();
    const nombresPorId = new Map(todas.map((c) => [c.idCategoriaItsp, c.nombre]));

    // El filtro se aplica DESPUÉS de ordenar, sobre el conjunto completo:
    // si se ordenara sólo lo filtrado, una subsección cuyo padre no coincide
    // con la búsqueda perdería su posición en la jerarquía.
    const ordenadas = this.ordenarJerarquicamente(todas);
    const termino = filtros.nombre?.trim().toLowerCase();

    return ordenadas
      .filter((categoria) => {
        if (filtros.estado && categoria.estado !== filtros.estado) return false;
        if (termino && !categoria.nombre.toLowerCase().includes(termino)) return false;
        return true;
      })
      .map(
        (categoria) =>
          new CategoriaItspRespuestaDto({
            id: categoria.idCategoriaItsp,
            codigo: categoria.codigo,
            nombre: categoria.nombre,
            descripcion: categoria.descripcion,
            nivel: categoria.nivel,
            orden: categoria.orden,
            estado: categoria.estado as 'ACTIVO' | 'INACTIVO',
            idCategoriaPadre: categoria.idCategoriaPadre,
            nombreCategoriaPadre:
              categoria.idCategoriaPadre !== null
                ? (nombresPorId.get(categoria.idCategoriaPadre) ?? null)
                : null,
          }),
      );
  }

  /**
   * Jerarquía agrupada por raíz, con las subsecciones anidadas en `hijos`.
   * Es la forma que consumirán los selects en cascada de Fase 6 (elegir
   * raíz -> el segundo select muestra sus hijos), por lo que devuelve el
   * árbol ya armado y no una lista plana de dos niveles.
   *
   * El filtro `estado` permite pedir sólo lo activo sin tocar el endpoint:
   * poda tanto raíces como subsecciones inactivas. Una subsección cuya raíz
   * quedó podada no aparece suelta: el árbol siempre cuelga de una raíz.
   */
  async obtenerArbol(filtros: FiltrosCatalogoDto = {}): Promise<CategoriaItspNodoArbolDto[]> {
    const todas = await this.repositorioCategorias.find();

    const visibles = filtros.estado
      ? todas.filter((categoria) => categoria.estado === filtros.estado)
      : todas;

    const raices = this.ordenarPorOrdenYNombre(
      visibles.filter((categoria) => categoria.idCategoriaPadre === null),
    );

    return raices.map((raiz) => {
      const hijos = this.ordenarPorOrdenYNombre(
        visibles.filter((categoria) => categoria.idCategoriaPadre === raiz.idCategoriaItsp),
      );

      return this.mapearNodo(
        raiz,
        hijos.map((hijo) => this.mapearNodo(hijo, [])),
      );
    });
  }

  async obtener(id: number): Promise<CategoriaItspRespuestaDto> {
    const categoria = await this.buscarPorId(id);
    const padre =
      categoria.idCategoriaPadre !== null
        ? await this.repositorioCategorias.findOne({
            where: { idCategoriaItsp: categoria.idCategoriaPadre },
          })
        : null;

    return new CategoriaItspRespuestaDto({
      id: categoria.idCategoriaItsp,
      codigo: categoria.codigo,
      nombre: categoria.nombre,
      descripcion: categoria.descripcion,
      nivel: categoria.nivel,
      orden: categoria.orden,
      estado: categoria.estado as 'ACTIVO' | 'INACTIVO',
      idCategoriaPadre: categoria.idCategoriaPadre,
      nombreCategoriaPadre: padre?.nombre ?? null,
    });
  }

  async crear(
    dto: CrearCategoriaItspDto,
    usuarioAutenticado: PayloadJwt,
  ): Promise<CategoriaItspRespuestaDto> {
    const nombre = dto.nombre.trim();
    const idCategoriaPadre = dto.idCategoriaPadre ?? null;

    await this.resolverPadre(idCategoriaPadre);
    await this.verificarNombreDisponibleEntreHermanas(nombre, idCategoriaPadre, null);

    const codigo = this.normalizarTexto(dto.codigo);
    await this.verificarCodigoDisponible(codigo, null);

    const nuevaCategoria = this.repositorioCategorias.create({
      nombre,
      codigo,
      descripcion: this.normalizarTexto(dto.descripcion),
      idCategoriaPadre,
      // Derivado, nunca recibido: sin padre es raíz, con padre es subsección.
      nivel: idCategoriaPadre === null ? 1 : 2,
      orden: dto.orden ?? 0,
      estado: 'ACTIVO',
    });

    const guardada = await this.repositorioCategorias.save(nuevaCategoria);

    await this.registrarEnBitacora('CREAR', guardada, usuarioAutenticado, { nombre, codigo });

    return this.obtener(guardada.idCategoriaItsp);
  }

  async actualizar(
    id: number,
    dto: ActualizarCategoriaItspDto,
    usuarioAutenticado: PayloadJwt,
  ): Promise<CategoriaItspRespuestaDto> {
    const categoria = await this.buscarPorId(id);

    if (dto.idCategoriaPadre !== undefined) {
      const nuevoPadre = dto.idCategoriaPadre ?? null;

      if (nuevoPadre === categoria.idCategoriaItsp) {
        throw new CategoriaPadreInvalidaException(
          'Una categoría no puede ser su propia categoría padre',
        );
      }

      if (nuevoPadre !== null) {
        // Si esta categoría ya tiene subsecciones, colgarla de otra
        // produciría un tercer nivel: raíz -> esta -> sus subsecciones.
        const cantidadHijas = await this.repositorioCategorias.count({
          where: { idCategoriaPadre: categoria.idCategoriaItsp },
        });

        if (cantidadHijas > 0) {
          throw new CategoriaPadreInvalidaException(
            'No se puede asignar una categoría padre a una categoría que ya tiene subsecciones',
          );
        }
      }

      await this.resolverPadre(nuevoPadre);

      categoria.idCategoriaPadre = nuevoPadre;
      categoria.nivel = nuevoPadre === null ? 1 : 2;
    }

    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      // También se revisa cuando cambió el padre: el nombre pudo no cambiar,
      // pero el grupo de hermanas contra el que compite sí.
      if (nombre !== categoria.nombre || dto.idCategoriaPadre !== undefined) {
        await this.verificarNombreDisponibleEntreHermanas(
          nombre,
          categoria.idCategoriaPadre,
          categoria.idCategoriaItsp,
        );
      }
      categoria.nombre = nombre;
    }

    if (dto.codigo !== undefined) {
      const codigo = this.normalizarTexto(dto.codigo);
      await this.verificarCodigoDisponible(codigo, categoria.idCategoriaItsp);
      categoria.codigo = codigo;
    }

    if (dto.descripcion !== undefined) {
      categoria.descripcion = this.normalizarTexto(dto.descripcion);
    }

    if (dto.orden !== undefined) {
      categoria.orden = dto.orden;
    }

    await this.repositorioCategorias.save(categoria);

    await this.registrarEnBitacora('ACTUALIZAR', categoria, usuarioAutenticado, {
      camposActualizados: Object.keys(dto),
    });

    return this.obtener(categoria.idCategoriaItsp);
  }

  // Regla #1: nunca eliminación física, sólo estado -> INACTIVO. Las
  // subsecciones de una raíz inactiva conservan su propio estado; al quedar
  // la raíz fuera del árbol dejan de ser alcanzables desde los selects en
  // cascada, y reactivar la raíz las devuelve tal como estaban.
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
   * Valida el padre solicitado. `null` es válido (la categoría es raíz); si
   * viene un id, debe existir y ser a su vez una raíz, porque colgar de una
   * subsección crearía el tercer nivel que la jerarquía no admite.
   */
  private async resolverPadre(idCategoriaPadre: number | null): Promise<CategoriaItsp | null> {
    if (idCategoriaPadre === null) return null;

    const padre = await this.repositorioCategorias.findOne({
      where: { idCategoriaItsp: idCategoriaPadre },
    });

    if (!padre) {
      throw new CategoriaPadreInvalidaException('La categoría padre seleccionada no existe');
    }

    if (padre.idCategoriaPadre !== null) {
      throw new CategoriaPadreInvalidaException(
        'Sólo una categoría raíz puede ser categoría padre: la jerarquía ITSP admite dos niveles',
      );
    }

    return padre;
  }

  /**
   * El nombre se exige único entre hermanas, no en toda la tabla: dos raíces
   * distintas pueden tener cada una una subsección llamada "Información".
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

  private async verificarCodigoDisponible(
    codigo: string | null,
    idCategoriaExcluida: number | null,
  ): Promise<void> {
    if (codigo === null) return;

    const existente = await this.repositorioCategorias.findOne({ where: { codigo } });

    if (existente && existente.idCategoriaItsp !== idCategoriaExcluida) {
      throw new CodigoCategoriaDuplicadoException();
    }
  }

  /** Cadena vacía se guarda como NULL, no como texto en blanco. */
  private normalizarTexto(valor?: string | null): string | null {
    const texto = (valor ?? '').trim();
    return texto === '' ? null : texto;
  }

  private ordenarPorOrdenYNombre(categorias: CategoriaItsp[]): CategoriaItsp[] {
    return [...categorias].sort(
      (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'),
    );
  }

  private ordenarJerarquicamente(categorias: CategoriaItsp[]): CategoriaItsp[] {
    const raices = this.ordenarPorOrdenYNombre(
      categorias.filter((categoria) => categoria.idCategoriaPadre === null),
    );

    const ordenadas: CategoriaItsp[] = [];
    for (const raiz of raices) {
      ordenadas.push(raiz);
      ordenadas.push(
        ...this.ordenarPorOrdenYNombre(
          categorias.filter((categoria) => categoria.idCategoriaPadre === raiz.idCategoriaItsp),
        ),
      );
    }

    // Una subsección huérfana (su raíz fue borrada a mano en la base) no
    // debe desaparecer de la administración: se agrega al final para que
    // siga siendo visible y corregible.
    const yaIncluidas = new Set(ordenadas.map((categoria) => categoria.idCategoriaItsp));
    ordenadas.push(
      ...this.ordenarPorOrdenYNombre(
        categorias.filter((categoria) => !yaIncluidas.has(categoria.idCategoriaItsp)),
      ),
    );

    return ordenadas;
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
