import { registerAs } from '@nestjs/config';

export default registerAs('baseDatos', () => ({
  host: process.env.BD_HOST,
  puerto: Number(process.env.BD_PUERTO),
  nombre: process.env.BD_NOMBRE,
  usuario: process.env.BD_USUARIO,
  contrasena: process.env.BD_CONTRASENA,
}));