import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { Documento } from './documento.entidad';
import { Dependencia } from './dependencia.entidad';

@Entity('documentos_dependencias')
export class DocumentoDependencia {
  @PrimaryColumn({
    name: 'id_documento',
    type: 'int',
    unsigned: true,
  })
  idDocumento: number;

  @PrimaryColumn({
    name: 'id_dependencia',
    type: 'int',
    unsigned: true,
  })
  idDependencia: number;

  @ManyToOne(
    () => Documento,
    (documento) => documento.documentosDependencias,
    {
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'id_documento',
    referencedColumnName: 'idDocumento',
    foreignKeyConstraintName:
      'fk_documentos_dependencias_documento',
  })
  documento: Documento;

  @ManyToOne(
    () => Dependencia,
    (dependencia) => dependencia.documentosDependencias,
    {
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_dependencia',
    referencedColumnName: 'idDependencia',
    foreignKeyConstraintName:
      'fk_documentos_dependencias_dependencia',
  })
  dependencia: Dependencia;
}