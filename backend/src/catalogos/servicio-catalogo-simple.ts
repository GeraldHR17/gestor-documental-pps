// src/catalogos/servicio-catalogo-simple.ts
//
// Tipos de documento, dependencias y etiquetas son el mismo catálogo tres
// veces: nombre único, alta, edición, inactivación lógica y bitácora. Sólo
// cambian la tabla, el nombre de su llave primaria, si llevan descripción y
// el sufijo de la acción de bitácora. Esa parte variable se declara en la
// configuración que cada servicio pasa al constructor; el ciclo de vida
// vive una sola vez aquí, para que las tres no puedan divergir con el
// tiempo (que fue justo el riesgo con las validaciones de usuarios).
//
// Las categorías ITSP NO usan esta base: son jerárquicas y tienen reglas
// propias, así que tienen su propio servicio.

import { DeepPartial, FindOptionsWhere, Like, ObjectLiteral, Repository } from 'typeorm';

import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import { CatalogoRespuestaDto } from './dto/catalogo-respuesta.dto';
import { FiltrosCatalogoDto } from './dto/filtros-catalogo.dto';
import {
  NombreCatalogoDuplicadoException,
  RegistroCatalogoNoEncontradoException,
} from '../comun/excepciones/excepciones-catalogos';

/** Forma mínima que comparten las tres entidades planas. */
export interface RegistroCatalogoSimple extends ObjectLiteral {
  nombre: string;
  estado: string;
  /** Ausente en `etiquetas`, que no tiene la columna. */
  descripcion?: string | null;
}

export interface DatosCatalogoSimple {
  nombre?: string;
  descripcion?: string;
}

export interface ConfiguracionCatalogoSimple {
  /** Propiedad de la llave primaria en la entidad, ej. 'idTipoDocumento'. */
  propiedadId: string;
  /** Tabla, tal como se guarda en la columna `entidad` de la bitácora. */
  entidadBitacora: string;
  /** Sufijo de las acciones: CREAR_<sufijo>, ACTUALIZAR_<sufijo>, INACTIVAR_<sufijo>. */
  sufijoAccion: string;
  /** Cómo se nombra un registro en los mensajes de error, ej. 'un tipo de documento'. */
  etiquetaIndefinida: string;
  /** Cómo se nombra en el 404, ej. 'Tipo de documento'. */
  etiquetaSingular: string;
  /** `false` en etiquetas: cualquier descripción recibida se ignora. */
  admiteDescripcion: boolean;
}

export abstract class ServicioCatalogoSimple<T extends RegistroCatalogoSimple> {
  protected constructor(
    protected readonly repositorio: Repository<T>,
    protected readonly bitacoraService: BitacoraService,
    protected readonly configuracion: ConfiguracionCatalogoSimple,
  ) {}

  async listar(filtros: FiltrosCatalogoDto = {}): Promise<CatalogoRespuestaDto[]> {
    const condiciones: ObjectLiteral = {};
    if (filtros.nombre) {
      condiciones.nombre = Like(`%${filtros.nombre}%`);
    }
    if (filtros.estado) {
      condiciones.estado = filtros.estado;
    }

    const registros = await this.repositorio.find({
      where: condiciones as FindOptionsWhere<T>,
      order: { nombre: 'ASC' } as never,
    });

    return registros.map((registro) => this.mapear(registro));
  }

  async obtener(id: number): Promise<CatalogoRespuestaDto> {
    return this.mapear(await this.buscarPorId(id));
  }

  async crear(datos: DatosCatalogoSimple, usuarioAutenticado: PayloadJwt): Promise<CatalogoRespuestaDto> {
    const nombre = (datos.nombre ?? '').trim();
    await this.verificarNombreDisponible(nombre);

    const nuevoRegistro = this.repositorio.create({
      nombre,
      estado: 'ACTIVO',
      ...(this.configuracion.admiteDescripcion
        ? { descripcion: this.normalizarDescripcion(datos.descripcion) }
        : {}),
      // Sin el cast, TypeScript elige la sobrecarga de `create` que
      // recibe un arreglo y devuelve T[] en vez de T.
    } as DeepPartial<T>);

    const guardado = await this.repositorio.save(nuevoRegistro);

    await this.registrarEnBitacora('CREAR', guardado, usuarioAutenticado, { nombre });

    return this.mapear(guardado);
  }

