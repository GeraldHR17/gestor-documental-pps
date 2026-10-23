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

    Guardia: si la base ya tiene tablas, la tabla de control debe existir
    y registrar, sin huecos, todo lo anterior al primer script pendiente.
    Si falta, esta vacia o tiene huecos, el script se detiene ANTES de
    tocar nada (ni volcado, ni usuario de aplicacion, ni scripts): aplicar
    scripts viejos encima de datos reales podria duplicar filas o dejar la
    base a medias. Vale con y sin -SoloScripts.

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

.PARAMETER SoloScripts
    Para actualizar una base que ya esta en uso: aplica los scripts
    pendientes sin pedir ni cambiar la contrasena del usuario de
    aplicacion (omite CREATE USER, ALTER USER y GRANT). Sin esto, el script
    siempre redefine esa contrasena, y si no se escribe exactamente la de
    .env.produccion el backend deja de conectar. Exige que la base exista.

.PARAMETER Simular
    Imprime lo que haria sin ejecutar nada ni pedir contrasenas.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\preparar-base-datos.ps1

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\preparar-base-datos.ps1 -SoloScripts
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
    [switch] $SoloScripts,
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
        $texto = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($puntero)
        # Una cadena vacia puede volver como $null. Se normaliza a '' para
        # que quien la reciba pueda medirla o compararla sin comprobar.
        if ($null -eq $texto) { return '' }
        return $texto
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero)
    }
}

