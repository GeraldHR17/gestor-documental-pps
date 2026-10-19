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
| Backend (NestJS) | Servicio de Windows `MuniData-API`, escuchando solo en `127.0.0.1:3100` |
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
`root` en un lugar seguro: la necesitará una sola vez, en el paso 3.2.

---

## 2. Reconocimiento previo (solo lectura)

Antes de cambiar nada conviene mirar. **Ninguno de los comandos de esta
sección modifica el sistema**: todos leen. El objetivo es llegar al
despliegue sabiendo qué hay, en vez de descubrirlo a mitad de camino.

Esta VM no está vacía: Apache ya sirve WordPress y otros sistemas
municipales, y hay procesos escuchando en los puertos **3000, 3306, 7070,
8081, 8082, 9002 y 9090**. Muni Data usa el **3100** precisamente para no
chocar con ninguno.

> **Nada de lo que ya está configurado se modifica.** En particular, el
> servicio de MySQL escucha en `0.0.0.0:3306`, lo cual no es ideal pero lo
> dejó otro sistema que depende de ello: **no se cambia**. Muni Data se
> conecta por `127.0.0.1` y su usuario de base de datos solo existe para
> `localhost` y `127.0.0.1`, nunca para `%`, así que ese `0.0.0.0` no le
> añade exposición. Los puertos de los otros sistemas tampoco se tocan.

### 2.1 Módulos de Apache cargados

```
C:\Apache24\bin\httpd.exe -M
```

Deben aparecer `proxy_module`, `proxy_http_module`, `rewrite_module` y
`headers_module`. Anote cuáles faltan.

### 2.2 Qué dice la configuración actual

```
Select-String -Path C:\Apache24\conf\httpd.conf -Pattern '^\s*#?\s*LoadModule\s+(proxy|proxy_http|rewrite|headers)_module'
Select-String -Path C:\Apache24\conf\httpd.conf -Pattern '^\s*DocumentRoot'
Select-String -Path C:\Apache24\conf\*.conf, C:\Apache24\conf\extra\*.conf -Pattern 'ProxyPass|AllowOverride|Include ' -ErrorAction SilentlyContinue
```

La primera línea muestra si los `LoadModule` están comentados o activos.
La tercera dice si ya existe algún `ProxyPass` (para no duplicar rutas) y
con qué valor está `AllowOverride`, del que depende que el `.htaccess` del
frontend se aplique.

### 2.3 La carpeta de destino

```
Test-Path C:\Apache24\htdocs\munipalmares\wp-munidata
Get-ChildItem C:\Apache24\htdocs\munipalmares -ErrorAction SilentlyContinue
Get-ChildItem C:\Apache24\htdocs\munipalmares\wp-munidata -Force -ErrorAction SilentlyContinue
```

Lo que se busca saber es si la carpeta ya existe y qué contiene. `-Force`
es necesario para ver los archivos que empiezan por punto.

`desplegar.ps1` **se niega a publicar** si esa carpeta tiene contenido y
no lleva el archivo marcador `.munidata-despliegue`, precisamente para no
borrar la carpeta de otro sistema por una ruta mal escrita. Si contiene
algo que no es de Muni Data, no la fuerce: revise la ruta.

### 2.4 Puertos y servicios

```
Get-NetTCPConnection -State Listen | Sort-Object LocalPort | Select-Object LocalAddress, LocalPort, OwningProcess
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
Get-Service | Where-Object { $_.Name -match 'Apache|mysql|nssm' }
```

El puerto 3100 debe aparecer libre. Si estuviera ocupado, elija otro y
cámbielo en los tres sitios que indica la sección 10.4.

### 2.5 Comprobación automática

Todo lo anterior, más Node, Git, NSSM y el cliente de MySQL, lo revisa de
una vez:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-requisitos.ps1 -RutaHttpd "C:\Apache24\bin\httpd.exe"
```

Ese script también **imprime la ruta exacta de `nssm.exe` y de
`mysql.exe` aunque no estén en el `PATH`**, lista para pasarla por
parámetro. En esta VM ambos están fuera del `PATH`, así que esa salida
ahorra buscarlos a mano.

### 2.6 Habilitar los módulos que falten

Solo si el paso 2.1 mostró alguno ausente.

**Primero, copia de seguridad.** Si Apache no arranca después del cambio,
esto es lo que permite volver atrás:

```
Copy-Item C:\Apache24\conf\httpd.conf "C:\Apache24\conf\httpd.conf.respaldo-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
```

Edite el archivo y quite el `#` del inicio de las líneas que falten:

```
notepad C:\Apache24\conf\httpd.conf
```

```
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule headers_module modules/mod_headers.so
```

**Valide la sintaxis antes de reiniciar.** Este paso no es opcional: si
`httpd -t` falla y usted reinicia de todos modos, Apache no arranca y se
cae WordPress junto con todo lo demás que sirve esta VM.

```
C:\Apache24\bin\httpd.exe -t
```

Debe responder `Syntax OK`. **Solo entonces**:

```
Restart-Service -Name Apache2.4
```

Y confirme que quedaron cargados:

```
C:\Apache24\bin\httpd.exe -M
```

Si algo salió mal, restaure el respaldo, valide y reinicie:

```
Copy-Item "C:\Apache24\conf\httpd.conf.respaldo-<marca>" C:\Apache24\conf\httpd.conf -Force
C:\Apache24\bin\httpd.exe -t
Restart-Service -Name Apache2.4
```

---

## 3. Orden de ejecución el día del despliegue

Los pasos van en este orden porque cada uno depende del anterior. Anote la
hora de inicio: si algo sale mal, los registros de esa franja son lo
primero que hay que leer.

### 3.1 Obtener el código

```
New-Item -ItemType Directory -Path C:\munidata -Force
cd C:\munidata
git clone https://github.com/GeraldHR17/gestor-documental-pps.git
cd gestor-documental-pps
```

Si el repositorio ya está clonado:

```
cd C:\munidata\gestor-documental-pps
git pull
```

> El repositorio queda en `C:\munidata\gestor-documental-pps`, dentro de
> la carpeta de datos pero separado de ella: el repositorio es código
> fuente, y `C:\munidata\backend`, `C:\munidata\config`,
> `C:\munidata\storage`, `C:\munidata\registros` y
> `C:\munidata\respaldos` guardan lo que se ejecuta y los datos. Los
> scripts de despliegue no tocan nunca la carpeta del repositorio.

### 3.2 Preparar la base de datos

```
powershell -ExecutionPolicy Bypass -File .\despliegue\preparar-base-datos.ps1
```

Le pedirá, sin mostrar lo que escribe:

1. La contraseña de `root` en MySQL.
2. Una contraseña **nueva** para el usuario `munidata_app`, dos veces.
   Mínimo 12 caracteres, sin comillas simples ni barras invertidas.
   **Anótela**: la necesitará en el paso 3.4.

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
crea en el paso 3.6 con una contraseña que solo usted conoce.

El script es idempotente. Lleva una tabla `scripts_aplicados` dentro de la
propia base, así que volver a ejecutarlo solo aplica los scripts nuevos.

### 3.3 Primera ejecución del despliegue

En esta VM, Apache está instalado en `C:\Apache24`, así que `htdocs` es
`C:\Apache24\htdocs`. Puede confirmarlo con:

```
Select-String -Path C:\Apache24\conf\httpd.conf -Pattern '^\s*DocumentRoot'
```

**En esta VM `nssm.exe` está instalado pero NO en el `PATH`**, así que hay
que pasar su ruta con `-RutaNssm`. La obtiene del paso 2.5: cuando
`verificar-requisitos.ps1` lo localiza, imprime el parámetro ya armado
(`-> pase: -RutaNssm "..."`). Si no lo localizó:

```
Get-ChildItem C:\ -Filter nssm.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
```

