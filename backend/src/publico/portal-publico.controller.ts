// src/publico/portal-publico.controller.ts
//
// Portal público de transparencia. Ocho rutas, todas GET, todas abiertas a
// Internet, ninguna de escritura y ninguna con cuerpo de petición.
//
// Por qué un controlador propio con prefijo `publico` en vez de colgar
// estos endpoints de /documentos y /categorias-itsp: así el árbol de rutas
// dice a simple vista qué está abierto y qué no, y la limitación de tasa y
// las cabeceras se declaran en un solo sitio en lugar de repartirse entre
// controladores que además son internos (spec 8.1).
//
// Las cabeceras hay que ponerlas aquí: el .htaccess del frontend gobierna
// un directorio de disco, y las peticiones a /api las atiende ProxyPass a
// nivel de VirtualHost sin pasar por él, de modo que ninguna respuesta de
// la API hereda sus cabeceras. main.ts tampoco usa helmet (spec 12.4).

import {
  Controller,
  Get,
  BadRequestException,
  Header,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { Publico } from '../comun/decoradores/publico.decorator';

import { PortalPublicoService, type ArchivoPublicoResuelto } from './portal-publico.service';
import { FiltrosListadoPublicoDto } from './dto/filtros-publicos.dto';
import { NodoPublicoDto, SeccionPublicaDto } from './dto/seccion-publica.dto';
import { ListaPaginadaDocumentosPublicosDto } from './dto/documento-publico.dto';
import { FiltroThrottlerPublico } from './filtro-throttler-publico';

/**
 * Límites por minuto y por IP. El ThrottlerGuard global permite 100, que es
 * razonable para funcionarios con sesión y demasiado generoso para
 * Internet, sobre todo en rutas que mueven archivos de hasta 40 MiB.
 *
 * Esto depende de CONFIAR_EN_PROXY=true: detrás de Apache, sin `trust
 * proxy`, req.ip es 127.0.0.1 para todo el mundo y los contadores de todos
 * los visitantes caerían en el mismo cubo (spec 12.5).
 */
const LIMITE_JSON_POR_MINUTO = 60;
const LIMITE_ARCHIVO_POR_MINUTO = 20;
const VENTANA_MS = 60_000;

/** Tope del nombre con el que se descarga, para no generar rutas imposibles. */
const LARGO_MAXIMO_NOMBRE_ARCHIVO = 120;

/**
 * ParseIntPipe responde "Validation failed (numeric string is expected)", en
 * inglés, y eso acabaría en la pantalla de un ciudadano. Se le cambia el
 * mensaje aquí y no globalmente para no tocar las rutas internas.
 */
const PIPE_ID_DOCUMENTO = new ParseIntPipe({
  exceptionFactory: () =>
    new BadRequestException('El identificador del documento debe ser un número entero.'),
});

@Controller('publico')
@UseFilters(FiltroThrottlerPublico)
export class PortalPublicoController {
  constructor(private readonly portalPublicoService: PortalPublicoService) {}

  // =====================================================================
  // Secciones
  // =====================================================================

  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_JSON_POR_MINUTO } })
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-cache')
  @Get('secciones')
  listarSecciones(): Promise<SeccionPublicaDto[]> {
    return this.portalPublicoService.obtenerArbol();
  }

  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_JSON_POR_MINUTO } })
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-cache')
  @Get('secciones/:codigoSeccion')
  obtenerSeccion(@Param('codigoSeccion') codigoSeccion: string): Promise<SeccionPublicaDto> {
    return this.portalPublicoService.obtenerSeccion(codigoSeccion);
  }

  // =====================================================================
  // Listados de documentos
  // =====================================================================

  /** Documentos colgados directamente de la raíz; ver el servicio. */
  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_JSON_POR_MINUTO } })
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-cache')
  @Get('secciones/:codigoSeccion/documentos')
  listarDocumentosDeSeccion(
    @Param('codigoSeccion') codigoSeccion: string,
    @Query() filtros: FiltrosListadoPublicoDto,
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    return this.portalPublicoService.listarDocumentosDeSeccion(codigoSeccion, filtros);
  }

  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_JSON_POR_MINUTO } })
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-cache')
  @Get('secciones/:codigoSeccion/:codigoSubseccion/documentos')
  listarDocumentosDeSubseccion(
    @Param('codigoSeccion') codigoSeccion: string,
    @Param('codigoSubseccion') codigoSubseccion: string,
    @Query() filtros: FiltrosListadoPublicoDto,
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    return this.portalPublicoService.listarDocumentosDeSubseccion(
      codigoSeccion,
      codigoSubseccion,
      filtros,
    );
  }

  // =====================================================================
  // Categorías de cualquier nivel (spec-ajustes-niveles-y-estados D-2)
  // =====================================================================

  /** Un nodo por su código, con sus hijas activas y la ruta de ancestros. */
  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_JSON_POR_MINUTO } })
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-cache')
  @Get('categorias/:codigo')
  obtenerCategoria(@Param('codigo') codigo: string): Promise<NodoPublicoDto> {
    return this.portalPublicoService.obtenerNodo(codigo);
  }

  /** Documentos clasificados directamente en ese nodo. */
  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_JSON_POR_MINUTO } })
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-cache')
  @Get('categorias/:codigo/documentos')
  listarDocumentosDeCategoria(
    @Param('codigo') codigo: string,
    @Query() filtros: FiltrosListadoPublicoDto,
  ): Promise<ListaPaginadaDocumentosPublicosDto> {
    return this.portalPublicoService.listarDocumentosDeNodo(codigo, filtros);
  }

  // =====================================================================
  // Archivo
  // =====================================================================

  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_ARCHIVO_POR_MINUTO } })
  @Get('documentos/:id/visualizar')
  visualizar(
    @Param('id', PIPE_ID_DOCUMENTO) id: number,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<StreamableFile | undefined> {
    return this.entregarArchivo(id, peticion, respuesta, 'inline');
  }

  @Publico()
  @Throttle({ default: { ttl: VENTANA_MS, limit: LIMITE_ARCHIVO_POR_MINUTO } })
  @Get('documentos/:id/descargar')
  descargar(
    @Param('id', PIPE_ID_DOCUMENTO) id: number,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<StreamableFile | undefined> {
    return this.entregarArchivo(id, peticion, respuesta, 'attachment');
  }

  /**
   * ORDEN OBLIGATORIO: visibilidad, luego ETag, luego archivo.
   *
   * No es una preferencia de estilo. Si el ETag se comparara primero,
   * alguien que hubiera descargado un documento cuando estaba publicado
   * podría comprobar, enviando ese mismo ETag, si sigue existiendo después
   * de que lo pasaran a borrador: recibiría 304 en vez del 404 que recibe
   * cualquier otro. Eso es exactamente el canal lateral que el 404 único
   * trata de cerrar (spec 12.3 y 12.4).
   */
  private async entregarArchivo(
    id: number,
    peticion: Request,
    respuesta: Response,
    disposicion: 'inline' | 'attachment',
  ): Promise<StreamableFile | undefined> {
    // 1. Visibilidad. Lanza el 404 único si el documento no es público.
    const archivo = await this.portalPublicoService.resolverArchivoPublico(id);

    const etiquetaEntidad = `"${archivo.hashArchivo}"`;

    // Cabeceras comunes a la respuesta completa y a la revalidación: el 304
    // debe repetirlas para que el navegador actualice su copia guardada.
    respuesta.setHeader('ETag', etiquetaEntidad);
    respuesta.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. Revalidación. Express no compara If-None-Match cuando la respuesta
    //    es un StreamableFile —su ETag automático solo cubre cuerpos que él
    //    mismo serializa— y Apache se limita a reenviar, así que si no se
    //    hace aquí no lo hace nadie y la cabecera ETag no ahorraría nada.
    if (this.coincideElEtag(peticion.headers['if-none-match'], etiquetaEntidad)) {
      respuesta.status(HttpStatus.NOT_MODIFIED);
      // Sin cuerpo y, sobre todo, sin abrir el archivo: ese es el ahorro.
      return undefined;
    }

    // 3. Solo ahora se toca el disco.
    const nombre = this.nombreDeDescarga(archivo);

    respuesta.setHeader('Content-Type', archivo.mimeType);
    respuesta.setHeader('Content-Length', archivo.tamanoBytes);
    respuesta.setHeader(
      'Content-Disposition',
      `${disposicion}; filename="${this.aAscii(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    );

    const contenido = await this.portalPublicoService.abrirArchivo(archivo.rutaArchivo);
    return new StreamableFile(contenido);
  }

  /**
   * Compara el If-None-Match recibido con el ETag de la versión vigente.
   *
   * Acepta las tres formas que define HTTP y que los navegadores usan de
   * verdad: el comodín `*`, una lista separada por comas, y el prefijo
   * débil `W/`. Comparar la cabecera entera contra el ETag con `===`
   * funcionaría solo en el caso más simple, y fallaría en silencio —
   * reenviando el PDF completo— en cuanto el navegador mandara dos valores
   * o antepusiera `W/`.
   */
  private coincideElEtag(cabecera: string | string[] | undefined, etag: string): boolean {
    if (!cabecera) {
      return false;
    }

    const valores = (Array.isArray(cabecera) ? cabecera.join(',') : cabecera)
      .split(',')
      .map((valor) => valor.trim())
      .filter((valor) => valor.length > 0);

    if (valores.includes('*')) {
      return true;
    }

    const sinPrefijoDebil = (valor: string): string => valor.replace(/^W\//, '');

    return valores.some((valor) => sinPrefijoDebil(valor) === sinPrefijoDebil(etag));
  }

  /**
   * Nombre con el que el navegador guarda el archivo.
   *
   * Se construye desde el TÍTULO del documento y no desde
   * `nombre_archivo_original`, que puede arrastrar nombres internos del
   * estilo "borrador_final_v3.pdf" o el apellido de quien lo preparó. Si al
   * sanear no queda nada utilizable, se recurre al nombre original: es
   * preferible un nombre feo a uno vacío (P-4 del spec).
   */
  private nombreDeDescarga(archivo: ArchivoPublicoResuelto): string {
    const saneado = archivo.tituloDocumento
      // Separadores de ruta y caracteres que Windows no admite en un nombre.
      .replace(/[\\/:*?"<>|]/g, ' ')
      // Controles, incluidos los saltos de línea que romperían la cabecera.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, LARGO_MAXIMO_NOMBRE_ARCHIVO)
      .trim()
      // Windows no deja terminar un nombre en punto.
      .replace(/\.+$/, '')
      .trim();

    if (saneado.length === 0) {
      return archivo.nombreArchivoOriginal;
    }

    return saneado.toLowerCase().endsWith('.pdf') ? saneado : `${saneado}.pdf`;
  }

  /**
   * `filename` solo admite ASCII, así que las tildes se sustituyen; el
   * nombre real viaja aparte en `filename*`, que sí es UTF-8. Mismo
   * criterio que el controlador interno, para no tener dos.
   */
  private aAscii(nombre: string): string {
    // eslint-disable-next-line no-control-regex
    return nombre.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_');
  }
}
