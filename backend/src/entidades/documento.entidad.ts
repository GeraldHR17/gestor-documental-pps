import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { CategoriaItsp } from './categoria-itsp.entidad';
import { TipoDocumento } from './tipo-documento.entidad';
import { Usuario } from './usuario.entidad';
import { VersionDocumento } from './version-documento.entidad';
import { Dependencia } from './dependencia.entidad';
import { DocumentoEtiqueta } from './documento-etiqueta.entidad';

@Entity('documentos')
@Index('idx_documentos_anio', ['anio'])
@Index('idx_documentos_estado', ['estado'])
@Index('idx_documentos_fecha_publicacion', ['fechaPublicacion'])
@Index('idx_documentos_usuario_creador', ['idUsuarioCreador'])
@Index('idx_documentos_categoria_itsp', ['idCategoriaItsp'])
@Index('idx_documentos_tipo_documento', ['idTipoDocumento'])
@Index('idx_documentos_dependencia', ['idDependencia'])
export class Documento {
  @PrimaryGeneratedColumn({
    name: 'id_documento',
    type: 'int',
    unsigned: true,
  })
  idDocumento: number;

  @Column({
    name: 'titulo',
    type: 'varchar',
    length: 255,
  })
  titulo: string;

  @Column({
    name: 'descripcion',
    type: 'text',
    nullable: true,
  })
  descripcion: string | null;

  @Column({
    name: 'anio',
    type: 'year',
  })
  anio: number;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: ['BORRADOR', 'PUBLICADO', 'INACTIVO'],
    default: 'BORRADOR',
  })
  estado: 'BORRADOR' | 'PUBLICADO' | 'INACTIVO';

  @Column({
    name: 'fecha_publicacion',
    type: 'datetime',
    nullable: true,
  })
  fechaPublicacion: Date | null;

  @Column({
    name: 'id_categoria_itsp',
    type: 'int',
    unsigned: true,
  })
  idCategoriaItsp: number;

  @Column({
    name: 'id_tipo_documento',
    type: 'int',
    unsigned: true,
  })
  idTipoDocumento: number;

  // Agregada por 08-ajuste-dependencia-y-paginas.sql en reemplazo de la
  // tabla N:M documentos_dependencias. NULL a propósito: la dependencia no
  // es obligatoria para publicar (VP-03).
  @Column({
    name: 'id_dependencia',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  idDependencia: number | null;

  @Column({
    name: 'id_usuario_creador',
    type: 'int',
    unsigned: true,
  })
  idUsuarioCreador: number;

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

  @ManyToOne(
    () => CategoriaItsp,
    (categoriaItsp) => categoriaItsp.documentos,
    {
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_categoria_itsp',
    referencedColumnName: 'idCategoriaItsp',
    foreignKeyConstraintName: 'fk_documentos_categoria_itsp',
  })
  categoriaItsp: CategoriaItsp;

  @ManyToOne(
    () => TipoDocumento,
    (tipoDocumento) => tipoDocumento.documentos,
    {
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_tipo_documento',
    referencedColumnName: 'idTipoDocumento',
    foreignKeyConstraintName: 'fk_documentos_tipo_documento',
  })
  tipoDocumento: TipoDocumento;

  @ManyToOne(
    () => Usuario,
    (usuario) => usuario.documentosCreados,
    {
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_usuario_creador',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_documentos_usuario_creador',
  })
  usuarioCreador: Usuario;

  @OneToMany(
    () => VersionDocumento,
    (versionDocumento) => versionDocumento.documento,
  )
  versiones: VersionDocumento[];

  @ManyToOne(() => Dependencia, (dependencia) => dependencia.documentos, {
    nullable: true,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'id_dependencia',
    referencedColumnName: 'idDependencia',
    foreignKeyConstraintName: 'fk_documentos_dependencia',
  })
  dependencia: Dependencia | null;

  @OneToMany(
    () => DocumentoEtiqueta,
    (documentoEtiqueta) => documentoEtiqueta.documento,
  )
  documentosEtiquetas: DocumentoEtiqueta[];
}