// src/roles/roles.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Rol } from '../entidades/rol.entidad';
import { Permiso } from '../entidades/permiso.entidad';
import { RolRespuestaDto } from './dto/rol-respuesta.dto';
import { PermisoRespuestaDto } from './dto/permiso-respuesta.dto';
import { PermisosPorRolRespuestaDto } from './dto/permisos-por-rol-respuesta.dto';
import { CachePermisosService } from '../comun/cache/cache-permisos.service';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';
import {
  RolNoEncontradoException,
  PermisoDenegadoException,
} from '../comun/excepciones/excepciones-autenticacion';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Rol)
    private readonly repositorioRoles: Repository<Rol>,
    @InjectRepository(Permiso)
    private readonly repositorioPermisos: Repository<Permiso>,
    private readonly cachePermisos: CachePermisosService,
    private readonly bitacoraService: BitacoraService,
  ) {}

  async listarRoles(): Promise<RolRespuestaDto[]> {
    const roles = await this.repositorioRoles.find({ order: { nombre: 'ASC' } });
    return roles.map(
      (rol) => new RolRespuestaDto({ idRol: rol.idRol, nombre: rol.nombre, descripcion: rol.descripcion }),
    );
  }

  async listarPermisos(): Promise<PermisoRespuestaDto[]> {
    const permisos = await this.repositorioPermisos.find({ order: { nombre: 'ASC' } });
    return permisos.map(
      (permiso) =>
        new PermisoRespuestaDto({
          idPermiso: permiso.idPermiso,
          nombre: permiso.nombre,
          descripcion: permiso.descripcion,
        }),
    );
  }

  async obtenerPermisosPorRol(idRol: number): Promise<PermisosPorRolRespuestaDto> {
    const rol = await this.repositorioRoles.findOne({ where: { idRol }, relations: { permisos: true } });
    if (!rol) {
      throw new RolNoEncontradoException();
    }

    // El catalogo completo se trae siempre entero (9 permisos, catalogo
    // chico) para poder marcar `asignado` incluso en los que el rol NO
    // tiene, y asi el frontend arma la matriz completa por modulo.
    const catalogoCompleto = await this.repositorioPermisos.find({ order: { nombre: 'ASC' } });
    const idsAsignados = new Set(rol.permisos.map((permiso) => permiso.idPermiso));

    return new PermisosPorRolRespuestaDto({
      idRol: rol.idRol,
      permisos: catalogoCompleto.map((permiso) => ({
        idPermiso: permiso.idPermiso,
        nombre: permiso.nombre,
        descripcion: permiso.descripcion,
        asignado: idsAsignados.has(permiso.idPermiso),
      })),
    });
  }

  // RF-14 / RF-15 / RF-20 — Solo Superadministrador puede modificar la
  // matriz, y cada cambio se audita en bitacora_logs.
  async actualizarPermisosDeRol(
    idRol: number,
    idsPermisos: number[],
    usuarioAutenticado: PayloadJwt,
  ): Promise<PermisosPorRolRespuestaDto> {
    if (usuarioAutenticado.nombreRol !== 'Superadministrador') {
      throw new PermisoDenegadoException();
    }

    const rol = await this.repositorioRoles.findOne({ where: { idRol }, relations: { permisos: true } });
    if (!rol) {
      throw new RolNoEncontradoException();
    }

    // Valida que los ids recibidos existan realmente en el catalogo.
    const permisosValidos = await this.repositorioPermisos.findBy({ idPermiso: In(idsPermisos) });
    const idsValidos = permisosValidos.map((permiso) => permiso.idPermiso);

    const idsActuales = rol.permisos.map((permiso) => permiso.idPermiso);
    const idsAAgregar = idsValidos.filter((id) => !idsActuales.includes(id));
    const idsAQuitar = idsActuales.filter((id) => !idsValidos.includes(id));

    const relacionRolPermisos = this.repositorioRoles.manager.connection
      .createQueryBuilder()
      .relation(Rol, 'permisos')
      .of(idRol);

    if (idsAAgregar.length > 0) {
      await relacionRolPermisos.add(idsAAgregar);
    }
    if (idsAQuitar.length > 0) {
      await relacionRolPermisos.remove(idsAQuitar);
    }

    // Invalida la cache de permisos efectivos (Seccion 13): la proxima
    // vez que se resuelva este rol se recalcula desde la BD.
    this.cachePermisos.invalidar(idRol);

    await this.bitacoraService.registrar({
      idUsuario: usuarioAutenticado.idUsuario,
      accion: 'ACTUALIZAR_PERMISOS_ROL',
      entidad: 'roles_permisos',
      idRegistro: idRol,
      resultado: 'EXITO',
      detalles: { idsPermisosAsignados: idsValidos },
    });

    return this.obtenerPermisosPorRol(idRol);
  }
}