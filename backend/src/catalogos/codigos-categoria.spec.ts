// src/catalogos/codigos-categoria.spec.ts
//
// Regla de numeración de spec-ajustes-posdespliegue §7.1. La migración 10
// implementa la misma regla en SQL; si una de estas pruebas cambia, hay que
// revisar también ese script.

import {
  formatearNumero,
  recodificarSubarbol,
  siguienteCodigoHija,
  siguienteCodigoRaiz,
} from './codigos-categoria';

describe('codigos-categoria', () => {
  describe('siguienteCodigoRaiz', () => {
    it('empieza en ITSP-01 si no hay ninguna raíz', () => {
      expect(siguienteCodigoRaiz([])).toBe('ITSP-01');
    });

    it('toma el máximo + 1 sin rellenar huecos', () => {
      expect(siguienteCodigoRaiz(['ITSP-01', 'ITSP-04'])).toBe('ITSP-05');
    });

    it('cuenta la errata ITPS-NN para no repetir el número (D-2)', () => {
      expect(siguienteCodigoRaiz(['ITSP-01', 'ITSP-04', 'ITPS-05'])).toBe(
        'ITSP-06',
      );
    });

    it('no distingue mayúsculas ni espacios extremos al reconocer', () => {
      expect(siguienteCodigoRaiz(['itsp-02', ' Itps-07 '])).toBe('ITSP-08');
    });

    it('ignora códigos irregulares, nulos y vacíos', () => {
      expect(
        siguienteCodigoRaiz([
          'ITSP-01',
          'TRANSPARENCIA',
          null,
          '',
          'ITSP-1',
          'ITSP-02-01',
        ]),
      ).toBe('ITSP-02');
    });

    it('pasa de 99 a 100 sin relleno (D-4) y reconoce 3 dígitos', () => {
      expect(siguienteCodigoRaiz(['ITSP-99'])).toBe('ITSP-100');
      expect(siguienteCodigoRaiz(['ITSP-100', 'ITSP-99'])).toBe('ITSP-101');
    });
  });

  describe('siguienteCodigoHija', () => {
    it('empieza en RAIZ-01 si la raíz no tiene subsecciones', () => {
      expect(siguienteCodigoHija('ITSP-05', [])).toBe('ITSP-05-01');
    });

    it('toma el máximo + 1 de las hermanas, incluidas las inactivas', () => {
      // El llamador entrega todas las hijas; el estado no se mira aquí.
      expect(siguienteCodigoHija('ITSP-02', ['ITSP-02-01', 'ITSP-02-03'])).toBe(
        'ITSP-02-04',
      );
    });

    it('ignora hijas con otro prefijo o con formato irregular', () => {
      expect(
        siguienteCodigoHija('ITSP-02', [
          'ITSP-01-09',
          'ITSP-02-02',
          'OTRA',
          null,
          'ITSP-02-2',
        ]),
      ).toBe('ITSP-02-03');
    });

    it('hereda en mayúsculas el código irregular de la raíz (D-3)', () => {
      expect(siguienteCodigoHija('itps-05', ['itps-05-01'])).toBe('ITPS-05-02');
      expect(siguienteCodigoHija('TRANSPARENCIA', [])).toBe('TRANSPARENCIA-01');
    });

    it('escapa los caracteres especiales del código de la raíz', () => {
      // Con el punto sin escapar, 'AXB-07' contaría como hija de 'A.B'.
      expect(siguienteCodigoHija('A.B', ['AXB-07', 'A.B-02'])).toBe('A.B-03');
    });
  });

  describe('siguienteCodigoHija a cualquier profundidad', () => {
    it('usa el código del padre aunque no sea una raíz', () => {
      expect(siguienteCodigoHija('ITSP-01-02-03', ['ITSP-01-02-03-01'])).toBe(
        'ITSP-01-02-03-02',
      );
    });

    it('no confunde las hijas con las nietas', () => {
      expect(
        siguienteCodigoHija('ITSP-01', ['ITSP-01-02', 'ITSP-01-02-07']),
      ).toBe('ITSP-01-03');
    });
  });

  describe('recodificarSubarbol', () => {
    it('los descendientes regulares conservan su sufijo bajo el código nuevo', () => {
      const nuevos = recodificarSubarbol(10, 'ITSP-01-02', 'ITSP-04-05', [
        { id: 11, idPadre: 10, codigo: 'ITSP-01-02-03' },
        { id: 12, idPadre: 11, codigo: 'ITSP-01-02-03-01' },
        { id: 13, idPadre: 10, codigo: 'ITSP-01-02-07' },
      ]);

      expect(Object.fromEntries(nuevos)).toEqual({
        11: 'ITSP-04-05-03',
        12: 'ITSP-04-05-03-01',
        13: 'ITSP-04-05-07',
      });
    });

    it('un irregular toma el máximo + 1 contando a las regulares, aunque vaya antes', () => {
      const nuevos = recodificarSubarbol(10, 'ITSP-01-02', 'ITSP-04-05', [
        { id: 11, idPadre: 10, codigo: 'VIEJO' },
        { id: 12, idPadre: 10, codigo: 'ITSP-01-02-03' },
      ]);

      expect(nuevos.get(12)).toBe('ITSP-04-05-03');
      expect(nuevos.get(11)).toBe('ITSP-04-05-04');
    });

    it('los hijos de un irregular cuelgan de su código nuevo', () => {
      const nuevos = recodificarSubarbol(10, 'ITSP-01-02', 'ITSP-04-05', [
        { id: 11, idPadre: 10, codigo: 'VIEJO' },
        { id: 12, idPadre: 11, codigo: 'VIEJO-02' },
      ]);

      expect(nuevos.get(11)).toBe('ITSP-04-05-01');
      expect(nuevos.get(12)).toBe('ITSP-04-05-01-02');
    });

    it('no incluye a la categoría movida y respeta los números de tres dígitos', () => {
      const nuevos = recodificarSubarbol(10, 'ITSP-01-02', 'ITSP-04-05', [
        { id: 11, idPadre: 10, codigo: 'ITSP-01-02-100' },
      ]);

      expect(nuevos.has(10)).toBe(false);
      expect(nuevos.get(11)).toBe('ITSP-04-05-100');
    });
  });

  it('formatearNumero rellena a dos dígitos y no recorta', () => {
    expect(formatearNumero(1)).toBe('01');
    expect(formatearNumero(42)).toBe('42');
    expect(formatearNumero(123)).toBe('123');
  });
});
