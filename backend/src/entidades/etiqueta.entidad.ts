import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DocumentoEtiqueta } from './documento-etiqueta.entidad';

@Entity('etiquetas')
@Index('idx_etiquetas_estado', ['estado'])
export class Etiqueta {
  @PrimaryGeneratedColumn({
    name: 'id_etiqueta',
    type: 'int',
    unsigned: true,
  })
  idEtiqueta: number;

  @Column({
    name: 'nombre',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  nombre: string;

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
    () => DocumentoEtiqueta,
    (documentoEtiqueta) => documentoEtiqueta.etiqueta,
  )
  documentosEtiquetas: DocumentoEtiqueta[];
}