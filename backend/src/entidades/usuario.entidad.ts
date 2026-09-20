import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Rol } from './rol.entidad';
import { Dependencia } from './dependencia.entidad';
import { Documento } from './documento.entidad';
import { VersionDocumento } from './version-documento.entidad';
import { BitacoraLog } from './bitacora-log.entidad';

@Entity('usuarios')
@Index('idx_usuarios_correo', ['correo'])
@Index('idx_usuarios_identificacion', ['identificacion'])
@Index('idx_usuarios_rol', ['idRol'])
export class Usuario {
  @PrimaryGeneratedColumn({
    name: 'id_usuario',
    type: 'int',
    unsigned: true,
  })
  idUsuario: number;

  @Column({
    name: 'nombre_completo',
    type: 'varchar',
    length: 150,
  })
  nombreCompleto: string;

  @Column({
    name: 'identificacion',
    type: 'varchar',
    length: 30,
    unique: true,
  })
  identificacion: string;

  @Column({
    name: 'correo',
    type: 'varchar',
    length: 150,
    unique: true,
  })
  correo: string;

  @Column({
    name: 'contrasena_hash',
    type: 'varchar',
    length: 255,
  })
  contrasenaHash: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: ['ACTIVO', 'INACTIVO'],
    default: 'ACTIVO',
  })
  estado: 'ACTIVO' | 'INACTIVO';

  @Column({
    name: 'id_rol',
    type: 'int',
    unsigned: true,
  })
  idRol: number;

  // Agregada por 08-ajuste-dependencia-y-paginas.sql. Sirve para precargar
  // (no forzar) la dependencia de los documentos que registre la persona.
  @Column({
    name: 'id_dependencia',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  idDependencia: number | null;

  @Column({
    name: 'fecha_creacion',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion: Date;

  @Column({
    name: 'fecha_actualizacion',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  fechaActualizacion: Date;

  // ===================== Fase 4 — Autenticación =====================
  // Columnas agregadas por 04-alter-usuarios-auth.sql: bloqueo temporal
  // por intentos fallidos (RF-12) y verificación de correo del
  // autoregistro ciudadano (RF-21).

  @Column({
    name: 'intentos_fallidos',
    type: 'tinyint',
    unsigned: true,
    default: 0,
  })
  intentosFallidos: number;

  @Column({
    name: 'bloqueado_hasta',
    type: 'datetime',
    nullable: true,
  })
  bloqueadoHasta: Date | null;

  @Column({
    name: 'correo_verificado',
    type: 'boolean',
    default: false,
  })
  correoVerificado: boolean;

  @ManyToOne(() => Rol, (rol) => rol.usuarios, {
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'id_rol',
    referencedColumnName: 'idRol',
    foreignKeyConstraintName: 'fk_usuarios_rol',
  })
  rol: Rol;

  @ManyToOne(() => Dependencia, (dependencia) => dependencia.usuarios, {
    nullable: true,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'id_dependencia',
    referencedColumnName: 'idDependencia',
    foreignKeyConstraintName: 'fk_usuarios_dependencia',
  })
  dependencia: Dependencia | null;

  @OneToMany(() => Documento, (documento) => documento.usuarioCreador)
  documentosCreados: Documento[];

  @OneToMany(
    () => VersionDocumento,
    (versionDocumento) => versionDocumento.usuarioCarga,
  )
  versionesCargadas: VersionDocumento[];

  @OneToMany(() => BitacoraLog, (bitacoraLog) => bitacoraLog.usuario)
  registrosBitacora: BitacoraLog[];
}