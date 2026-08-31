import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Usuario } from './usuario.entidad';
import { Permiso } from './permiso.entidad';

@Entity('roles')
export class Rol {
  @PrimaryGeneratedColumn({
    name: 'id_rol',
    type: 'int',
    unsigned: true,
  })
  idRol: number;

  @Column({
    name: 'nombre',
    type: 'varchar',
    length: 50,
    unique: true,
  })
  nombre: string;

  @Column({
    name: 'descripcion',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  descripcion: string | null;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: ['ACTIVO', 'INACTIVO'],
    default: 'ACTIVO',
  })
  estado: 'ACTIVO' | 'INACTIVO';

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

  @OneToMany(() => Usuario, (usuario) => usuario.rol)
  usuarios: Usuario[];

  // Relación N:M con permisos, mapeada sobre la tabla `roles_permisos`
  // que ya existe en 01-esquema.sql (Sprint 1). El @JoinTable declara
  // explícitamente el nombre de la tabla y de sus dos columnas para que
  // TypeORM reutilice esa tabla en lugar de inferir una nueva.
  @ManyToMany(() => Permiso, (permiso) => permiso.roles)
  @JoinTable({
    name: 'roles_permisos',
    joinColumn: {
      name: 'id_rol',
      referencedColumnName: 'idRol',
    },
    inverseJoinColumn: {
      name: 'id_permiso',
      referencedColumnName: 'idPermiso',
    },
  })
  permisos: Permiso[];
}