function Convertir-ALineas {
    <#
        Normaliza la salida de un comando externo a un arreglo de cadenas.

        Es la pieza que evita el fallo "No se puede llamar a un metodo en
        una expresion con valor NULL": cuando mysql.exe no devuelve
        ninguna fila, PowerShell deja la variable en $null, y envolverla
        en @() produce un arreglo de un elemento nulo, no un arreglo
        vacio. Al llamar .Trim() sobre ese elemento el script se caia.

        Devuelve siempre un arreglo, posiblemente vacio, de cadenas no
        nulas. Tambien convierte los ErrorRecord que aparecen al redirigir
        con 2>&1, que tampoco tienen .Trim().

        Se descartan los avisos del propio cliente ("mysql: [Warning] ..."
        o "Warning: World-writable config file ... is ignored"): van por
        la salida de error, los recoge el 2>&1 y no son filas de la
        consulta, asi que colarse en la primera posicion falsearia
        cualquier lectura.
    #>
    param([object] $Salida)

    if ($null -eq $Salida) { return @() }

    $lineas = New-Object System.Collections.ArrayList
    foreach ($elemento in @($Salida)) {
        if ($null -eq $elemento) { continue }
        $texto = [string] $elemento
        if ($texto -match '^\s*(mysql(dump)?:\s*)?\[?Warning\]?[:\s]') { continue }
        $null = $lineas.Add($texto)
    }
    return ([string[]] $lineas.ToArray())
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

    # Usuario y contrasena van entre comillas dobles: el analizador de
    # archivos de opciones de MySQL trata '#' como inicio de comentario y
    # corta el resto de la linea, de modo que una contrasena como
    # "Palmares#2026" llegaria al servidor como "Palmares" y el error
    # seria un "Access denied" desconcertante, con la contrasena
    # correcta escrita. Dentro de las comillas la barra invertida es el
    # caracter de escape, asi que hay que duplicarla.
    $usuarioEscapado = $Usuario.Replace('\', '\\').Replace('"', '\"')
    $contrasenaEscapada = $Contrasena.Replace('\', '\\').Replace('"', '\"')

    $contenido = @(
        '[client]',
        ("user=`"{0}`"" -f $usuarioEscapado),
        ("password=`"{0}`"" -f $contrasenaEscapada),
        ("host={0}" -f $ServidorMysql),
        ("port={0}" -f $PuertoMysql)
    ) -join "`r`n"

    # Out-File con UTF8 agregaria BOM, que el cliente de MySQL no
    # interpreta; se escribe en ASCII, suficiente para estos valores.
    [System.IO.File]::WriteAllText($ruta, $contenido, [System.Text.Encoding]::ASCII)

    # El grupo de administradores se nombra por su SID conocido
    # (S-1-5-32-544) y no por "Administrators": en un Windows en espanol
    # ese nombre no existe (es "Administradores"), icacls falla con el
    # codigo 1332 y NO aplica ninguna de las dos concesiones, ni siquiera
    # /inheritance:r, de modo que el archivo con la contrasena
    # administrativa se quedaria con los permisos heredados de %TEMP%.
    # Al usuario actual se le da (M) y no (R,W) porque el borrado del
    # final necesita el permiso de eliminacion, que (W) no incluye.
    $salidaIcacls = & icacls.exe $ruta /inheritance:r /grant:r "$($env:USERNAME):(M)" /grant:r '*S-1-5-32-544:(F)' 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host 'AVISO: no se pudieron restringir los permisos del archivo de credenciales temporal.' -ForegroundColor Yellow
        Write-Host ("       icacls devolvio {0}: {1}" -f $LASTEXITCODE, ((Convertir-ALineas $salidaIcacls) -join ' ')) -ForegroundColor Yellow
        Write-Host '       El archivo se borra igual al terminar, pero revise los permisos de su carpeta temporal.' -ForegroundColor Yellow
    }

    return $ruta
}

function Invocar-Mysql {
    <#
        Ejecuta una sentencia y devuelve sus filas como cadenas. -N quita
        la fila de encabezados y -B usa separador por tabulaciones, que es
        lo comodo para leer desde PowerShell.

        Devuelve cero filas cuando la consulta no encuentra nada. Como
        PowerShell desenvuelve los arreglos al devolverlos, quien llame a
        esta funcion y vaya a indexar o contar debe envolver la llamada en
        @(...): sin eso, una sola fila llega como cadena y $salida[0]
        entrega su primer caracter en lugar de la fila. Para leer un valor
        unico es preferible Obtener-ValorMysql u Obtener-ConteoMysql.
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
        throw "MySQL devolvio error al ejecutar una sentencia: $((Convertir-ALineas $salida) -join ' ')"
    }
    return (Convertir-ALineas $salida)
}

function Obtener-ValorMysql {
    <#
        Lee el primer campo de la primera fila de una consulta y lo
        devuelve recortado. Si la consulta no devuelve filas entrega ''.

        Esta es la forma correcta de preguntar "existe esto": la consulta
        que no encuentra nada no devuelve una cadena vacia, no devuelve
        nada, y eso es lo que antes llegaba como $null al codigo que
        llamaba .Trim().
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Sentencia,
        [string] $Base = ''
    )

    $filas = @(Invocar-Mysql -Sentencia $Sentencia -Base $Base)
    if ($filas.Count -eq 0) { return '' }
    return $filas[0].Trim()
}

function Obtener-ConteoMysql {
    <#
        Igual que Obtener-ValorMysql pero para un COUNT(*): devuelve un
        entero. Si no hay filas, o el valor no es numerico (NULL, un
        aviso), devuelve 0 en vez de reventar en la conversion.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Sentencia,
        [string] $Base = ''
    )

    $valor = Obtener-ValorMysql -Sentencia $Sentencia -Base $Base
    $numero = 0
    if ([int]::TryParse($valor, [ref] $numero)) { return $numero }
    return 0
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

    # @() alrededor de Get-Content: un archivo vacio devuelve $null, y
    # entonces el filtro recibiria un unico elemento nulo.
    $lineas = @(Get-Content -LiteralPath $Ruta -Encoding UTF8)
    $filtradas = @($lineas | Where-Object { $null -ne $_ -and $_ -notmatch '^\s*USE\s+[`\w]+\s*;' })
    $contenido = $filtradas -join "`r`n"

    $temporal = Join-Path $env:TEMP ("munidata-sql-{0}.sql" -f ([guid]::NewGuid().ToString('N')))
    try {
        [System.IO.File]::WriteAllText($temporal, $contenido, (New-Object System.Text.UTF8Encoding($false)))

        $salida = & mysql.exe "--defaults-extra-file=$archivoOpciones" '--default-character-set=utf8mb4' '--database' $Base '-e' "source $($temporal -replace '\\', '/')" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Fallo al aplicar $(Split-Path -Leaf $Ruta): $((Convertir-ALineas $salida) -join ' ')"
        }
        return (Convertir-ALineas $salida)
    } finally {
        if (Test-Path -LiteralPath $temporal) {
            Remove-Item -LiteralPath $temporal -Force -ErrorAction SilentlyContinue
        }
    }
}

