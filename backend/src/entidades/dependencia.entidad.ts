import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DocumentoDependencia } from './documento-dependencia.entidad';

@Entity('dependencias')
@Index('idx_dependencias_estado', ['estado'])
export class Dependencia {
  @PrimaryGeneratedColumn({
    name: 'id_dependencia',
    type: 'int',
    unsigned: true,
  })
  idDependencia: number;

  @Column({
    name: 'nombre',
    type: 'varchar',
    length: 150,
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

  @OneToMany(
    () => DocumentoDependencia,
    (documentoDependencia) => documentoDependencia.dependencia,
  )
  documentosDependencias: DocumentoDependencia[];
}