**Abra PowerShell como administrador** (crea un servicio y escribe en el
registro) y ejecute, con la ruta real de NSSM:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs" -RutaNssm "C:\ruta\a\nssm.exe"
```

El script comprueba las herramientas **antes** de crear nada, así que si
falta `-RutaNssm` se detiene en el primer paso y no deja ningún archivo a
medias: no hay nada que limpiar, solo repita el comando completo.

La primera vez el script crea `C:\munidata\config\.env.produccion`, genera
los secretos JWT y **se detiene con código 2**, pidiéndole que complete el
resto. Eso es lo esperado, no un error.

### 3.4 Completar las variables de entorno

```
notepad C:\munidata\config\.env.produccion
```

Reemplace **todos** los valores que empiezan por `CAMBIEME`:

| Variable | Qué poner |
| --- | --- |
| `BD_CONTRASENA` | La contraseña de `munidata_app` del paso 3.2 |
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

### 3.5 Ejecutar el despliegue de verdad

El mismo comando del paso 3.3, con el mismo `-RutaNssm`:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs" -RutaNssm "C:\ruta\a\nssm.exe"
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

### 3.6 Crear el administrador inicial

```
powershell -ExecutionPolicy Bypass -File .\despliegue\crear-administrador.ps1
```

Pide correo, nombre completo y contraseña (dos veces, sin mostrarla). La
contraseña debe tener al menos 12 caracteres, con mayúscula, minúscula y
número, la misma política que aplica la interfaz.

El script es idempotente: si ya existe un usuario con ese correo, no
modifica nada.

### 3.7 Programar los respaldos

```
powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1 -RegistrarTarea
```

Crea la tarea `MuniData-Respaldo-Diario`, que corre todos los días a las
02:30 como `SYSTEM`. Pedirá una vez la contraseña de `munidata_app` para
guardarla en un archivo de opciones con permisos restringidos: una tarea
programada no puede escribirla cada noche.

El script resuelve la ruta absoluta de `mysqldump.exe` y la deja escrita en
la línea de comandos de la tarea. Esto importa: `SYSTEM` solo ve el PATH de
máquina, y en esta VM `C:\Program Files\MySQL\MySQL Server 8.0\bin` no está
en el PATH, así que una tarea que invocara `mysqldump.exe` a secas fallaría
todas las noches. Si no logra encontrarlo, el script se detiene y lo dice;
en ese caso pase la ruta a mano:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1 -RegistrarTarea -RutaMysqldump "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
```

Compruebe que funciona ejecutándola ahora mismo:

```
Start-ScheduledTask -TaskName 'MuniData-Respaldo-Diario'
Get-ScheduledTaskInfo -TaskName 'MuniData-Respaldo-Diario'
Get-ChildItem C:\munidata\respaldos
```

---

## 4. Configuración de Apache

Este es el único paso que toca un servicio compartido con WordPress.
Hágalo con calma y valide antes de reiniciar.

### 4.1 Copiar el archivo de configuración

```
Copy-Item .\despliegue\apache\munidata.conf C:\Apache24\conf\extra\munidata.conf
```

### 4.2 Ajustar las dos rutas

```
notepad C:\Apache24\conf\extra\munidata.conf
```

Busque las líneas marcadas con `AJUSTAR`:

1. El bloque `<Directory "C:/Apache24/htdocs/munipalmares/wp-munidata">`
   debe apuntar a la carpeta real donde se publicó el frontend. Las rutas
   de Apache se escriben con `/` incluso en Windows.
2. El puerto del `ProxyPass` (3100 por defecto) debe coincidir con `PUERTO`
   de `.env.produccion`.

> Si `httpd.conf` ya define un `<Directory>` para `htdocs` con
> `AllowOverride All`, no hace falta tocar nada más: el bloque de
> `munidata.conf` es más específico y gana. **No reemplace el bloque
> existente**, que es el que usa WordPress.

### 4.3 Incluir el archivo

Edite la configuración de Apache y agregue la línea de `Include` **dentro
del `<VirtualHost *:443>` que ya sirve HTTPS**:

```
Include conf/extra/munidata.conf
```

> **Solo en el `<VirtualHost *:443>`.** El sistema funciona únicamente por
> HTTPS: el puerto 80 sigue sirviendo el frontend de WordPress y los
> archivos estáticos, pero no la API. Si el `Include` se pusiera también
> en el `<VirtualHost *:80>`, la aplicación cargaría por HTTP y el inicio
> de sesión fallaría sin mensaje claro, porque la cookie del refresh token
> sale con `secure` y el navegador no la devuelve sobre HTTP (véase 10.3).
> Use siempre `https://` en `FRONTEND_URL` y al abrir la aplicación.

### 4.4 Validar y reiniciar

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

### 4.5 Verificar

```
powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-despliegue.ps1 -UrlPublica "https://<host>/munipalmares/wp-munidata"
```

