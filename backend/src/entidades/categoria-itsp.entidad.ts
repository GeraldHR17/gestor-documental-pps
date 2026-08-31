import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Documento } from './documento.entidad';

@Entity('categorias_itsp')
@Index('idx_categorias_itsp_padre', ['idCategoriaPadre'])
@Index('idx_categorias_itsp_estado', ['estado'])
@Index('idx_categorias_itsp_orden', ['orden'])
export class CategoriaItsp {
  @PrimaryGeneratedColumn({
    name: 'id_categoria_itsp',
    type: 'int',
    unsigned: true,
  })
  idCategoriaItsp: number;

  @Column({
    name: 'id_categoria_padre',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  idCategoriaPadre: number | null;

  @Column({
    name: 'codigo',
    type: 'varchar',
    length: 50,
    nullable: true,
    unique: true,
  })
  codigo: string | null;

  @Column({
    name: 'nombre',
    type: 'varchar',
    length: 200,
  })
  nombre: string;

  @Column({
    name: 'descripcion',
    type: 'text',
    nullable: true,
  })
  descripcion: string | null;

  @Column({
    name: 'nivel',
    type: 'tinyint',
    unsigned: true,
    default: 1,
  })
  nivel: number;

  @Column({
    name: 'orden',
    type: 'int',
    unsigned: true,
    default: 0,
  })
  orden: number;

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

  @ManyToOne(
    () => CategoriaItsp,
    (categoria) => categoria.subcategorias,
    {
      nullable: true,
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'id_categoria_padre',
    referencedColumnName: 'idCategoriaItsp',
    foreignKeyConstraintName: 'fk_categorias_itsp_padre',
  })
  categoriaPadre: CategoriaItsp | null;

  @OneToMany(
    () => CategoriaItsp,
    (categoria) => categoria.categoriaPadre,
  )
  subcategorias: CategoriaItsp[];

  @OneToMany(
    () => Documento,
    (documento) => documento.categoriaItsp,
  )
  documentos: Documento[];
}