# Guía de despliegue — Muni Data

Sistema Integral de Gestión Documental y Portal de Transparencia Municipal
de la Municipalidad de Palmares.

Esta guía describe el despliegue completo en la máquina virtual Windows que
ya ejecuta Apache con WordPress y otros sistemas municipales. Está escrita
para ejecutarse de principio a fin por sesión remota, sin asistencia de
terceros: cada comando se puede copiar y pegar tal como aparece.

**Arquitectura objetivo**

| Componente | Cómo corre |
| --- | --- |
| Frontend (Vue) | Archivos estáticos servidos por Apache en `/munipalmares/wp-munidata/` |
| Backend (NestJS) | Servicio de Windows `MuniData-API`, escuchando solo en `127.0.0.1:3000` |
| API pública | Apache hace proxy de `/munipalmares/wp-munidata/api/` hacia el backend |
| Base de datos | MySQL 8 como servicio de Windows en la misma máquina |
| HTTPS | Lo resuelve Apache; el backend nunca habla TLS |

El frontend y la API comparten origen. Eso no es un detalle: es lo que hace
que no haya CORS y que la cookie `httpOnly` del refresh token funcione sin
tratamiento de terceros.

> **Antes de empezar.** Todos los scripts aceptan `-Simular`, que imprime
> lo que harían sin ejecutar nada. Si alguna vez duda de qué va a pasar,
> agregue `-Simular` y léalo primero.

---

## 1. Requisitos previos

Ejecute primero la comprobación automática desde la carpeta del
repositorio:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-requisitos.ps1
```

Si conoce la ruta de Apache, páselas para que también revise los módulos:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-requisitos.ps1 -RutaHttpd "C:\Apache24\bin\httpd.exe"
```

El script informa cada requisito como **OK**, **AVISO** o **FALTA**, y
termina con código 1 si falta algo. No instala nada.

### 1.1 Node.js (versión LTS)

Descargue el instalador MSI de 64 bits de <https://nodejs.org/es> e
instálelo con las opciones por defecto. Se requiere la versión 20 o
superior.

```
node --version
npm --version
```

### 1.2 Git para Windows

Desde <https://git-scm.com/download/win>, opciones por defecto.

```
git --version
```

### 1.3 NSSM

NSSM es lo que convierte el proceso de Node en un servicio de Windows. Es
la misma herramienta que ya usan los otros sistemas de la VM.

1. Descargue el ZIP de <https://nssm.cc/download>.
2. Copie `win64\nssm.exe` a una carpeta estable, por ejemplo
   `C:\herramientas\nssm.exe`.
3. Agregue esa carpeta al `PATH` del sistema, o pase `-RutaNssm` a los
   scripts que lo necesiten.

```
nssm version
```

### 1.4 MySQL 8

Si la VM ya tiene MySQL instalado, basta con comprobar que el servicio
corre y que las herramientas de línea de comandos están accesibles.

```
Get-Service | Where-Object { $_.Name -match 'mysql' }
mysql --version
mysqldump --version
```

Si `mysql` o `mysqldump` no se encuentran, agregue al `PATH` la carpeta
`bin` de MySQL (habitualmente `C:\Program Files\MySQL\MySQL Server 8.0\bin`).

Si MySQL no está instalado, use el instalador de
<https://dev.mysql.com/downloads/installer/>, elija *Server only*,
configúrelo como servicio de arranque automático y guarde la contraseña de
`root` en un lugar seguro: la necesitará una sola vez, en el paso 2.2.

### 1.5 Módulos de Apache

Deben estar activos cuatro módulos. Compruébelo con:

```
httpd -M
```

Deben aparecer `proxy_module`, `proxy_http_module`, `headers_module` y
`rewrite_module`. Si falta alguno, abra `httpd.conf` y quite el `#` de la
línea `LoadModule` correspondiente:

```
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule headers_module modules/mod_headers.so
LoadModule rewrite_module modules/mod_rewrite.so
```

Después **valide la sintaxis antes de reiniciar**. Si `httpd -t` falla y
reinicia de todos modos, Apache no arranca y se cae WordPress junto con
todo lo demás:

```
httpd -t
```

---

## 2. Orden de ejecución el día del despliegue

Los pasos van en este orden porque cada uno depende del anterior. Anote la
hora de inicio: si algo sale mal, los registros de esa franja son lo
primero que hay que leer.

### 2.1 Obtener el código

```
cd C:\munidata-repo
git clone https://github.com/GeraldHR17/gestor-documental-pps.git .
```

Si el repositorio ya está clonado:

```
cd C:\munidata-repo
git pull
```

> La carpeta del repositorio es independiente de `C:\munidata`. El
> repositorio es código fuente; `C:\munidata` guarda lo que se ejecuta y
> los datos.

### 2.2 Preparar la base de datos

```
powershell -ExecutionPolicy Bypass -File .\despliegue\preparar-base-datos.ps1
```

Le pedirá, sin mostrar lo que escribe:

1. La contraseña de `root` en MySQL.
2. Una contraseña **nueva** para el usuario `munidata_app`, dos veces.
   Mínimo 12 caracteres, sin comillas simples ni barras invertidas.
   **Anótela**: la necesitará en el paso 2.4.

**Qué esperar.** El script crea la base `munidata` con `utf8mb4`, crea el
usuario `munidata_app` con privilegios `SELECT, INSERT, UPDATE, DELETE`
solo sobre esa base, y aplica los scripts SQL numerados. Al terminar
imprime un resumen parecido a:

```
  Scripts aplicados ahora : 8
  Roles                   : 3
  Permisos                : 10
  Categorias ITSP         : 17
  Tipos de documento      : 30
  Usuarios                : 0
```

**`Usuarios: 0` es lo correcto.** El script
`06-usuario-superadministrador.sql` se omite a propósito: crea una cuenta
con la contraseña publicada en el script 06. El administrador inicial se
crea en el paso 2.6 con una contraseña que solo usted conoce.

El script es idempotente. Lleva una tabla `scripts_aplicados` dentro de la
propia base, así que volver a ejecutarlo solo aplica los scripts nuevos.

### 2.3 Primera ejecución del despliegue

Necesita saber dónde está `htdocs`. Búsquelo en `httpd.conf`, en la
directiva `DocumentRoot`.

**Abra PowerShell como administrador** (crea un servicio y escribe en el
registro) y ejecute:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs"
```

La primera vez el script crea `C:\munidata\config\.env.produccion`, genera
los secretos JWT y **se detiene con código 2**, pidiéndole que complete el
resto. Eso es lo esperado, no un error.

### 2.4 Completar las variables de entorno

```
notepad C:\munidata\config\.env.produccion
```

Reemplace **todos** los valores que empiezan por `CAMBIEME`:

| Variable | Qué poner |
| --- | --- |
| `BD_CONTRASENA` | La contraseña de `munidata_app` del paso 2.2 |
| `FRONTEND_URL` | La URL pública real, con la subruta y **sin barra final** |
| `SMTP_USER` | La cuenta de Gmail del proyecto |
| `SMTP_PASS` | La contraseña de aplicación, **sin espacios** |
| `SMTP_FROM` | La misma dirección que `SMTP_USER` |

Los dos secretos `JWT_*` ya están generados; no los toque.

**Sobre `SMTP_PASS`:** Google muestra la contraseña de aplicación en cuatro
grupos de cuatro letras (`xxxx xxxx xxxx xxxx`). Escríbala como una sola
palabra de 16 letras minúsculas. Debe ser una contraseña de aplicación, no
la contraseña de la cuenta: con la contraseña normal, Gmail responde
`534-5.7.9` y no envía nada.

No use comillas alrededor de ningún valor: en un archivo `.env` las
comillas viajan como parte del valor.

### 2.5 Ejecutar el despliegue de verdad

El mismo comando del paso 2.3:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs"
```

Ahora sí recorre todo: valida las variables, respalda lo que haya
publicado, compila el backend y el frontend, publica ambos, registra el
servicio `MuniData-API`, carga sus variables de entorno, lo arranca y
ejecuta la verificación.