> **`<host>` y `<su-dominio>` son marcadores, en toda esta guía.** Los
> corchetes angulares no forman parte de la dirección: hay que sustituir
> todo el marcador, corchetes incluidos, por el nombre real del servidor.
> Si se copia la línea tal cual, `verificar-despliegue.ps1` lo detecta,
> responde «Reemplace el texto de ejemplo por la dirección real de la VM»
> y **sale con código 2 sin ejecutar ninguna comprobación**, para que no
> parezca un problema de Apache lo que es una dirección mal escrita. Lo
> mismo si la dirección no empieza por `https://`: la API solo se publica
> por HTTPS (sección 4.3).

Reemplace `<host>` por la dirección real de la VM, la misma que puso en
`FRONTEND_URL`. Ahora deberían pasar las siete comprobaciones.

### 4.6 Revertir el cambio de Apache

Si algo se rompió, comente la línea del paso 4.3:

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

## 5. Variables de entorno de producción

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
| `BD_CONTRASENA` | La definida en el paso 3.2 | Gerald |
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

## 6. Actualizaciones posteriores

```
cd C:\munidata\gestor-documental-pps
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

## 7. Rollback

Necesita el mismo `-RutaNssm` que el despliegue, porque también detiene y
arranca el servicio:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\revertir.ps1 -RutaHtdocs "C:\Apache24\htdocs" -RutaNssm "C:\ruta\a\nssm.exe"
```

Detiene el servicio, restaura el backend y el frontend del último respaldo
que contenga código, reinstala las dependencias de producción, arranca el
servicio y verifica.

Para volver a un respaldo concreto, páselo por su marca de tiempo:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\revertir.ps1 -RutaHtdocs "C:\Apache24\htdocs" -RutaNssm "C:\ruta\a\nssm.exe" -Respaldo "20261009-154234"
```

**La base de datos no se restaura automáticamente**, y es deliberado:
restaurar un volcado destruye todos los documentos, versiones, usuarios y
bitácora registrados después de esa fecha. Al terminar, el script imprime
el comando exacto para hacerlo a mano si de verdad hace falta.

---

## 8. Respaldos y restauración

### 8.1 Respaldo manual

```
powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1
```

Genera en `C:\munidata\respaldos\<fecha-hora>`:

- `base-datos.sql.gz` — volcado con `mysqldump --single-transaction`,
  comprimido. Esa opción toma una instantánea coherente sin bloquear las
  tablas, así que el sistema sigue funcionando durante el respaldo.
- `documentos.zip` — copia comprimida de los PDF.

Conserva los 14 más recientes y borra los anteriores.

Mientras se genera, la carpeta se llama `<fecha-hora>.parcial` y solo se
renombra cuando el respaldo termina bien. Si encuentra una carpeta con ese
sufijo, ese respaldo **falló**: mírelo, averigüe por qué y bórrelo. La
rotación no las cuenta a propósito, para que una racha de noches fallidas
no desplace a los respaldos que sí sirven.

Si `mysqldump.exe` no está en el PATH, pase su ruta con `-RutaMysqldump`
(véase 3.7).

### 8.2 Restaurar la base de datos

> **Destruye** todo lo registrado después de la fecha del volcado. No hay
> forma de recuperarlo luego. Haga un respaldo del estado actual antes.

```
cd C:\munidata\respaldos\<fecha-hora>
node -e "const z=require('zlib'),f=require('fs');f.writeFileSync('restaurar.sql',z.gunzipSync(f.readFileSync('base-datos.sql.gz')))"
mysql -u munidata_app -p munidata < restaurar.sql
del restaurar.sql
```

Dos avisos sobre esa penúltima línea, por si la ejecuta en una consola de
PowerShell y no en `cmd`:

- PowerShell 5.1 **no tiene** el operador `<`; responde que está reservado
  para un uso futuro. Hay que pasar por `cmd`.
- `mysql.exe` tampoco está en el PATH de esta VM, igual que `mysqldump.exe`
  (véase 3.7), así que va por su ruta completa.

Con las dos cosas juntas:

```
cmd /c '"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u munidata_app -p munidata < restaurar.sql'
```

Las comillas **simples** de fuera son necesarias: hacen que PowerShell
entregue toda la línea a `cmd` sin interpretarla, y es `cmd` el que aplica
la redirección.

Reinicie el servicio después, para que el pool de conexiones se rehaga:

```
nssm restart MuniData-API
```

### 8.3 Restaurar los documentos

```
Expand-Archive -Path C:\munidata\respaldos\<fecha-hora>\documentos.zip -DestinationPath C:\munidata\storage\documentos -Force
```

La base guarda las rutas de los archivos relativas a
`RUTA_ALMACENAMIENTO`, así que los nombres no deben cambiarse. Base de
datos y documentos deben restaurarse **del mismo respaldo**: si no, habrá
documentos registrados cuyo archivo no existe (la API responde un error
controlado) o archivos huérfanos en disco.

---

## 9. Prueba de humo funcional

Después de la verificación automática, compruebe a mano estos nueve puntos
desde un navegador. Es la única forma de validar el comportamiento real.

1. **Inicio de sesión.** Abra
   `https://<host>/munipalmares/wp-munidata/` e inicie sesión con la cuenta
   creada en el paso 3.6. Debe llegar al panel de Inicio con los
   indicadores.

