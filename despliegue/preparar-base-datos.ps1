<#
.SINOPSIS
    Crea la base de datos de produccion, su usuario de aplicacion y aplica
    los scripts SQL del repositorio en orden.

.DESCRIPCION
    Es idempotente: se puede volver a ejecutar sin romper nada. Lleva una
    tabla de control (scripts_aplicados) con los scripts ya ejecutados, de
    modo que una segunda corrida solo aplica los nuevos.

    Dos decisiones importantes:

    1. El script 06-usuario-superadministrador.sql NO se aplica por
       defecto. Ese script crea una cuenta con la contrasena publicada en
       el script 06. En produccion el administrador inicial se crea
       despues con crear-administrador.ps1, que pide la contrasena. Si de
       verdad quiere aplicarlo, use -IncluirUsuarioSemilla.

    2. Los scripts del repositorio empiezan con
       "USE gestor_documental_pps;", el nombre de la base de desarrollo.
       Este script quita esa linea al aplicarlos y selecciona la base por
       parametro, en vez de modificar los scripts: la regla del proyecto
       es no alterar scripts SQL ya existentes.

    Las contrasenas no viajan nunca por la linea de comandos (serian
    visibles en la lista de procesos). Se escriben en un archivo de
    opciones temporal con permisos restringidos, que se borra al terminar.

.PARAMETER BaseDatos
    Nombre de la base de datos a crear.

.PARAMETER UsuarioAplicacion
    Usuario dedicado que usara el backend. Nunca root.

.PARAMETER ServidorMysql
    Host de MySQL.

.PARAMETER PuertoMysql
    Puerto de MySQL.

.PARAMETER UsuarioAdministrador
    Usuario administrativo de MySQL con el que se crea todo.

.PARAMETER RutaScripts
    Carpeta con los scripts SQL numerados.

.PARAMETER RutaRespaldos
    Carpeta donde dejar el volcado previo si la base ya tenia datos.

.PARAMETER IncluirUsuarioSemilla
    Aplica tambien 06-usuario-superadministrador.sql. Solo para pruebas.

.PARAMETER Simular
    Imprime lo que haria sin ejecutar nada ni pedir contrasenas.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\preparar-base-datos.ps1
#>

[CmdletBinding()]
param(
    [string] $BaseDatos = 'munidata',
    [string] $UsuarioAplicacion = 'munidata_app',
    [string] $ServidorMysql = '127.0.0.1',
    [int]    $PuertoMysql = 3306,
    [string] $UsuarioAdministrador = 'root',
    [string] $RutaScripts = '',
    [string] $RutaRespaldos = 'C:\munidata\respaldos',
    [switch] $IncluirUsuarioSemilla,
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------
# Constantes
# ------------------------------------------------------------
$TABLA_CONTROL = 'scripts_aplicados'
$SCRIPT_USUARIO_SEMILLA = '06-usuario-superadministrador.sql'

# Raiz del repositorio: este script vive en despliegue/, un nivel por
# debajo. Se calcula asi para que funcione sin importar desde donde se
# invoque.
$raizRepositorio = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
if ($RutaScripts -eq '') {
    $RutaScripts = Join-Path $raizRepositorio 'base-datos\scripts\init'
}

$archivoOpciones = $null

# ------------------------------------------------------------
# Utilidades
# ------------------------------------------------------------
function Escribir-Paso {
    param([Parameter(Mandatory = $true)][string] $Mensaje)
    Write-Host ''
    Write-Host "==> $Mensaje" -ForegroundColor Cyan
}

function Escribir-Detalle {
    param([Parameter(Mandatory = $true)][string] $Mensaje)
    Write-Host "    $Mensaje"
}

function Convertir-ASecreto {
    <#
        Convierte un SecureString al texto que necesita MySQL. El valor
        resultante solo se usa para escribir el archivo de opciones y
        nunca se imprime.
    #>
    param([Parameter(Mandatory = $true)][System.Security.SecureString] $Segura)
    $puntero = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Segura)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($puntero)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero)
    }
}

