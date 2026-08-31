import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

import { Rol } from './rol.entidad';

@Entity('permisos')
export class Permiso {
  @PrimaryGeneratedColumn({
    name: 'id_permiso',
    type: 'int',
    unsigned: true,
  })
  idPermiso: number;

  @Column({
    name: 'nombre',
    type: 'varchar',
    length: 100,
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

  @Index('idx_permisos_estado')
  @Column({
    name: 'estado',
    type: 'varchar',
    length: 20,
    default: 'ACTIVO',
  })
  estado: string;

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

  // Lado inverso de la relación N:M; el @JoinTable sobre `roles_permisos`
  // se declara únicamente en Rol (lado propietario).
  @ManyToMany(() => Rol, (rol) => rol.permisos)
  roles: Rol[];
}