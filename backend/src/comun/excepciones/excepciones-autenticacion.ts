// src/comun/excepciones/excepciones-autenticacion.ts
//
// Excepciones de negocio de la Fase 4 (spec.md, Seccion 10). Todas
// extienden HttpException para ser compatibles con el
// ExcepcionGlobalFilter global que ya existe en el proyecto (@Catch()),
// sin necesidad de modificarlo.

import { HttpException, HttpStatus } from '@nestjs/common';

export class CredencialesInvalidasException extends HttpException {
  constructor() {
    super('Correo o contraseña incorrectos', HttpStatus.UNAUTHORIZED);
  }
}

export class CuentaBloqueadaException extends HttpException {
  constructor(minutosRestantes: number) {
    super(
      `Cuenta bloqueada temporalmente. Intente nuevamente en ${minutosRestantes} minutos`,
      423, // Locked (no existe constante nativa en HttpStatus)
    );
  }
}

export class CorreoNoVerificadoException extends HttpException {
  constructor() {
    super('Debe verificar su correo electrónico antes de iniciar sesión', HttpStatus.FORBIDDEN);
  }
}

export class TokenVerificacionInvalidoException extends HttpException {
  constructor() {
    super('El enlace de verificación no es válido o ha expirado', HttpStatus.BAD_REQUEST);
  }
}

export class TokenExpiradoException extends HttpException {
  constructor() {
    super('El token ha expirado', HttpStatus.UNAUTHORIZED);
  }
}

export class TokenInvalidoException extends HttpException {
  constructor() {
    super('Token inválido o manipulado', HttpStatus.UNAUTHORIZED);
  }
}

export class RefreshTokenRevocadoException extends HttpException {
  constructor() {
    super('La sesión ha sido cerrada. Inicie sesión nuevamente', HttpStatus.UNAUTHORIZED);
  }
}

export class PermisoDenegadoException extends HttpException {
  constructor() {
    super('No tiene permisos para realizar esta acción', HttpStatus.FORBIDDEN);
  }
}

export class CorreoYaRegistradoException extends HttpException {
  constructor() {
    super('El correo ya se encuentra registrado', HttpStatus.CONFLICT);
  }
}

export class IdentificacionYaRegistradaException extends HttpException {
  constructor() {
    super('La identificación ya se encuentra registrada', HttpStatus.CONFLICT);
  }
}

export class UsuarioNoEncontradoException extends HttpException {
  constructor() {
    super('Usuario no encontrado', HttpStatus.NOT_FOUND);
  }
}

export class RolNoEncontradoException extends HttpException {
  constructor() {
    super('Rol no encontrado', HttpStatus.NOT_FOUND);
  }
}

export class TokenRecuperacionInvalidoException extends HttpException {
  constructor() {
    super('El enlace de recuperación no es válido o ha expirado', HttpStatus.BAD_REQUEST);
  }
}

export class AutoModificacionNoPermitidaException extends HttpException {
  constructor() {
    super('No puede modificar su propio estado o rol administrativo', HttpStatus.FORBIDDEN);
  }
}