**Qué esperar.** Termina con `DESPLIEGUE COMPLETADO`. Las pruebas que pasan
por Apache fallarán todavía, porque Apache no está configurado: eso se hace
en el paso 3.

Si el servicio no arranca:

```
Get-Content C:\munidata\registros\api-error.log -Tail 40
```

### 2.6 Crear el administrador inicial

```
powershell -ExecutionPolicy Bypass -File .\despliegue\crear-administrador.ps1
```

Pide correo, nombre completo y contraseña (dos veces, sin mostrarla). La
contraseña debe tener al menos 12 caracteres, con mayúscula, minúscula y
número, la misma política que aplica la interfaz.

El script es idempotente: si ya existe un usuario con ese correo, no
modifica nada.

### 2.7 Programar los respaldos

```
powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1 -RegistrarTarea
```

Crea la tarea `MuniData-Respaldo-Diario`, que corre todos los días a las
02:30 como `SYSTEM`. Pedirá una vez la contraseña de `munidata_app` para
guardarla en un archivo de opciones con permisos restringidos: una tarea
programada no puede escribirla cada noche.

Compruebe que funciona ejecutándola ahora mismo:

```
Start-ScheduledTask -TaskName 'MuniData-Respaldo-Diario'
Get-ScheduledTaskInfo -TaskName 'MuniData-Respaldo-Diario'
Get-ChildItem C:\munidata\respaldos
```

---

## 3. Configuración de Apache

Este es el único paso que toca un servicio compartido con WordPress.
Hágalo con calma y valide antes de reiniciar.

### 3.1 Copiar el archivo de configuración

```
Copy-Item .\despliegue\apache\munidata.conf C:\Apache24\conf\extra\munidata.conf
```

### 3.2 Ajustar las dos rutas

```
notepad C:\Apache24\conf\extra\munidata.conf
```

Busque las líneas marcadas con `AJUSTAR`:

1. El bloque `<Directory "C:/Apache24/htdocs/munipalmares/wp-munidata">`
   debe apuntar a la carpeta real donde se publicó el frontend. Las rutas
   de Apache se escriben con `/` incluso en Windows.
2. El puerto del `ProxyPass` (3000 por defecto) debe coincidir con `PUERTO`
   de `.env.produccion`.

> Si `httpd.conf` ya define un `<Directory>` para `htdocs` con
> `AllowOverride All`, no hace falta tocar nada más: el bloque de
> `munidata.conf` es más específico y gana. **No reemplace el bloque
> existente**, que es el que usa WordPress.

### 3.3 Incluir el archivo

Edite la configuración de Apache y agregue la línea de `Include` **dentro
del `<VirtualHost *:443>` que ya sirve HTTPS**:

```
Include conf/extra/munidata.conf
```

### 3.4 Validar y reiniciar

```
httpd -t
```

Debe responder `Syntax OK`. **Si no lo hace, no reinicie**: corrija primero.

```
Restart-Service -Name Apache2.4
```

El nombre del servicio puede variar. Para averiguarlo:

```
Get-Service | Where-Object { $_.Name -match 'apache|httpd' }
```

### 3.5 Verificar

```
powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-despliegue.ps1 -UrlPublica "https://<host>/munipalmares/wp-munidata"
```

Reemplace `<host>` por la dirección real de la VM, la misma que puso en
`FRONTEND_URL`. Ahora deberían pasar las siete comprobaciones.

### 3.6 Revertir el cambio de Apache

Si algo se rompió, comente la línea del paso 3.3:

```
# Include conf/extra/munidata.conf
```

Valide y reinicie:

```
httpd -t
Restart-Service -Name Apache2.4
```

Muni Data queda inaccesible, pero WordPress y los demás sistemas vuelven
exactamente al estado anterior. El servicio `MuniData-API` sigue corriendo
y no afecta a nada: solo escucha en loopback.

---

## 4. Variables de entorno de producción

Viven en `C:\munidata\config\.env.produccion`, fuera del repositorio y
fuera de `htdocs`. Esto último es deliberado: ninguna configuración de
Apache, por errónea que sea, puede servir ese archivo por HTTP.

