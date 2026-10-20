# Cómo publicar el Portal de Transparencia en WordPress

**Para quien administra el WordPress de la Municipalidad de Palmares.**

No hace falta saber programar. Son **cuatro páginas y un menú**, y todo el
trabajo se hace desde el panel de WordPress: no hay que tocar ningún
archivo del servidor.

Tiempo aproximado: 20 minutos.

---

## Qué va a quedar

En el menú principal del sitio aparecerá **Transparencia**, con cuatro
opciones:

| Orden | Opción del menú |
|---|---|
| 1 | Información institucional |
| 2 | Rendición de cuentas |
| 3 | Participación ciudadana |
| 4 | Datos abiertos de gobierno |

Cada una abre una página del sitio que muestra, dentro de un recuadro, los
documentos públicos de esa sección. El recuadro viene del sistema Muni
Data; usted no tiene que mantenerlo ni actualizarlo: cuando la
municipalidad publica un documento nuevo, aparece solo.

---

## Antes de empezar: lea esto

> ### Publicar un documento en Muni Data lo hace público en Internet
>
> A partir de esta integración, cuando una persona de la municipalidad
> marca un documento como **publicado** en Muni Data, ese documento queda
> visible para cualquiera en Internet. No solo dentro de la
> municipalidad.
>
> Conviene que quienes publican documentos lo sepan. Y hay algo más que
> también se ve públicamente, y que es fácil pasar por alto: **el título,
> la descripción y las etiquetas** del documento salen en la lista, así
> que un título con el nombre de una persona es tan público como el PDF.

---

## Paso 1 — Crear las cuatro páginas

Para **cada una** de las cuatro secciones:

1. En el panel de WordPress, entre a **Páginas → Añadir nueva**.
2. Póngale de título el nombre de la sección, exactamente como aparece en
   la tabla de arriba.
3. Añada un bloque de tipo **HTML personalizado**. (Pulse el botón `+`,
   escriba «HTML» en el buscador de bloques y elija «HTML personalizado».)
4. Pegue dentro del bloque la línea que le corresponde, de la tabla del
   paso 2.
5. **Publique** la página.

No hace falta añadir texto, imágenes ni nada más. Si quiere poner una
introducción, puede agregar un bloque de párrafo **encima** del bloque
HTML.

---

## Paso 2 — Qué pegar en cada página

Cada línea se pega **completa y tal cual**, en una sola línea, dentro del
bloque HTML personalizado. No la parta ni le cambie nada.

### Información institucional

```html
<iframe src="/munipalmares/wp-munidata/vista/itsp-01" title="Transparencia: Información institucional" style="width:100%;height:800px;border:0;display:block"></iframe>
```

### Rendición de cuentas

```html
<iframe src="/munipalmares/wp-munidata/vista/itsp-02" title="Transparencia: Rendición de cuentas" style="width:100%;height:650px;border:0;display:block"></iframe>
```

### Participación ciudadana

```html
<iframe src="/munipalmares/wp-munidata/vista/itsp-03" title="Transparencia: Participación ciudadana" style="width:100%;height:650px;border:0;display:block"></iframe>
```

### Datos abiertos de gobierno

```html
<iframe src="/munipalmares/wp-munidata/vista/itsp-04" title="Transparencia: Datos abiertos de gobierno" style="width:100%;height:800px;border:0;display:block"></iframe>
```

> **Las alturas (800 px y 650 px) no son caprichosas**: son las dos que ya
> usa el iframe del Observatorio de Datos en esta misma portada, para que
> los bloques se vean parejos. Las secciones con más subsecciones llevan
> la más alta. Si alguna queda con demasiado espacio sobrante o con
> demasiado scroll, cambie solo el número de `height` de esa línea.

Si prefiere copiar las líneas en vez de teclearlas, también están
publicadas en el propio servidor, una por archivo:

```
https://SU-SERVIDOR/munipalmares/wp-munidata/iframes/transparencia-informacion-institucional.html
https://SU-SERVIDOR/munipalmares/wp-munidata/iframes/transparencia-rendicion-de-cuentas.html
https://SU-SERVIDOR/munipalmares/wp-munidata/iframes/transparencia-participacion-ciudadana.html
https://SU-SERVIDOR/munipalmares/wp-munidata/iframes/transparencia-datos-abiertos.html
```

Sustituya `SU-SERVIDOR` por la dirección real del sitio, la misma que usa
para entrar al panel de WordPress.

---

## Paso 3 — Crear el menú «Transparencia»