2. **Persistencia de la sesión.** Recargue la página con F5. **Debe seguir
   dentro.** Si lo devuelve al login, la cookie del refresh token no está
   persistiendo: vaya a la sección 10.3.

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

## 10. Solución de problemas comunes

### 10.1 `502 Bad Gateway` de Apache

Apache no pudo hablar con el backend.

```
Get-Service MuniData-API
Get-NetTCPConnection -LocalPort 3100 -State Listen
Get-Content C:\munidata\registros\api-error.log -Tail 40
```

Causas, en orden de frecuencia:

- El servicio está detenido o reiniciándose en bucle. El log de errores
  dice por qué; lo más común es que no alcanza MySQL.
- El puerto del `ProxyPass` no coincide con `PUERTO` de `.env.produccion`.
- Falta `proxy_http_module`. Compruebe con `httpd -M`.

Si el log del backend no dice nada, el problema está del lado de Apache.
Sus registros están en `C:\Apache24\logs` y en esta VM se llaman
`error_log` y `access_log`, **sin punto ni extensión**, que no es el
nombre habitual de una instalación de Apache en Windows:

```
Get-Content C:\Apache24\logs\error_log -Tail 40
Get-Content C:\Apache24\logs\access_log -Tail 40
```

Son los registros compartidos con WordPress y los demás sistemas de la
VM, así que conviene filtrar por la ruta de Muni Data:

```
Select-String -Path C:\Apache24\logs\error_log -Pattern 'wp-munidata|munidata' | Select-Object -Last 20
```

### 10.2 `404` en rutas profundas

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

### 10.3 La sesión no persiste al recargar

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

### 10.4 Puerto ocupado

```
Get-NetTCPConnection -LocalPort 3100 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
```

Si es otro sistema de la VM, elija otro puerto. Hay que cambiarlo en tres
sitios a la vez:

1. `PUERTO` en `C:\munidata\config\.env.produccion`
2. El `ProxyPass` de `munidata.conf`
3. El parámetro `-Puerto` de `desplegar.ps1`

### 10.5 Error de certificado

Si el certificado es autofirmado, el navegador avisa. No es un problema del
sistema: es el mismo certificado con el que ya se sirven los otros
sistemas.

`verificar-despliegue.ps1` ignora la validación del certificado a
propósito, solo dentro de su propio proceso, para poder probar la
aplicación sin que la validación lo detenga antes.

### 10.6 El correo no sale

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

### 10.7 El servicio no arranca

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

### 10.8 «La carpeta de destino ya tiene contenido y NO lleva el marcador»

`desplegar.ps1` o `revertir.ps1` se detienen antes de tocar nada. Es una
protección, no un error: la carpeta de publicación tiene archivos y no
lleva `.munidata-despliegue`, así que el script no puede saber si son
nuestros o de otro sistema de este Apache.

**Lo primero es mirar qué hay**, nunca forzar:

```
Get-ChildItem C:\Apache24\htdocs\munipalmares\wp-munidata -Force
```

- Si lo que ve es **WordPress u otro sistema**, se equivocó de ruta.
  Repita con el valor correcto de `-RutaHtdocs` o `-RutaPublicaFrontend`.
  No cree el marcador: lo borraría todo en la siguiente ejecución.