La plantilla con los comentarios completos está en
`despliegue\.env.produccion.ejemplo`.

| Variable | Propósito | Quién la define |
| --- | --- | --- |
| **`NODE_ENV`** | Debe valer exactamente `production`. Activa `logging: false` en TypeORM, `secure: true` en la cookie del refresh y evita que el correo caiga en la cuenta de pruebas | La plantilla |
| `PUERTO` | Puerto local del backend | `desplegar.ps1` |
| **`HOST_ESCUCHA`** | `127.0.0.1`. Deja el puerto accesible solo desde la propia VM, de modo que el único camino a la API es Apache. **No lo cambie a `0.0.0.0`** | La plantilla |
| `CONFIAR_EN_PROXY` | `true`. Hace que Express lea `X-Forwarded-For/Proto`; sin esto la limitación de tasa agruparía a todos los usuarios como uno solo | La plantilla |
| **`FRONTEND_URL`** | URL pública con la subruta y **sin barra final**. Construye los enlaces de los correos y deriva el origen de CORS. Si queda en `localhost`, los enlaces de recuperación de contraseña no funcionan para nadie | Gerald |
| `BD_HOST`, `BD_PUERTO`, `BD_NOMBRE` | Conexión a MySQL | La plantilla |
| `BD_USUARIO` | `munidata_app`, nunca `root` | `preparar-base-datos.ps1` |
| `BD_CONTRASENA` | La definida en el paso 2.2 | Gerald |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Firman los tokens. 64 bytes aleatorios. Cambiarlos invalida todas las sesiones activas | `desplegar.ps1`, automático |
| `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION` | Vida de cada token. La sesión tiene además un límite absoluto de 8 horas | La plantilla |
| `BCRYPT_SALT_ROUNDS` | `12`. No lo baje: es el valor con el que se generaron los hash existentes | La plantilla |
| `LOGIN_MAX_INTENTOS`, `LOGIN_BLOQUEO_MINUTOS` | Bloqueo por intentos fallidos | La plantilla |
| `TOKEN_RECUPERACION_EXPIRACION_MIN`, `TOKEN_VERIFICACION_EXPIRACION_HORAS` | Vigencia de los enlaces de los correos | La plantilla |
| **`RUTA_ALMACENAMIENTO`** | `C:\munidata\storage\documentos`. Está fuera de `htdocs` a propósito: no debe existir forma de descargar un PDF sin pasar por la API, que verifica permisos y registra la descarga | `desplegar.ps1` |
| `BITACORA_RETENCION_MESES` | `3`. La purga corre el día 1 de cada mes y el borrado es **físico, sin respaldo previo** | La plantilla |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.gmail.com` y `587` (STARTTLS) | La plantilla |
| `SMTP_USER`, `SMTP_FROM` | La cuenta de Gmail del proyecto. Deben coincidir: Gmail reescribe el remitente a la cuenta autenticada salvo alias verificado | Gerald |
| **`SMTP_PASS`** | Contraseña de aplicación de 16 letras, **SIN ESPACIOS** | Gerald |

Para cambiar cualquier variable después del despliegue, edite el archivo y
vuelva a ejecutar `desplegar.ps1`: las variables se releen y se reescriben
en el servicio. Editar el archivo sin redesplegar no surte efecto, porque
el servicio las toma del registro de Windows, no del archivo.

---

## 5. Actualizaciones posteriores

```
cd C:\munidata-repo
git pull
powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs"
```

`desplegar.ps1` respalda lo que hay publicado antes de reemplazarlo, así
que siempre existe una versión a la que volver. No hace falta tocar Apache
otra vez.

Si la actualización trae scripts SQL nuevos, ejecute también:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\preparar-base-datos.ps1
```

Aplicará solo los que falten, según la tabla `scripts_aplicados`.

---

## 6. Rollback

```
powershell -ExecutionPolicy Bypass -File .\despliegue\revertir.ps1 -RutaHtdocs "C:\Apache24\htdocs"
```

