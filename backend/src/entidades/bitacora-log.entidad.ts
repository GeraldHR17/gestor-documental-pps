import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Usuario } from './usuario.entidad';

@Entity('bitacora_logs')
@Index('idx_bitacora_usuario_fecha', [
  'idUsuario',
  'fechaHora',
])
@Index('idx_bitacora_entidad_registro', [
  'entidad',
  'idRegistro',
])
@Index('idx_bitacora_fecha', ['fechaHora'])
export class BitacoraLog {
  @PrimaryGeneratedColumn({
    name: 'id_log',
    type: 'bigint',
    unsigned: true,
  })
  idLog: string;

  @Column({
    name: 'id_usuario',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  idUsuario: number | null;

  @Column({
    name: 'accion',
    type: 'varchar',
    length: 50,
  })
  accion: string;

  @Column({
    name: 'entidad',
    type: 'varchar',
    length: 100,
  })
  entidad: string;

  @Column({
    name: 'id_registro',
    type: 'bigint',
    unsigned: true,
    nullable: true,
  })
  idRegistro: string | null;

  @Column({
    name: 'fecha_hora',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaHora: Date;

  @Column({
    name: 'resultado',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  resultado: string | null;

  @Column({
    name: 'ip_origen',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  ipOrigen: string | null;

  @Column({
    name: 'detalles',
    type: 'json',
    nullable: true,
  })
  detalles: Record<string, unknown> | null;

  @ManyToOne(
    () => Usuario,
    (usuario) => usuario.registrosBitacora,
    {
      nullable: true,
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({
    name: 'id_usuario',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_bitacora_usuario',
  })
  usuario: Usuario | null;
}