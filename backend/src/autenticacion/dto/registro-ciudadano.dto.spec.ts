// src/autenticacion/dto/registro-ciudadano.dto.spec.ts
//
// El registro ciudadano comparte reglas con el alta de Usuario, salvo el
// dominio del correo. Se valida el DTO directamente con class-validator,
// que es lo que ejecuta el ValidationPipe global.

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RegistroCiudadanoDto } from './registro-ciudadano.dto';

async function erroresDe(datos: Record<string, unknown>): Promise<string[]> {
  const errores = await validate(plainToInstance(RegistroCiudadanoDto, datos));
  return errores.map((error) => error.property);
}

const VALIDO = {
  nombreCompleto: 'María Rodríguez Alfaro',
  identificacion: '20678034',
  correo: 'maria.rodriguez@gmail.com',
  contrasena: 'Clave#2026',
};

describe('RegistroCiudadanoDto', () => {
  it('acepta un registro válido con correo personal de cualquier dominio', async () => {
    await expect(erroresDe(VALIDO)).resolves.toEqual([]);
  });

  // Antes exigía de 9 a 30: una cédula de 8 dígitos válida en el
  // formulario habría sido rechazada con un 400.
  it('acepta identificaciones de 8 a 12 caracteres alfanuméricos, como Usuario', async () => {
    await expect(erroresDe({ ...VALIDO, identificacion: '12345678' })).resolves.toEqual([]);
    await expect(erroresDe({ ...VALIDO, identificacion: 'AB1234567890' })).resolves.toEqual([]);
  });

  it('rechaza identificaciones fuera del rango o con símbolos', async () => {
    await expect(erroresDe({ ...VALIDO, identificacion: '1234567' })).resolves.toEqual(['identificacion']);
    await expect(erroresDe({ ...VALIDO, identificacion: '1234567890123' })).resolves.toEqual(['identificacion']);
    await expect(erroresDe({ ...VALIDO, identificacion: '2-0678-0341' })).resolves.toEqual(['identificacion']);
  });

  it('rechaza un correo mal formado, pero NO exige el dominio institucional', async () => {
    await expect(erroresDe({ ...VALIDO, correo: 'sin-arroba' })).resolves.toEqual(['correo']);
    await expect(erroresDe({ ...VALIDO, correo: 'persona@hotmail.com' })).resolves.toEqual([]);
  });

  it('aplica la misma política de contraseña que Usuario', async () => {
    await expect(erroresDe({ ...VALIDO, contrasena: 'clave2026' })).resolves.toEqual(['contrasena']);
    await expect(erroresDe({ ...VALIDO, contrasena: 'Clave#2026' })).resolves.toEqual([]);
  });
});