Detiene el servicio, restaura el backend y el frontend del último respaldo
que contenga código, reinstala las dependencias de producción, arranca el
servicio y verifica.

Para volver a un respaldo concreto, páselo por su marca de tiempo:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\revertir.ps1 -RutaHtdocs "C:\Apache24\htdocs" -Respaldo "20261009-154234"
```

**La base de datos no se restaura automáticamente**, y es deliberado:
restaurar un volcado destruye todos los documentos, versiones, usuarios y
bitácora registrados después de esa fecha. Al terminar, el script imprime
el comando exacto para hacerlo a mano si de verdad hace falta.

---

## 7. Respaldos y restauración

### 7.1 Respaldo manual

```
powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1
```

Genera en `C:\munidata\respaldos\<fecha-hora>`:

- `base-datos.sql.gz` — volcado con `mysqldump --single-transaction`,
  comprimido. Esa opción toma una instantánea coherente sin bloquear las
  tablas, así que el sistema sigue funcionando durante el respaldo.
- `documentos.zip` — copia comprimida de los PDF.

Conserva los 14 más recientes y borra los anteriores.

### 7.2 Restaurar la base de datos

> **Destruye** todo lo registrado después de la fecha del volcado. No hay
> forma de recuperarlo luego. Haga un respaldo del estado actual antes.

```
cd C:\munidata\respaldos\<fecha-hora>
node -e "const z=require('zlib'),f=require('fs');f.writeFileSync('restaurar.sql',z.gunzipSync(f.readFileSync('base-datos.sql.gz')))"
mysql -u munidata_app -p munidata < restaurar.sql
del restaurar.sql
```

Reinicie el servicio después, para que el pool de conexiones se rehaga:

```
nssm restart MuniData-API
```

### 7.3 Restaurar los documentos

```
Expand-Archive -Path C:\munidata\respaldos\<fecha-hora>\documentos.zip -DestinationPath C:\munidata\storage\documentos -Force
```

La base guarda las rutas de los archivos relativas a
`RUTA_ALMACENAMIENTO`, así que los nombres no deben cambiarse. Base de
datos y documentos deben restaurarse **del mismo respaldo**: si no, habrá
documentos registrados cuyo archivo no existe (la API responde un error
controlado) o archivos huérfanos en disco.

---

## 8. Prueba de humo funcional

Después de la verificación automática, compruebe a mano estos nueve puntos
desde un navegador. Es la única forma de validar el comportamiento real.

1. **Inicio de sesión.** Abra
   `https://<host>/munipalmares/wp-munidata/` e inicie sesión con la cuenta
   creada en el paso 2.6. Debe llegar al panel de Inicio con los
   indicadores.

2. **Persistencia de la sesión.** Recargue la página con F5. **Debe seguir
   dentro.** Si lo devuelve al login, la cookie del refresh token no está
   persistiendo: vaya a la sección 9.3.

3. **Carga de un documento.** Registre un documento con el asistente de
   tres pasos y suba un PDF. Debe guardarse en estado `BORRADOR`.

4. **Visor y descarga.** Abra el documento y compruebe que el PDF se ve en
   el visor y que la descarga funciona.

5. **Cambio de estado.** Publique el documento. Debe pasar a `PUBLICADO`.

6. **Bitácora.** Entre a Bitácora y compruebe que aparecen las acciones
   anteriores, con su usuario y su fecha.

7. **Recuperación de contraseña.** Desde el login, pida recuperar la
   contraseña de una cuenta real. Compruebe que el correo **llega** y, sobre
   todo, que el enlace del correo **abre la ruta correcta** de la VM y no
   `localhost`. Si abre `localhost`, `FRONTEND_URL` está mal.

8. **Ruta profunda.** Copie la URL de un documento abierto, péguela en una
   pestaña nueva y recargue. Debe cargar la aplicación, no un 404.

9. **Limpieza.** Borre el documento de prueba (inactivándolo) para no dejar
   datos de prueba en producción.

