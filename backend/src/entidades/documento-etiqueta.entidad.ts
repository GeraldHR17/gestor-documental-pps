import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { Documento } from './documento.entidad';
import { Etiqueta } from './etiqueta.entidad';

@Entity('documentos_etiquetas')
export class DocumentoEtiqueta {
  @PrimaryColumn({
    name: 'id_documento',
    type: 'int',
    unsigned: true,
  })
  idDocumento: number;

  @PrimaryColumn({
    name: 'id_etiqueta',
    type: 'int',
    unsigned: true,
  })
  idEtiqueta: number;

  @ManyToOne(
    () => Documento,
    (documento) => documento.documentosEtiquetas,
    {
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'id_documento',
    referencedColumnName: 'idDocumento',
    foreignKeyConstraintName:
      'fk_documentos_etiquetas_documento',
  })
  documento: Documento;

  @ManyToOne(
    () => Etiqueta,
    (etiqueta) => etiqueta.documentosEtiquetas,
    {
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_etiqueta',
    referencedColumnName: 'idEtiqueta',
    foreignKeyConstraintName:
      'fk_documentos_etiquetas_etiqueta',
  })
  etiqueta: Etiqueta;
}