function Nuevo-ArchivoOpciones {
    <#
        Archivo de opciones de MySQL con las credenciales administrativas.
        Se usa en lugar de --password en la linea de comandos, que queda
        visible para cualquier usuario del sistema mientras el proceso
        corre.

        Se crea en la carpeta temporal del usuario actual y se restringen
        los permisos a ese usuario mas los administradores, quitando la
        herencia: sin eso, el archivo heredaria los permisos de %TEMP%.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Usuario,
        [Parameter(Mandatory = $true)][string] $Contrasena
    )

    $ruta = Join-Path $env:TEMP ("munidata-mysql-{0}.cnf" -f ([guid]::NewGuid().ToString('N')))

    $contenido = @(
        '[client]',
        ("user={0}" -f $Usuario),
        ("password={0}" -f $Contrasena),
        ("host={0}" -f $ServidorMysql),
        ("port={0}" -f $PuertoMysql)
    ) -join "`r`n"

    # Out-File con UTF8 agregaria BOM, que el cliente de MySQL no
    # interpreta; se escribe en ASCII, suficiente para estos valores.
    [System.IO.File]::WriteAllText($ruta, $contenido, [System.Text.Encoding]::ASCII)

    & icacls.exe $ruta /inheritance:r /grant:r "$($env:USERNAME):(R,W)" /grant:r 'Administrators:(F)' | Out-Null

    return $ruta
}

function Invocar-Mysql {
    <#
        Ejecuta una sentencia y devuelve la salida en texto. -N quita la
        fila de encabezados y -B usa separador por tabulaciones, que es lo
        comodo para leer desde PowerShell.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Sentencia,
        [string] $Base = ''
    )

    $argumentos = @("--defaults-extra-file=$archivoOpciones", '-N', '-B', '-e', $Sentencia)
    if ($Base -ne '') {
        $argumentos += @('--database', $Base)
    }

    $salida = & mysql.exe @argumentos 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "MySQL devolvio error al ejecutar una sentencia: $($salida -join ' ')"
    }
    return ([string[]]$salida)
}

function Invocar-ArchivoSql {
    <#
        Aplica un archivo .sql quitando sus lineas "USE <base>;".

        El contenido se envia por entrada estandar y no con "mysql <
        archivo", porque hay que filtrar esas lineas al vuelo. Se usa
        --default-character-set=utf8mb4 porque el cliente de MySQL en
        Windows usa la pagina de codigos del sistema por omision, y sin
        esto todo el texto acentuado de los catalogos quedaria con doble
        codificacion (lo advierten los propios scripts en su cabecera).
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [Parameter(Mandatory = $true)][string] $Base
    )

    $lineas = Get-Content -LiteralPath $Ruta -Encoding UTF8
    $filtradas = $lineas | Where-Object { $_ -notmatch '^\s*USE\s+[`\w]+\s*;' }
    $contenido = $filtradas -join "`r`n"

    $temporal = Join-Path $env:TEMP ("munidata-sql-{0}.sql" -f ([guid]::NewGuid().ToString('N')))
    try {
        [System.IO.File]::WriteAllText($temporal, $contenido, (New-Object System.Text.UTF8Encoding($false)))

        $salida = & mysql.exe "--defaults-extra-file=$archivoOpciones" '--default-character-set=utf8mb4' '--database' $Base '-e' "source $($temporal -replace '\\', '/')" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Fallo al aplicar $(Split-Path -Leaf $Ruta): $($salida -join ' ')"
        }
        return ([string[]]$salida)
    } finally {
        if (Test-Path -LiteralPath $temporal) {
            Remove-Item -LiteralPath $temporal -Force -ErrorAction SilentlyContinue
        }
    }
}

# ------------------------------------------------------------
# Inicio
# ------------------------------------------------------------
Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - preparacion de la base de datos de produccion'
Write-Host '============================================================'
Write-Host ("Base de datos : {0}" -f $BaseDatos)
Write-Host ("Usuario app   : {0}" -f $UsuarioAplicacion)
Write-Host ("Servidor      : {0}:{1}" -f $ServidorMysql, $PuertoMysql)
Write-Host ("Scripts SQL   : {0}" -f $RutaScripts)

if (-not (Test-Path -LiteralPath $RutaScripts)) {
    Write-Host ''
    Write-Host "ERROR: no existe la carpeta de scripts $RutaScripts" -ForegroundColor Red
    exit 1
}