> **Nota sobre los correos.** Crear un usuario desde la aplicación **no
> envía ningún correo**: la contraseña temporal se la debe entregar a cada
> persona por otro medio. Y el reenvío de verificación de correo
> (`POST /auth/verificar-correo/reenviar`) es hoy código inalcanzable: toda
> cuenta creada por un administrador nace con el correo ya verificado, y no
> existe registro público. El único correo que el sistema envía en la
> práctica es el de recuperación de contraseña.

---

## 9. Solución de problemas comunes

### 9.1 `502 Bad Gateway` de Apache

Apache no pudo hablar con el backend.

```
Get-Service MuniData-API
Get-NetTCPConnection -LocalPort 3000 -State Listen
Get-Content C:\munidata\registros\api-error.log -Tail 40
```

Causas, en orden de frecuencia:

- El servicio está detenido o reiniciándose en bucle. El log de errores
  dice por qué; lo más común es que no alcanza MySQL.
- El puerto del `ProxyPass` no coincide con `PUERTO` de `.env.produccion`.
- Falta `proxy_http_module`. Compruebe con `httpd -M`.

### 9.2 `404` en rutas profundas

La aplicación carga en la raíz, pero recargar en `/documentos/7` da 404.
Apache no está aplicando el fallback del `.htaccess`.

- Falta `AllowOverride All` en el `<Directory>` de la carpeta. Sin eso,
  Apache ignora el `.htaccess` por completo.
- Falta `rewrite_module`.
- El `RewriteBase` del `.htaccess` no coincide con la ruta pública real.
  Compruébelo:

  ```
  Get-Content C:\Apache24\htdocs\munipalmares\wp-munidata\.htaccess | Select-String RewriteBase
  ```

  Debe coincidir con `VITE_RUTA_BASE` de `frontend\.env.production`. Si la
  ruta de publicación es otra, hay que cambiar los dos y recompilar.

### 9.3 La sesión no persiste al recargar

Inicia sesión bien, pero F5 lo devuelve al login. La cookie del refresh
token no está llegando de vuelta.

La causa habitual es que falte `ProxyPassReverseCookiePath` en
`munidata.conf`. El backend emite la cookie con `Path=/auth`, pero el
navegador ve la aplicación bajo `/munipalmares/wp-munidata/`, así que una
cookie con `Path=/auth` no se envía nunca. Compruebe que esté la línea:

```
ProxyPassReverseCookiePath /auth /munipalmares/wp-munidata/api/auth
```

Otras causas:

- `NODE_ENV` no vale `production`, de modo que la cookie sale sin `secure`
  y el navegador la rechaza sobre HTTPS en algunos casos.
- Se está accediendo por HTTP en lugar de HTTPS.

Para verlo en el navegador: F12 → Aplicación → Cookies. Debe existir
`refreshToken` con `Path=/munipalmares/wp-munidata/api/auth`.

### 9.4 Puerto ocupado

```
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
```

Si es otro sistema de la VM, elija otro puerto. Hay que cambiarlo en tres
sitios a la vez:

1. `PUERTO` en `C:\munidata\config\.env.produccion`
2. El `ProxyPass` de `munidata.conf`
3. El parámetro `-Puerto` de `desplegar.ps1`

### 9.5 Error de certificado

Si el certificado es autofirmado, el navegador avisa. No es un problema del
sistema: es el mismo certificado con el que ya se sirven los otros
sistemas.

`verificar-despliegue.ps1` ignora la validación del certificado a
propósito, solo dentro de su propio proceso, para poder probar la
aplicación sin que la validación lo detenga antes.

### 9.6 El correo no sale

La API responde `200` en recuperación de contraseña **aunque el envío
falle**: la respuesta es genérica por diseño, para que nadie pueda
averiguar qué correos están registrados. Un `200` no confirma nada.

Mire el log del servicio: un envío correcto deja una línea
`Correo enviado a ... : 250 2.0.0 OK`.

```
Get-Content C:\munidata\registros\api-salida.log -Tail 40 | Select-String 'Correo'
```

Para diagnosticar la configuración SMTP, desde la carpeta del repositorio:

```
cd backend
npm run correo:verificar
```

Ese comando autentica de verdad contra el servidor y traduce el código de
respuesta a una causa concreta. Códigos habituales:

- `534-5.7.9` — `SMTP_PASS` es la contraseña de la cuenta, no una
  contraseña de aplicación.
- `535-5.7.8` — la contraseña de aplicación fue revocada o está mal
  copiada.
- `ETIMEDOUT` — el firewall de salida bloquea el puerto 587. Compruébelo
  con:

  ```
  Test-NetConnection -ComputerName smtp.gmail.com -Port 587
  ```

### 9.7 El servicio no arranca

```
Get-Content C:\munidata\registros\api-error.log -Tail 60
```

Causas frecuentes:

- `Access denied for user` — `BD_USUARIO` o `BD_CONTRASENA` incorrectos.
- `ECONNREFUSED 127.0.0.1:3306` — el servicio de MySQL está detenido.
- `Falta la variable de entorno JWT_ACCESS_SECRET` — las variables no
  llegaron al servicio. Vuelva a ejecutar `desplegar.ps1`.

Para comprobar qué variables recibió el servicio (muestra también los
valores, así que hágalo solo si es necesario y no comparta la salida):

```
nssm get MuniData-API AppEnvironmentExtra
```

---

## 10. Notas de seguridad

Decisiones de diseño del despliegue, alineadas con ISO/IEC 27001.

**Secretos fuera del repositorio y fuera de `htdocs`** (A.9.4, A.14.2).
`.env.produccion` vive en `C:\munidata\config`, con la herencia de permisos
quitada y acceso solo para administradores y `SYSTEM`. Ninguna
configuración de Apache puede servirlo. El repositorio contiene únicamente
plantillas con valores ficticios, y `.gitignore` cubre `.env` y `.env.*`.

**Mínimo privilegio en la base de datos** (A.9.2). El backend se conecta
como `munidata_app`, con `SELECT, INSERT, UPDATE, DELETE` solo sobre la
base `munidata`. Sin DDL: el esquema lo gobiernan los scripts SQL y TypeORM
corre con `synchronize: false`, así que la aplicación no puede alterar
tablas ni siquiera por error. Nunca se usa `root`.

**Superficie de red mínima** (A.13.1). El backend escucha solo en
`127.0.0.1`. No hay que abrir ningún puerto en el firewall: el único camino
hacia la API es el proxy de Apache, que además impone un límite de 40 MiB
por petición.

**HTTPS y cookies** (A.10.1, A.14.1). TLS lo termina Apache. La cookie del
refresh token es `httpOnly`, `secure` y `sameSite=strict`, y el access token
nunca se guarda en `localStorage`. La sesión expira de forma absoluta a las
8 horas, y la rotación del refresh hereda la fecha original en vez de
reiniciar el plazo.

**Documentos fuera del árbol web** (A.9.4). Los PDF se guardan en
`C:\munidata\storage\documentos` con nombre UUID, fuera de `htdocs` y sin
middleware estático. El único acceso es
`GET /documentos/:id/visualizar|descargar`, que verifica el permiso y
registra la descarga en la bitácora.

**Trazabilidad** (A.12.4). Toda acción relevante queda en `bitacora_logs`,
sin contraseñas ni tokens en claro. **Atención:** la retención es de 3 meses
y el borrado es **físico, sin respaldo previo**. Si la institución necesita
conservar el histórico más allá de esa ventana —lo habitual en auditoría—
hay que exportar el tramo antes de que la purga lo elimine. Está pendiente
de decisión.

**Respaldos** (A.12.3). Diarios y automáticos, con 14 días de retención,
cubriendo base de datos y documentos. Un respaldo que nunca se probó no es
un respaldo: pruebe la restauración al menos una vez en un entorno aparte.

**Credenciales iniciales.** El script
`06-usuario-superadministrador.sql` no se aplica en producción porque su
contraseña está publicada en el repositorio. La primera cuenta se crea con
`crear-administrador.ps1`, que nunca escribe la contraseña en disco ni en la
línea de comandos.