1. Entre a **Apariencia → Menús**.
2. Seleccione el menú principal del sitio (el que ya se ve en la portada).
3. Cree un elemento nuevo llamado **Transparencia**. Puede ser un
   «Enlace personalizado» con `#` como dirección: solo sirve para agrupar.
4. Añada las cuatro páginas del paso 1 y arrástrelas **un poco a la
   derecha**, debajo de «Transparencia», para que queden como subelementos.
5. Déjelas en el orden de la tabla del principio: ese es el orden del
   Índice de Transparencia del Sector Público y conviene no cambiarlo.
6. **Guarde el menú.**

---

## Paso 4 — Comprobar que quedó bien

Abra el sitio **como lo vería un visitante**: en una ventana de
incógnito, sin haber iniciado sesión.

1. En el menú aparece **Transparencia** con sus cuatro opciones.
2. Al entrar en una, se ve un recuadro claro con el nombre de la sección y
   unos cuadros con las subsecciones.
3. Al pulsar una subsección, aparece la lista de documentos.
4. Los botones **Ver** y **Descargar** de un documento funcionan.
5. Pruébelo también desde un teléfono.

**Participación ciudadana** mostrará «Contenido próximamente». Es lo
esperado: esa sección todavía no tiene contenido (vea el paso 6).

---

## Si el recuadro sale en blanco o sin documentos

Por orden, de la causa más común a la menos:

1. **Está abriendo el sitio por `http://` o por `http://localhost`.**
   Es la causa más frecuente y la más confusa, porque el recuadro aparece
   pero sale vacío o con un mensaje de error. El sistema solo funciona por
   **`https://`**. Abra el sitio con `https://` al principio y vuelva a
   probar.
2. **La página no está publicada**, solo guardada como borrador.
3. **La línea se pegó mal**: partida en varias líneas, con comillas
   cambiadas por las «comillas tipográficas» del editor, o en un bloque de
   párrafo en lugar de un bloque **HTML personalizado**. Bórrela y
   péguela de nuevo.
4. **La dirección tiene una errata.** Compare la línea con la del paso 2,
   carácter por carácter.
5. **Caché del navegador o del sitio.** Recargue con `Ctrl + F5`. Si el
   sitio tiene un plugin de caché, vacíela.

Si después de esto sigue sin verse, avise al equipo técnico con una
captura de la pantalla y la dirección exacta que tenía abierta.

---

## Paso 5 — Qué NO hay que tocar

- **La configuración de Apache del servidor.** No hace falta para nada de
  esto.
- **El archivo `.htaccess` de WordPress.**
- **El plugin de OneDrive** que ya está instalado. Convive sin problema
  con estos bloques; el iframe del Observatorio de Datos ya lo hace.
- **La carpeta `wp-munidata`** ni ninguno de sus archivos. La reemplaza
  entera el equipo técnico en cada actualización del sistema.

---

## Paso 6 — Añadir contenido a «Participación ciudadana»

Esa sección aparece en el menú pero todavía no tiene contenido, y **no se
llena desde Muni Data**: esa sección no lleva documentos.

Se llena desde aquí, editando su página de WordPress, y hay dos formas:

- **Escribir el contenido directamente.** Añada bloques de párrafo,
  imágenes o enlaces **encima o debajo** del bloque del iframe, o quite el
  iframe y deje solo su contenido.
- **Poner los formularios del Observatorio de Datos.** Añada un segundo
  bloque HTML personalizado, encima del de Muni Data, con el snippet que
  provee el Observatorio. Los dos recuadros conviven en la misma página
  sin interferir.

Cualquiera de las dos es un cambio solo de WordPress: nadie tiene que
modificar el sistema ni volver a desplegar nada.

---

## Nota para el equipo técnico

La ruta `/munipalmares/wp-munidata/` va **escrita fija** en los cuatro
snippets, porque son archivos estáticos y no pueden leer la configuración
del build.

Si algún día cambia la ruta de publicación, hay que cambiarla en **cuatro
sitios a la vez**, y olvidar uno deja el sistema roto de una forma
distinta en cada caso:

| Sitio | Si no se cambia |
|---|---|
| `VITE_RUTA_BASE` en `frontend/.env.production` | Los recursos del frontend dan 404 |
| `RewriteBase` en `frontend/public/.htaccess` | Las rutas profundas dejan de resolverse al recargar |
| `ProxyPass` en `despliegue/apache/munidata.conf` | La API deja de responder |
| Estos cuatro snippets | Los iframes salen en blanco en WordPress |
