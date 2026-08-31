// src/usuarios/usuarios.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

import { Usuario } from '../entidades/usuario.entidad';
import { Rol } from '../entidades/rol.entidad';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { FiltrosUsuariosDto } from './dto/filtros-usuarios.dto';
import { UsuarioResumenRespuestaDto } from './dto/usuario-resumen-respuesta.dto';
import { ListaPaginadaUsuariosRespuestaDto } from './dto/lista-paginada-usuarios-respuesta.dto';
import type { PayloadJwt } from '../autenticacion/estrategias/jwt.strategy';

import {
  CorreoYaRegistradoException,
  IdentificacionYaRegistradaException,
  UsuarioNoEncontradoException,
  RolNoEncontradoException,
  AutoModificacionNoPermitidaException,
  PermisoDenegadoException,
} from '../comun/excepciones/excepciones-autenticacion';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly repositorioUsuarios: Repository<Usuario>,
    @InjectRepository(Rol)
    private readonly repositorioRoles: Repository<Rol>,
    private readonly configuracion: ConfigService,
  ) {}

  // RF-19 — Listado paginado y filtrable
  async listar(filtros: FiltrosUsuariosDto): Promise<ListaPaginadaUsuariosRespuestaDto> {
    const pagina = filtros.pagina ?? 1;
    const limite = filtros.limite ?? 10;

    const consulta = this.repositorioUsuarios
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.rol', 'rol')
      .orderBy('usuario.nombreCompleto', 'ASC')
      .skip((pagina - 1) * limite)
      .take(limite);

    if (filtros.nombre) {
      consulta.andWhere(
        '(usuario.nombreCompleto LIKE :busqueda OR usuario.correo LIKE :busqueda OR rol.nombre LIKE :busqueda)',
        { busqueda: `%${filtros.nombre}%` },
      );
    }

    if (filtros.idRol) {
      consulta.andWhere('usuario.idRol = :idRol', { idRol: filtros.idRol });
    }

    if (filtros.estado) {
      consulta.andWhere('usuario.estado = :estado', { estado: filtros.estado });
    }

    const [usuarios, total] = await consulta.getManyAndCount();

    return new ListaPaginadaUsuariosRespuestaDto({
      datos: usuarios.map((usuario) => this.mapearResumen(usuario)),
      total,
      pagina,
      limite,
    });
  }

  async obtener(idUsuario: number): Promise<UsuarioResumenRespuestaDto> {
    const usuario = await this.repositorioUsuarios.findOne({
      where: { idUsuario },
      relations: { rol: true },
    });
    if (!usuario) {
      throw new UsuarioNoEncontradoException();
    }
    return this.mapearResumen(usuario);
  }

  // RF-06 — Creación administrativa (correoVerificado = true, regla #8)
  async crear(dto: CrearUsuarioDto): Promise<UsuarioResumenRespuestaDto> {
    const correoExistente = await this.repositorioUsuarios.findOne({ where: { correo: dto.correo } });
    if (correoExistente) {
      throw new CorreoYaRegistradoException();
    }

    const identificacionExistente = await this.repositorioUsuarios.findOne({
      where: { identificacion: dto.identificacion },
    });
    if (identificacionExistente) {
      throw new IdentificacionYaRegistradaException();
    }

    const rol = await this.repositorioRoles.findOne({ where: { idRol: dto.idRol } });
    if (!rol) {
      throw new RolNoEncontradoException();
    }

    const saltRounds = Number(this.configuracion.get<string>('BCRYPT_SALT_ROUNDS') ?? 12);
    const contrasenaHash = await bcrypt.hash(dto.contrasenaTemporal, saltRounds);

    const nuevoUsuario = this.repositorioUsuarios.create({
      nombreCompleto: dto.nombreCompleto,
      identificacion: dto.identificacion,
      correo: dto.correo,
      contrasenaHash,
      estado: 'ACTIVO',
      idRol: dto.idRol,
      correoVerificado: true, // regla #8: creado por administrador, no pasa por autoregistro
    });

    const usuarioGuardado = await this.repositorioUsuarios.save(nuevoUsuario);
    usuarioGuardado.rol = rol;
    return this.mapearResumen(usuarioGuardado);
  }

  // RF-07 — Edición
  async actualizar(idUsuario: number, dto: ActualizarUsuarioDto): Promise<UsuarioResumenRespuestaDto> {
    const usuario = await this.repositorioUsuarios.findOne({ where: { idUsuario }, relations: { rol: true } });
    if (!usuario) {
      throw new UsuarioNoEncontradoException();
    }

    if (dto.correo && dto.correo !== usuario.correo) {
      const correoExistente = await this.repositorioUsuarios.findOne({ where: { correo: dto.correo } });
      if (correoExistente) {
        throw new CorreoYaRegistradoException();
      }
      usuario.correo = dto.correo;
    }

    if (dto.nombreCompleto) {
      usuario.nombreCompleto = dto.nombreCompleto;
    }

    if (dto.idRol) {
      const rol = await this.repositorioRoles.findOne({ where: { idRol: dto.idRol } });
      if (!rol) {
        throw new RolNoEncontradoException();
      }
      usuario.idRol = dto.idRol;
      usuario.rol = rol;
    }

    await this.repositorioUsuarios.save(usuario);
    return this.mapearResumen(usuario);
  }

  // RF-08 — Cambio de estado, con regla #9 (no auto-inactivarse)
  async cambiarEstado(
    idUsuario: number,
    nuevoEstado: 'ACTIVO' | 'INACTIVO',
    usuarioAutenticado: PayloadJwt,
  ): Promise<UsuarioResumenRespuestaDto> {
    if (idUsuario === usuarioAutenticado.idUsuario && nuevoEstado === 'INACTIVO') {
      throw new AutoModificacionNoPermitidaException();
    }

    const usuario = await this.repositorioUsuarios.findOne({ where: { idUsuario }, relations: { rol: true } });
    if (!usuario) {
      throw new UsuarioNoEncontradoException();
    }

    usuario.estado = nuevoEstado;
    await this.repositorioUsuarios.save(usuario);
    return this.mapearResumen(usuario);
  }

  // Asignación de rol, con reglas #9 (no auto-modificarse) y #10
  // (solo Superadministrador puede asignar el rol Superadministrador)
  async asignarRol(
    idUsuario: number,
    idRolNuevo: number,
    usuarioAutenticado: PayloadJwt,
  ): Promise<UsuarioResumenRespuestaDto> {
    if (idUsuario === usuarioAutenticado.idUsuario) {
      throw new AutoModificacionNoPermitidaException();
    }

    const rolNuevo = await this.repositorioRoles.findOne({ where: { idRol: idRolNuevo } });
    if (!rolNuevo) {
      throw new RolNoEncontradoException();
    }

    if (rolNuevo.nombre === 'Superadministrador' && usuarioAutenticado.nombreRol !== 'Superadministrador') {
      throw new PermisoDenegadoException();
    }

    const usuario = await this.repositorioUsuarios.findOne({ where: { idUsuario } });
    if (!usuario) {
      throw new UsuarioNoEncontradoException();
    }

    usuario.idRol = idRolNuevo;
    usuario.rol = rolNuevo;
    await this.repositorioUsuarios.save(usuario);
    return this.mapearResumen(usuario);
  }

  private mapearResumen(usuario: Usuario): UsuarioResumenRespuestaDto {
    return new UsuarioResumenRespuestaDto({
      idUsuario: usuario.idUsuario,
      nombreCompleto: usuario.nombreCompleto,
      correo: usuario.correo,
      nombreRol: usuario.rol?.nombre ?? '',
      idRol: usuario.idRol,
      estado: usuario.estado,
    });
  }
}