// src/correo/plantillas-correo.ts
//
// Plantilla HTML de los correos transaccionales, con identidad
// institucional básica: nombre de la Municipalidad, el rojo primario del
// Design System (#d30505, `primary-container`) y un botón de llamada a la
// acción. Es una sola función porque los dos correos que envía el sistema
// (verificación y recuperación) sólo cambian en los textos.
//
// Todo el estilo va en línea a propósito: los clientes de correo ignoran
// las hojas de estilo externas y muchos descartan el <style> del <head>.

export const COLOR_PRIMARIO = '#d30505';
export const NOMBRE_INSTITUCION = 'Municipalidad de Palmares';

export interface ContenidoCorreoInstitucional {
  /** Título grande del cuerpo, ej. "Recuperación de contraseña". */
  titulo: string;
  /** Párrafos del mensaje, en orden. Se escapan como texto. */
  parrafos: string[];
  textoBoton: string;
  enlace: string;
  /** Aviso final en gris, ej. "Si usted no solicitó esto, ignore este mensaje". */
  nota: string;
  /** Vigencia del enlace, ya redactada, ej. "60 minutos". */
  vigencia: string;
}

/** Evita que un texto con `<` o `&` rompa el HTML o inyecte marcado. */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function construirCorreoInstitucional(contenido: ContenidoCorreoInstitucional): string {
  const parrafos = contenido.parrafos
    .map(
      (parrafo) =>
        `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#1f1f1f;">${escaparHtml(parrafo)}</p>`,
    )
    .join('');

  const enlace = escaparHtml(contenido.enlace);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escaparHtml(contenido.titulo)} — ${NOMBRE_INSTITUCION}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f3f3;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f3f3;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e3e3e3;">
          <tr>
            <td style="background-color:${COLOR_PRIMARIO};padding:20px 32px;">
              <p style="margin:0;font-size:18px;line-height:24px;font-weight:bold;color:#ffffff;">${NOMBRE_INSTITUCION}</p>
              <p style="margin:4px 0 0 0;font-size:13px;line-height:18px;color:#ffe0e0;">Sistema Integral de Gestión Documental</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 20px 0;font-size:22px;line-height:28px;color:#1f1f1f;">${escaparHtml(contenido.titulo)}</h1>
              ${parrafos}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:${COLOR_PRIMARIO};border-radius:8px;">
                    <a href="${enlace}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escaparHtml(contenido.textoBoton)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:#5f5f5f;">Este enlace es válido por ${escaparHtml(contenido.vigencia)}. Si el botón no funciona, copie y pegue esta dirección en su navegador:</p>
              <p style="margin:0 0 24px 0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${enlace}" style="color:${COLOR_PRIMARIO};">${enlace}</a></p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#5f5f5f;">${escaparHtml(contenido.nota)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background-color:#f8f8f8;border-top:1px solid #e3e3e3;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#7a7a7a;">${NOMBRE_INSTITUCION} · Portal de Gobierno Abierto y Transparencia. Este es un mensaje automático; por favor no responda a este correo.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versión en texto plano para clientes que no muestran HTML. */
export function construirTextoPlano(contenido: ContenidoCorreoInstitucional): string {
  return [
    `${NOMBRE_INSTITUCION} — ${contenido.titulo}`,
    '',
    ...contenido.parrafos,
    '',
    `${contenido.textoBoton}: ${contenido.enlace}`,
    `(Enlace válido por ${contenido.vigencia})`,
    '',
    contenido.nota,
  ].join('\n');
}