function Obtener-MotivoRegistroNoFiable {
    <#
        Guardia ante una base poblada: devuelve '' si la tabla de control
        es fiable o, si no, la explicacion de por que no lo es.

        Fiable significa que registra, sin huecos, todo lo que deberia
        estar aplicado: un script esperado sin registrar solo es aceptable
        si va despues del ultimo registrado (es un pendiente). Esperados
        son los de init/ en orden de nombre, sin el 06 salvo con
        -IncluirUsuarioSemilla, que es el mismo criterio con el que se
        aplican.

        No lee nada si la tabla no existe: consultarla daria error. Por eso
        se pregunta antes a information_schema.
    #>
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]] $Esperados)

    $existeControl = Obtener-ConteoMysql -Sentencia ("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{0}' AND TABLE_NAME = '{1}';" -f $BaseDatos, $TABLA_CONTROL)
    if ($existeControl -eq 0) {
        return "no existe la tabla de control $TABLA_CONTROL"
    }

    $filas = @(Invocar-Mysql -Sentencia ("SELECT nombre_script FROM ``{0}``;" -f $TABLA_CONTROL) -Base $BaseDatos)
    $registrados = @($filas | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

    $ultimoRegistrado = ''
    foreach ($nombre in $Esperados) {
        if ($registrados -contains $nombre) { $ultimoRegistrado = $nombre }
    }
    if ($ultimoRegistrado -eq '') {
        return "la tabla de control $TABLA_CONTROL no registra ninguno de los scripts de init/"
    }

    $huecos = @($Esperados | Where-Object { ($registrados -notcontains $_) -and ([string]::CompareOrdinal($_, $ultimoRegistrado) -lt 0) })
    if ($huecos.Count -gt 0) {
        return ("la tabla de control {0} tiene huecos: registra {1}, pero no {2}" -f $TABLA_CONTROL, $ultimoRegistrado, ($huecos -join ', '))
    }

    return ''
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
    if ($SoloScripts) {
        Write-Host ('[SIMULACION]   2. (-SoloScripts) NO pedir ni cambiar la contrasena del usuario {0}.' -f $UsuarioAplicacion)
    } else {
        Write-Host ('[SIMULACION]   2. Pedir la contrasena del usuario {0}.' -f $UsuarioAplicacion)
    }
    Write-Host '[SIMULACION]   3. Escribir un archivo de opciones temporal con permisos restringidos.'
    if ($SoloScripts) {
        Write-Host ('[SIMULACION]   4. (-SoloScripts) Exigir que la base {0} exista; no crearla.' -f $BaseDatos)
    } else {
        Write-Host ('[SIMULACION]   4. CREATE DATABASE {0} con utf8mb4_unicode_ci si no existe.' -f $BaseDatos)
    }
    Write-Host ('[SIMULACION]   5. Si la base tiene tablas, detenerse sin tocar nada si {0} falta, esta vacia o tiene huecos.' -f $TABLA_CONTROL)
    Write-Host ('[SIMULACION]   6. mysqldump previo a {0} si la base ya tuviera datos.' -f $RutaRespaldos)
    if ($SoloScripts) {
        Write-Host ('[SIMULACION]   7. (-SoloScripts) Omitir CREATE USER, ALTER USER y GRANT de {0}.' -f $UsuarioAplicacion)
    } else {
        Write-Host ('[SIMULACION]   7. CREATE USER {0}, ALTER USER con la contrasena nueva y GRANT solo sobre esa base.' -f $UsuarioAplicacion)
    }
    Write-Host ('[SIMULACION]   8. Crear la tabla de control {0} y aplicar los scripts pendientes.' -f $TABLA_CONTROL)
    Write-Host '[SIMULACION]   9. Borrar el archivo de opciones temporal.'
    Write-Host ''
    Write-Host '[SIMULACION] Sin conexion no se puede evaluar la guardia del paso 5.'
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

    # El archivo de opciones se escribe en ASCII, porque es lo que lee el
    # cliente de MySQL sin ambiguedad de pagina de codigos. Una letra
    # acentuada se convertiria en '?' y el servidor rechazaria la
    # conexion sin explicar por que, asi que se avisa aqui.
    $textoAdmin = Convertir-ASecreto -Segura $contrasenaAdmin
    if ($textoAdmin -match '[^\x20-\x7E]') {
        throw 'La contrasena administrativa tiene caracteres fuera del ASCII imprimible (acentos, ene u otros). El cliente de MySQL no puede recibirla por archivo de opciones.'
    }

    # Con -SoloScripts la contrasena del usuario de aplicacion ni se pide
    # ni se toca: es la que ya usa el backend en produccion.
    $textoApp = ''
    if ($SoloScripts) {
        Escribir-Detalle ("-SoloScripts: no se pide ni se cambia la contrasena de {0}." -f $UsuarioAplicacion)
    } else {
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
    }

    $archivoOpciones = Nuevo-ArchivoOpciones -Usuario $UsuarioAdministrador -Contrasena $textoAdmin

    # --------------------------------------------------------
    # Conexion
    # --------------------------------------------------------
    Escribir-Paso 'Comprobando la conexion con MySQL'
    $version = Obtener-ValorMysql -Sentencia 'SELECT VERSION();'
    Escribir-Detalle "Conectado. Version del servidor: $version"

    # --------------------------------------------------------
    # Base de datos
    # --------------------------------------------------------
    Escribir-Paso "Base de datos $BaseDatos"
    # Si la base no existe la consulta no devuelve ninguna fila, no una
    # fila vacia; Obtener-ValorMysql traduce eso a ''.
    $esquemaEncontrado = Obtener-ValorMysql -Sentencia ("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '{0}';" -f $BaseDatos)
    $baseYaExistia = ($esquemaEncontrado -ne '')

    if ($baseYaExistia) {
        Escribir-Detalle 'Ya existe; no se recrea.'
    } elseif ($SoloScripts) {
        # -SoloScripts es para actualizar una base en uso. Sin base no hay
        # nada que actualizar, y crearla aqui dejaria una base sin usuario
        # de aplicacion.
        throw "No existe la base de datos $BaseDatos. -SoloScripts solo actualiza una base existente; para una instalacion nueva ejecute el script sin -SoloScripts."
    } else {
        $null = Invocar-Mysql -Sentencia ("CREATE DATABASE `{0}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" -f $BaseDatos)
        Escribir-Detalle 'Creada con utf8mb4 / utf8mb4_unicode_ci.'
    }

    # --------------------------------------------------------
    # Guardia: base poblada sin registro fiable de scripts
    # --------------------------------------------------------
    # Va ANTES del volcado, del usuario de aplicacion y de la tabla de
    # control: si se detiene, no deja ningun efecto. Antes esta
    # comprobacion iba despues del ALTER USER (la contrasena ya habia
    # cambiado) y solo miraba si existia la tabla 'usuarios'; tampoco
    # detectaba una tabla de control con huecos, en cuyo caso se volvian
    # a aplicar scripts viejos encima de los datos.
    if ($baseYaExistia) {
        $tablasDeDatos = Obtener-ConteoMysql -Sentencia ("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{0}' AND TABLE_NAME <> '{1}';" -f $BaseDatos, $TABLA_CONTROL)

        if ($tablasDeDatos -gt 0) {
            $esperados = @($scripts | ForEach-Object { $_.Name } | Where-Object { $IncluirUsuarioSemilla -or $_ -ne $SCRIPT_USUARIO_SEMILLA })
            $motivo = Obtener-MotivoRegistroNoFiable -Esperados $esperados

            if ($motivo -ne '') {
                throw @"
Se detiene sin ejecutar nada: la base $BaseDatos ya tiene $tablasDeDatos tablas, pero $motivo.

No se puede saber que scripts estan aplicados de verdad, y aplicarlos otra vez
encima de los datos podria duplicar filas o dejar la base a medias. No se hizo
ningun cambio: ni volcado, ni usuario de aplicacion, ni tabla de control, ni
scripts.

Que hacer:
  - Ejecute despliegue\diagnosticar-codigos-categorias.ps1 y revise el
    bloque 1b (tabla de control).
  - Revise con quien administra la base que scripts de
    base-datos\scripts\init tiene aplicados en realidad, antes de registrar
    ninguno a mano.
"@
            }
            Escribir-Detalle ("Tabla de control {0} sin huecos." -f $TABLA_CONTROL)
        }
    }

    # --------------------------------------------------------
    # Respaldo previo
    # --------------------------------------------------------
    if ($baseYaExistia) {
        $cantidadTablas = Obtener-ConteoMysql -Sentencia ("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{0}';" -f $BaseDatos)

        if ($cantidadTablas -gt 0) {
            Escribir-Paso "Respaldo previo ($cantidadTablas tablas existentes)"
            if (-not (Test-Path -LiteralPath $RutaRespaldos)) {
                $null = New-Item -ItemType Directory -Path $RutaRespaldos -Force
            }
            $marca = Get-Date -Format 'yyyyMMdd-HHmmss'
            $archivoVolcado = Join-Path $RutaRespaldos ("previo-a-scripts-{0}.sql" -f $marca)

            # --no-tablespaces evita la consulta a INFORMATION_SCHEMA.FILES,
            # que exige el privilegio global PROCESS: el usuario
            # administrativo de MySQL en la VM no tiene por que tenerlo, y
            # para tablas InnoDB esa informacion no hace falta al restaurar.
            & mysqldump.exe "--defaults-extra-file=$archivoOpciones" '--single-transaction' '--default-character-set=utf8mb4' '--no-tablespaces' $BaseDatos --result-file=$archivoVolcado
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
    if ($SoloScripts) {
        Escribir-Detalle 'Omitido (-SoloScripts): ni CREATE USER, ni ALTER USER, ni GRANT.'
    } else {
        Escribir-Detalle 'Se concede privilegio solo sobre esta base (minimo privilegio).'
        Escribir-Detalle "Hosts permitidos: localhost y 127.0.0.1 unicamente, nunca '%'."

        # IF NOT EXISTS mantiene la idempotencia sin tocar la contrasena de un
        # usuario que ya estuviera en uso.
        #
        # La lista de hosts es deliberadamente local: 'localhost' y
        # '127.0.0.1', porque MySQL los trata como hosts distintos y el
        # backend se conecta por el segundo. NUNCA se usa '%': en esta VM el
        # servicio de MySQL escucha en 0.0.0.0 (lo dejo otro sistema, y no se
        # modifica), de modo que un usuario con host '%' quedaria alcanzable
        # desde la red con permisos sobre toda la base. Acotarlo al propio
        # equipo es lo que mantiene la exposicion en cero sin tocar la
        # configuracion compartida de MySQL.
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
    }

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

    # Una base poblada sin registro fiable ya se detuvo en la guardia de
    # arriba; aqui la tabla o registra todo sin huecos o es de una
    # instalacion nueva y acaba de crearse vacia. En ese caso la consulta
    # no devuelve filas y el filtro recibiria un elemento nulo si no se
    # envolviera la llamada en @(...).
    $filasControl = @(Invocar-Mysql -Sentencia ("SELECT nombre_script FROM ``{0}``;" -f $TABLA_CONTROL) -Base $BaseDatos)
    $aplicadosPrevios = @($filasControl | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

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
    # Un COUNT(*) por tabla en vez de una sola consulta con cinco
    # subconsultas y un -split por tabulaciones: cada lectura es
    # independiente y no hay indices que puedan quedar fuera de rango si
    # una columna falta. La tabla es tipos_documentos, en plural, como la
    # crea 01-esquema.sql; el nombre en singular hacia fallar este paso
    # final con "Table 'tipos_documento' doesn't exist" cuando todo lo
    # demas ya habia salido bien.
    $totalRoles = Obtener-ConteoMysql -Sentencia 'SELECT COUNT(*) FROM roles;' -Base $BaseDatos
    $totalPermisos = Obtener-ConteoMysql -Sentencia 'SELECT COUNT(*) FROM permisos;' -Base $BaseDatos
    $totalCategorias = Obtener-ConteoMysql -Sentencia 'SELECT COUNT(*) FROM categorias_itsp;' -Base $BaseDatos
    $totalTipos = Obtener-ConteoMysql -Sentencia 'SELECT COUNT(*) FROM tipos_documentos;' -Base $BaseDatos
    $totalUsuarios = Obtener-ConteoMysql -Sentencia 'SELECT COUNT(*) FROM usuarios;' -Base $BaseDatos

    Write-Host ("  Scripts aplicados ahora : {0}" -f $aplicados)
    Write-Host ("  Scripts ya aplicados    : {0}" -f $omitidos)
    Write-Host ("  Roles                   : {0}" -f $totalRoles)
    Write-Host ("  Permisos                : {0}" -f $totalPermisos)
    Write-Host ("  Categorias ITSP         : {0}" -f $totalCategorias)
    Write-Host ("  Tipos de documento      : {0}" -f $totalTipos)
    Write-Host ("  Usuarios                : {0}" -f $totalUsuarios)

    if ($totalUsuarios -eq 0) {
        Write-Host ''
        Write-Host 'No hay ningun usuario todavia, como corresponde.' -ForegroundColor Yellow
        Write-Host 'Cree el administrador inicial DESPUES de desplegar el backend, con:' -ForegroundColor Yellow
        Write-Host '    powershell -ExecutionPolicy Bypass -File .\despliegue\crear-administrador.ps1' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host 'Base de datos preparada correctamente.' -ForegroundColor Green
    if (-not $SoloScripts) {
        Write-Host ("Anote estos valores para .env.produccion: BD_NOMBRE={0}, BD_USUARIO={1}" -f $BaseDatos, $UsuarioAplicacion)
    }
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
        # Se comprueba en vez de anunciarlo sin mas: el mensaje anterior se
        # imprimia aunque el borrado hubiera fallado, y ese archivo tiene
        # la contrasena administrativa de MySQL.
        if (Test-Path -LiteralPath $archivoOpciones) {
            Write-Host ''
            Write-Host 'AVISO: no se pudo borrar el archivo de credenciales temporal:' -ForegroundColor Yellow
            Write-Host ("       {0}" -f $archivoOpciones) -ForegroundColor Yellow
            Write-Host '       Contiene la contrasena administrativa de MySQL. Borrelo a mano.' -ForegroundColor Yellow
        } else {
            Write-Host '(archivo de credenciales temporal eliminado)'
        }
    }
}