- Si de verdad es **Muni Data** (por ejemplo porque alguien publicó a mano
  antes de usar estos scripts), autorice el reemplazo creando el marcador:

  ```
  Set-Content -LiteralPath C:\Apache24\htdocs\munipalmares\wp-munidata\.munidata-despliegue -Value 'autorizado a mano'
  ```

  Y vuelva a ejecutar el script.

**No borre `.munidata-despliegue`** de una carpeta ya desplegada: sin él,
la siguiente actualización se detendrá igual.

### 10.9 `No se encontro nssm.exe en el PATH`

Pasa en el primer paso de `desplegar.ps1` o `revertir.ps1`, antes de que
toquen nada. En esta VM es lo esperado: NSSM está instalado —lo usan otros
sistemas— pero su carpeta no está en el `PATH`. No hay que instalar nada
ni modificar el `PATH` del servidor: se le pasa la ruta.

Para obtenerla:

```
powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-requisitos.ps1
```

Si lo localiza, imprime el parámetro ya armado. Lo busca en el `PATH`, en
las carpetas habituales y en el `PathName` de los servicios que ya corren
con NSSM, que es lo más fiable aquí. Si aun así no aparece:

```
Get-ChildItem C:\ -Filter nssm.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
```

Y repita el comando agregando `-RutaNssm "C:\ruta\a\nssm.exe"`. Si de
verdad no está instalado, descárguelo de <https://nssm.cc/download> y
descomprímalo en una carpeta fija del servidor (por ejemplo
`C:\herramientas`).

---

## 11. Notas de seguridad

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

**HTTPS y cookies** (A.10.1, A.14.1). TLS lo termina Apache, y el sistema
funciona solo por HTTPS: la API se publica únicamente desde el
`<VirtualHost *:443>`. El puerto 80 sigue sirviendo el frontend y el resto
del sitio, pero no la API, de modo que no existe ninguna ruta en claro
hacia ella. La cookie del refresh token es `httpOnly`, `secure` y
`sameSite=strict`, y el access token nunca se guarda en `localStorage`. La sesión expira de forma absoluta a las
8 horas, y la rotación del refresh hereda la fecha original en vez de
reiniciar el plazo.

**Documentos fuera del árbol web** (A.9.4). Los PDF se guardan en
`C:\munidata\storage\documentos` con nombre UUID, fuera de `htdocs` y sin
middleware estático. El único acceso es
`GET /documentos/:id/visualizar|descargar`, que verifica el permiso y
registra la descarga en la bitácora.

**Trazabilidad** (A.12.4). Toda acción relevante queda en `bitacora_logs`,
sin contraseñas ni tokens en claro. **La retención es de 3 meses y el
borrado es físico y definitivo:** la purga corre el día 1 de cada mes a las
03:00 y elimina de la tabla todo lo anterior a esa ventana, sin exportar
nada antes. No queda copia en ningún otro sitio.

El supervisor decidió que, cuando se necesite conservar un tramo del
histórico más allá de los 3 meses, él mismo hará el respaldo antes de que
la purga lo elimine. Conviene tenerlo presente al cerrar cada mes.

Los respaldos diarios de la base de datos **no sustituyen** a ese archivo.
Conservan 14 días, así que durante las dos semanas siguientes a una purga
todavía se puede recuperar lo borrado restaurando un respaldo en un
entorno aparte; pasado ese plazo el último respaldo que lo contenía ya
rotó y la pérdida es definitiva. Un archivo de la bitácora hay que
guardarlo aparte y a propósito.

Para cambiar la ventana, `BITACORA_RETENCION_MESES` en `.env.produccion`;
con el valor `0` la purga queda deshabilitada y la tabla crece sin límite.

**Respaldos** (A.12.3). Diarios y automáticos, con 14 días de retención,
cubriendo base de datos y documentos. Un respaldo que nunca se probó no es
un respaldo: pruebe la restauración al menos una vez en un entorno aparte.

**Credenciales iniciales.** El script
`06-usuario-superadministrador.sql` no se aplica en producción porque su
contraseña está publicada en el repositorio. La primera cuenta se crea con
`crear-administrador.ps1`, que nunca escribe la contraseña en disco ni en la
línea de comandos.
