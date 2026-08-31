import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Usuario } from './usuario.entidad';

@Entity('sesiones_refresh_tokens')
@Index('idx_sesiones_refresh_usuario', ['idUsuario'])
@Index('idx_sesiones_refresh_token_hash', ['tokenHash'])
@Index('idx_sesiones_refresh_expiracion', ['fechaExpiracion'])
export class SesionRefreshToken {
  @PrimaryGeneratedColumn({
    name: 'id_sesion',
    type: 'bigint',
    unsigned: true,
  })
  idSesion: string;

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
    comment: 'SHA-256 del refresh token, nunca el valor plano',
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
    name: 'revocado',
    type: 'boolean',
    default: false,
  })
  revocado: boolean;

  @Column({
    name: 'ip_origen',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  ipOrigen: string | null;

  @Column({
    name: 'user_agent',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  userAgent: string | null;

  @ManyToOne(() => Usuario, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'id_usuario',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_sesiones_refresh_usuario',
  })
  usuario: Usuario;
}
