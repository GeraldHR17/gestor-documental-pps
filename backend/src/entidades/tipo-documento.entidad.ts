import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Documento } from './documento.entidad';

@Entity('tipos_documentos')
@Index('idx_tipos_documentos_estado', ['estado'])
export class TipoDocumento {
  @PrimaryGeneratedColumn({
    name: 'id_tipo_documento',
    type: 'int',
    unsigned: true,
  })
  idTipoDocumento: number;

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
    () => Documento,
    (documento) => documento.tipoDocumento,
  )
  documentos: Documento[];
}