  async actualizar(
    id: number,
    datos: DatosCatalogoSimple,
    usuarioAutenticado: PayloadJwt,
  ): Promise<CatalogoRespuestaDto> {
    const registro = await this.buscarPorId(id);

    if (datos.nombre !== undefined) {
      const nombre = datos.nombre.trim();
      if (nombre !== registro.nombre) {
        await this.verificarNombreDisponible(nombre);
      }
      registro.nombre = nombre;
    }

    if (this.configuracion.admiteDescripcion && datos.descripcion !== undefined) {
      registro.descripcion = this.normalizarDescripcion(datos.descripcion);
    }

    const guardado = await this.repositorio.save(registro);

    await this.registrarEnBitacora('ACTUALIZAR', guardado, usuarioAutenticado, {
      camposActualizados: Object.keys(datos),
    });

    return this.mapear(guardado);
  }

  // Regla #1: nunca eliminación física, sólo estado -> INACTIVO.
  async cambiarEstado(
    id: number,
    nuevoEstado: 'ACTIVO' | 'INACTIVO',
    usuarioAutenticado: PayloadJwt,
  ): Promise<CatalogoRespuestaDto> {
    const registro = await this.buscarPorId(id);
    registro.estado = nuevoEstado;

    const guardado = await this.repositorio.save(registro);

    await this.registrarEnBitacora(
      nuevoEstado === 'INACTIVO' ? 'INACTIVAR' : 'REACTIVAR',
      guardado,
      usuarioAutenticado,
    );

    return this.mapear(guardado);
  }

  // ---------- Apoyo interno ----------

  protected obtenerId(registro: T): number {
    return registro[this.configuracion.propiedadId] as number;
  }

  private async buscarPorId(id: number): Promise<T> {
    // La llave primaria cambia por catálogo (idTipoDocumento, idDependencia,
    // idEtiqueta), así que la condición se arma con el nombre configurado;
    // TypeORM no puede tipar eso de forma genérica, de ahí el cast.
    const registro = await this.repositorio.findOne({
      where: { [this.configuracion.propiedadId]: id } as FindOptionsWhere<T>,
    });

    if (!registro) {
      throw new RegistroCatalogoNoEncontradoException(this.configuracion.etiquetaSingular);
    }

    return registro;
  }

  private async verificarNombreDisponible(nombre: string): Promise<void> {
    const existente = await this.repositorio.findOne({
      where: { nombre } as FindOptionsWhere<T>,
    });

    if (existente) {
      throw new NombreCatalogoDuplicadoException(this.configuracion.etiquetaIndefinida);
    }
  }

  /** Una descripción vacía se guarda como NULL, no como cadena en blanco. */
  private normalizarDescripcion(descripcion?: string): string | null {
    const texto = (descripcion ?? '').trim();
    return texto === '' ? null : texto;
  }

  private async registrarEnBitacora(
    prefijoAccion: string,
    registro: T,
    usuarioAutenticado: PayloadJwt,
    detalles?: Record<string, unknown>,
  ): Promise<void> {
    await this.bitacoraService.registrar({
      idUsuario: usuarioAutenticado.idUsuario,
      accion: `${prefijoAccion}_${this.configuracion.sufijoAccion}`,
      entidad: this.configuracion.entidadBitacora,
      idRegistro: this.obtenerId(registro),
      resultado: 'EXITO',
      detalles,
    });
  }

  private mapear(registro: T): CatalogoRespuestaDto {
    return new CatalogoRespuestaDto({
      id: this.obtenerId(registro),
      nombre: registro.nombre,
      descripcion: this.configuracion.admiteDescripcion ? (registro.descripcion ?? null) : null,
      estado: registro.estado as 'ACTIVO' | 'INACTIVO',
    });
  }
}