$scripts = @(Get-ChildItem -LiteralPath $RutaScripts -Filter '*.sql' | Sort-Object -Property Name)
if ($scripts.Count -eq 0) {
    Write-Host ''
    Write-Host "ERROR: no se encontro ningun script .sql en $RutaScripts" -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Scripts detectados, en el orden en que se aplicaran:'
foreach ($script in $scripts) {
    if ($script.Name -eq $SCRIPT_USUARIO_SEMILLA -and -not $IncluirUsuarioSemilla) {
        Write-Host ("  - {0}   [OMITIDO: crea una cuenta con contrasena publicada]" -f $script.Name) -ForegroundColor Yellow
    } else {
        Write-Host ("  - {0}" -f $script.Name)
    }
}

if ($Simular) {
    Write-Host ''
    Write-Host '[SIMULACION] No se pediran contrasenas ni se tocara la base de datos.'
    Write-Host '[SIMULACION] En una ejecucion real este script haria:'
    Write-Host '[SIMULACION]   1. Pedir la contrasena administrativa de MySQL.'
    Write-Host ('[SIMULACION]   2. Pedir la contrasena del usuario {0}.' -f $UsuarioAplicacion)
    Write-Host '[SIMULACION]   3. Escribir un archivo de opciones temporal con permisos restringidos.'
    Write-Host ('[SIMULACION]   4. CREATE DATABASE {0} con utf8mb4_unicode_ci si no existe.' -f $BaseDatos)
    Write-Host ('[SIMULACION]   5. CREATE USER {0} y GRANT solo sobre esa base.' -f $UsuarioAplicacion)
    Write-Host ('[SIMULACION]   6. mysqldump previo a {0} si la base ya tuviera datos.' -f $RutaRespaldos)
    Write-Host ('[SIMULACION]   7. Crear la tabla de control {0} y aplicar los scripts pendientes.' -f $TABLA_CONTROL)
    Write-Host '[SIMULACION]   8. Borrar el archivo de opciones temporal.'
    Write-Host ''
    Write-Host '[SIMULACION] Terminado sin cambios.' -ForegroundColor Green
    exit 0
}

# Herramientas necesarias
foreach ($herramienta in @('mysql.exe', 'mysqldump.exe')) {
    if ($null -eq (Get-Command -Name $herramienta -ErrorAction SilentlyContinue)) {
        Write-Host ''
        Write-Host "ERROR: no se encontro $herramienta en el PATH." -ForegroundColor Red
        Write-Host '       Agregue la carpeta bin de MySQL al PATH y vuelva a intentar.' -ForegroundColor Red
        Write-Host '       Ejecute primero verificar-requisitos.ps1.' -ForegroundColor Red
        exit 1
    }
}

try {
    # --------------------------------------------------------
    # Credenciales
    # --------------------------------------------------------
    Escribir-Paso 'Credenciales'
    Escribir-Detalle 'Lo que escriba no se mostrara en pantalla ni quedara en el historial.'

    $contrasenaAdmin = Read-Host -Prompt ("Contrasena de {0} en MySQL" -f $UsuarioAdministrador) -AsSecureString
    if ($contrasenaAdmin.Length -eq 0) {
        throw 'La contrasena administrativa no puede estar vacia.'
    }

    $contrasenaApp = Read-Host -Prompt ("Contrasena NUEVA para el usuario {0}" -f $UsuarioAplicacion) -AsSecureString
    $contrasenaAppConfirmada = Read-Host -Prompt 'Reptala para confirmar' -AsSecureString

    $textoApp = Convertir-ASecreto -Segura $contrasenaApp
    $textoAppConfirmado = Convertir-ASecreto -Segura $contrasenaAppConfirmada
    if ($textoApp -ne $textoAppConfirmado) {
        throw 'Las dos contrasenas del usuario de aplicacion no coinciden.'
    }
    if ($textoApp.Length -lt 12) {
        throw 'La contrasena del usuario de aplicacion debe tener al menos 12 caracteres.'
    }
    # Una comilla simple rompe la sentencia CREATE USER y, peor, abre la
    # puerta a inyeccion. Es mas simple exigir que no la contenga.
    if ($textoApp.Contains("'") -or $textoApp.Contains('\')) {
        throw "La contrasena del usuario de aplicacion no debe contener comillas simples ni barras invertidas."
    }

    $archivoOpciones = Nuevo-ArchivoOpciones -Usuario $UsuarioAdministrador -Contrasena (Convertir-ASecreto -Segura $contrasenaAdmin)

    # --------------------------------------------------------
    # Conexion
    # --------------------------------------------------------
    Escribir-Paso 'Comprobando la conexion con MySQL'
    $version = (Invocar-Mysql -Sentencia 'SELECT VERSION();')[0]
    Escribir-Detalle "Conectado. Version del servidor: $version"

    # --------------------------------------------------------
    # Base de datos
    # --------------------------------------------------------
    Escribir-Paso "Base de datos $BaseDatos"
    $existe = @(Invocar-Mysql -Sentencia ("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '{0}';" -f $BaseDatos))
    $baseYaExistia = ($existe.Count -gt 0 -and $existe[0].Trim() -ne '')

    if ($baseYaExistia) {
        Escribir-Detalle 'Ya existe; no se recrea.'
    } else {
        $null = Invocar-Mysql -Sentencia ("CREATE DATABASE `{0}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" -f $BaseDatos)
        Escribir-Detalle 'Creada con utf8mb4 / utf8mb4_unicode_ci.'
    }

    # --------------------------------------------------------
    # Respaldo previo
    # --------------------------------------------------------
    if ($baseYaExistia) {
        $tablas = @(Invocar-Mysql -Sentencia ("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{0}';" -f $BaseDatos))
        $cantidadTablas = 0
        if ($tablas.Count -gt 0) { $cantidadTablas = [int]($tablas[0].Trim()) }

        if ($cantidadTablas -gt 0) {
            Escribir-Paso "Respaldo previo ($cantidadTablas tablas existentes)"
            if (-not (Test-Path -LiteralPath $RutaRespaldos)) {
                $null = New-Item -ItemType Directory -Path $RutaRespaldos -Force
            }
            $marca = Get-Date -Format 'yyyyMMdd-HHmmss'
            $archivoVolcado = Join-Path $RutaRespaldos ("previo-a-scripts-{0}.sql" -f $marca)

            & mysqldump.exe "--defaults-extra-file=$archivoOpciones" '--single-transaction' '--default-character-set=utf8mb4' $BaseDatos --result-file=$archivoVolcado
            if ($LASTEXITCODE -ne 0) {
                throw "mysqldump fallo; no se continua sin respaldo previo."
            }
            Escribir-Detalle "Volcado guardado en $archivoVolcado"
        }
    }

    # --------------------------------------------------------
    # Usuario de aplicacion
    # --------------------------------------------------------
    Escribir-Paso "Usuario de aplicacion $UsuarioAplicacion"
    Escribir-Detalle 'Se concede privilegio solo sobre esta base (minimo privilegio).'

    # IF NOT EXISTS mantiene la idempotencia sin tocar la contrasena de un
    # usuario que ya estuviera en uso. Se crea para 'localhost' y para
    # '127.0.0.1' porque MySQL los trata como hosts distintos y el backend
    # se conecta por el segundo.
    foreach ($hostUsuario in @('localhost', '127.0.0.1')) {
        $null = Invocar-Mysql -Sentencia ("CREATE USER IF NOT EXISTS '{0}'@'{1}' IDENTIFIED BY '{2}';" -f $UsuarioAplicacion, $hostUsuario, $textoApp)
        # ALTER USER para el caso de que ya existiera con otra contrasena:
        # sin esto, repetir el despliegue con una contrasena nueva dejaria
        # al backend sin poder conectarse.
        $null = Invocar-Mysql -Sentencia ("ALTER USER '{0}'@'{1}' IDENTIFIED BY '{2}';" -f $UsuarioAplicacion, $hostUsuario, $textoApp)
        # Sin GRANT ALL: el backend nunca altera el esquema (TypeORM corre
        # con synchronize: false), asi que no necesita DDL.
        $null = Invocar-Mysql -Sentencia ("GRANT SELECT, INSERT, UPDATE, DELETE ON `{0}`.* TO '{1}'@'{2}';" -f $BaseDatos, $UsuarioAplicacion, $hostUsuario)
        Escribir-Detalle "Concedido a '$UsuarioAplicacion'@'$hostUsuario'."
    }
    $null = Invocar-Mysql -Sentencia 'FLUSH PRIVILEGES;'

    # --------------------------------------------------------
    # Tabla de control
    # --------------------------------------------------------
    Escribir-Paso "Tabla de control $TABLA_CONTROL"
    $sentenciaControl = @"
CREATE TABLE IF NOT EXISTS ``$TABLA_CONTROL`` (
    id_script INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre_script VARCHAR(255) NOT NULL UNIQUE,
    fecha_aplicacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
"@
    $null = Invocar-Mysql -Sentencia $sentenciaControl -Base $BaseDatos
    Escribir-Detalle 'Lista. Registra que script se aplico y cuando.'

    # Si la base ya tenia esquema pero NO la tabla de control, significa
    # que se poblo por otra via (por ejemplo restaurando un volcado de
    # desarrollo). Aplicar los scripts encima fallaria a medias y dejaria
    # la base en un estado incierto, asi que se detiene.
    $aplicadosPrevios = @(Invocar-Mysql -Sentencia ("SELECT nombre_script FROM ``{0}``;" -f $TABLA_CONTROL) -Base $BaseDatos | Where-Object { $_.Trim() -ne '' })

    if ($aplicadosPrevios.Count -eq 0) {
        $tieneUsuarios = @(Invocar-Mysql -Sentencia ("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{0}' AND TABLE_NAME = 'usuarios';" -f $BaseDatos))
        if ($tieneUsuarios.Count -gt 0 -and [int]($tieneUsuarios[0].Trim()) -gt 0) {
            throw @"
La base $BaseDatos ya contiene el esquema (existe la tabla 'usuarios') pero no hay
registro de los scripts aplicados. No se puede saber que falta aplicar sin
riesgo de dejar la base a medias.

Que hacer:
  - Si la base es correcta y esta completa, registre los scripts como ya
    aplicados ejecutando, por cada uno:
        INSERT INTO $TABLA_CONTROL (nombre_script) VALUES ('01-esquema.sql');
  - Si la base es desechable, borrela y vuelva a ejecutar este script:
        DROP DATABASE $BaseDatos;
    El volcado previo quedo en $RutaRespaldos
"@
        }
    }

    # --------------------------------------------------------
    # Aplicacion de los scripts
    # --------------------------------------------------------
    Escribir-Paso 'Aplicando scripts SQL'
    $aplicados = 0
    $omitidos = 0

    foreach ($script in $scripts) {
        if ($script.Name -eq $SCRIPT_USUARIO_SEMILLA -and -not $IncluirUsuarioSemilla) {
            Escribir-Detalle ("OMITIDO  {0}  (crea una cuenta con contrasena publicada; use crear-administrador.ps1)" -f $script.Name)
            $omitidos += 1
            continue
        }

        if ($aplicadosPrevios -contains $script.Name) {
            Escribir-Detalle ("YA ESTA  {0}" -f $script.Name)
            $omitidos += 1
            continue
        }

        Escribir-Detalle ("APLICANDO {0} ..." -f $script.Name)
        $null = Invocar-ArchivoSql -Ruta $script.FullName -Base $BaseDatos
        $null = Invocar-Mysql -Sentencia ("INSERT INTO ``{0}`` (nombre_script) VALUES ('{1}');" -f $TABLA_CONTROL, $script.Name) -Base $BaseDatos
        $aplicados += 1
    }

    # --------------------------------------------------------
    # Resumen
    # --------------------------------------------------------
    Escribir-Paso 'Resultado'
    $conteos = Invocar-Mysql -Sentencia 'SELECT (SELECT COUNT(*) FROM roles), (SELECT COUNT(*) FROM permisos), (SELECT COUNT(*) FROM categorias_itsp), (SELECT COUNT(*) FROM tipos_documento), (SELECT COUNT(*) FROM usuarios);' -Base $BaseDatos
    $partes = $conteos[0] -split "`t"

    Write-Host ("  Scripts aplicados ahora : {0}" -f $aplicados)
    Write-Host ("  Scripts ya aplicados    : {0}" -f $omitidos)
    Write-Host ("  Roles                   : {0}" -f $partes[0])
    Write-Host ("  Permisos                : {0}" -f $partes[1])
    Write-Host ("  Categorias ITSP         : {0}" -f $partes[2])
    Write-Host ("  Tipos de documento      : {0}" -f $partes[3])
    Write-Host ("  Usuarios                : {0}" -f $partes[4])

    if ([int]($partes[4].Trim()) -eq 0) {
        Write-Host ''
        Write-Host 'No hay ningun usuario todavia, como corresponde.' -ForegroundColor Yellow
        Write-Host 'Cree el administrador inicial DESPUES de desplegar el backend, con:' -ForegroundColor Yellow
        Write-Host '    powershell -ExecutionPolicy Bypass -File .\despliegue\crear-administrador.ps1' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host 'Base de datos preparada correctamente.' -ForegroundColor Green
    Write-Host ("Anote estos valores para .env.produccion: BD_NOMBRE={0}, BD_USUARIO={1}" -f $BaseDatos, $UsuarioAplicacion)
    exit 0

} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    # El archivo de opciones contiene la contrasena administrativa: se
    # borra siempre, tambien si el script fallo a mitad.
    if ($null -ne $archivoOpciones -and (Test-Path -LiteralPath $archivoOpciones)) {
        Remove-Item -LiteralPath $archivoOpciones -Force -ErrorAction SilentlyContinue
        Write-Host '(archivo de credenciales temporal eliminado)'
    }
}
