import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Usuario } from './usuario.entidad';

@Entity('tokens_verificacion_correo')
@Index('idx_tokens_verificacion_usuario', ['idUsuario'])
@Index('idx_tokens_verificacion_hash', ['tokenHash'])
export class TokenVerificacionCorreo {
  @PrimaryGeneratedColumn({
    name: 'id_token',
    type: 'bigint',
    unsigned: true,
  })
  idToken: string;

  @Column({
    name: 'id_usuario',
    type: 'int',
    unsigned: true,
  })
  idUsuario: number;

  @Column({
    name: 'token_hash',
    type: 'char',
    length: 64,
    comment: 'SHA-256 del token de verificación',
  })
  tokenHash: string;

  @Column({
    name: 'fecha_creacion',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion: Date;

  @Column({
    name: 'fecha_expiracion',
    type: 'datetime',
  })
  fechaExpiracion: Date;

  @Column({
    name: 'usado',
    type: 'boolean',
    default: false,
  })
  usado: boolean;

  @ManyToOne(() => Usuario, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'id_usuario',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_tokens_verificacion_usuario',
  })
  usuario: Usuario;
}
