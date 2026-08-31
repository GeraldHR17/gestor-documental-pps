import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { Documento } from './documento.entidad';
import { Usuario } from './usuario.entidad';

@Entity('versiones_documentos')
@Unique('uk_versiones_documento_numero', [
  'idDocumento',
  'numeroVersion',
])
@Index('idx_versiones_documento', ['idDocumento'])
@Index('idx_versiones_hash', ['hashArchivo'])
@Check(
  'chk_versiones_tamano',
  'tamano_bytes > 0 AND tamano_bytes <= 41943040',
)
@Check(
  'chk_versiones_mime',
  "mime_type = 'application/pdf'",
)
export class VersionDocumento {
  @PrimaryGeneratedColumn({
    name: 'id_version',
    type: 'int',
    unsigned: true,
  })
  idVersion: number;

  @Column({
    name: 'id_documento',
    type: 'int',
    unsigned: true,
  })
  idDocumento: number;

  @Column({
    name: 'numero_version',
    type: 'int',
    unsigned: true,
  })
  numeroVersion: number;

  @Column({
    name: 'nombre_archivo_original',
    type: 'varchar',
    length: 255,
  })
  nombreArchivoOriginal: string;

  @Column({
    name: 'nombre_archivo_sistema',
    type: 'varchar',
    length: 255,
  })
  nombreArchivoSistema: string;

  @Column({
    name: 'ruta_archivo',
    type: 'varchar',
    length: 500,
  })
  rutaArchivo: string;

  @Column({
    name: 'hash_archivo',
    type: 'char',
    length: 64,
  })
  hashArchivo: string;

  @Column({
    name: 'algoritmo_hash',
    type: 'varchar',
    length: 20,
    default: 'SHA-256',
  })
  algoritmoHash: string;

  @Column({
    name: 'tamano_bytes',
    type: 'bigint',
    unsigned: true,
  })
  tamanoBytes: string;

  @Column({
    name: 'mime_type',
    type: 'varchar',
    length: 100,
    default: 'application/pdf',
  })
  mimeType: string;

  @Column({
    name: 'comentario_version',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  comentarioVersion: string | null;

  @Column({
    name: 'id_usuario_carga',
    type: 'int',
    unsigned: true,
  })
  idUsuarioCarga: number;

  @Column({
    name: 'fecha_carga',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCarga: Date;

  @ManyToOne(
    () => Documento,
    (documento) => documento.versiones,
    {
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_documento',
    referencedColumnName: 'idDocumento',
    foreignKeyConstraintName: 'fk_versiones_documento',
  })
  documento: Documento;

  @ManyToOne(
    () => Usuario,
    (usuario) => usuario.versionesCargadas,
    {
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_usuario_carga',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_versiones_usuario_carga',
  })
  usuarioCarga: Usuario;
}