// src/configuracion/origen-cors.spec.ts

import { derivarOrigenPermitido } from './origen-cors';

describe('derivarOrigenPermitido', () => {
  it('recorta la subruta de produccion y deja solo esquema y host', () => {
    expect(derivarOrigenPermitido('https://servidor.ejemplo.go.cr/munipalmares/wp-munidata')).toBe(
      'https://servidor.ejemplo.go.cr',
    );
  });

  it('conserva el puerto cuando no es el estandar del esquema', () => {
    expect(derivarOrigenPermitido('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('descarta la barra final, que convertiria el origen en invalido', () => {
    expect(derivarOrigenPermitido('https://ejemplo.go.cr/sistema/')).toBe('https://ejemplo.go.cr');
  });

  it('sin variable definida mantiene el origen de desarrollo', () => {
    expect(derivarOrigenPermitido(undefined)).toBe('http://localhost:5173');
    expect(derivarOrigenPermitido('   ')).toBe('http://localhost:5173');
  });

  it('un valor que no es URL se devuelve tal cual, para que el fallo se vea en el navegador', () => {
    // Preferible a lanzar: un error aquí tumbaría el arranque del servicio
    // entero por una variable mal escrita.
    expect(derivarOrigenPermitido('no-es-una-url')).toBe('no-es-una-url');
  });
});
