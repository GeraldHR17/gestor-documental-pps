<#
.SINOPSIS
    Diagnostico de SOLO LECTURA de los codigos de categoria antes (y
    despues) de aplicar la migracion 10.

.DESCRIPCION
    Ejecuta base-datos/scripts/diagnostico/10-diagnostico-codigos-categorias.sql
    contra la base indicada y muestra sus siete bloques: estructura, nulos
    y vacios, irregulares, duplicados, grafia, vista previa de los codigos
    que asignaria la migracion y un resumen.

    Ademas lista lo que registra la tabla de control scripts_aplicados y lo
    compara con base-datos/scripts/init (bloque 1b): debe estar registrado
    todo lo anterior al primer script pendiente, sin huecos. Eso no se
    puede comprobar en SQL plano, porque la tabla podria no existir.

    No escribe nada: solo SELECT. No crea ni modifica usuarios, tablas ni
    filas.

    Termina con un veredicto:
      codigo 0  CONTINUAR  se puede aplicar la migracion.
      codigo 2  DETENERSE  falta la tabla de control, tiene huecos, hay
                           codigos duplicados o subsecciones sin raiz.
      codigo 1  error al ejecutar el diagnostico.

    La contrasena no viaja por la linea de comandos: se escribe en un
    archivo de opciones temporal con permisos restringidos, que se borra al
    terminar, igual que en preparar-base-datos.ps1.

.PARAMETER BaseDatos
    Base de datos a diagnosticar.

.PARAMETER ServidorMysql
    Host de MySQL.

.PARAMETER PuertoMysql
    Puerto de MySQL.

.PARAMETER UsuarioAdministrador
    Usuario de MySQL con el que se consulta.

.PARAMETER RutaDiagnostico
    Archivo .sql del diagnostico.

.PARAMETER RutaScripts
    Carpeta con los scripts SQL numerados de init/, para comparar con la
    tabla de control.

.PARAMETER IncluirUsuarioSemilla
    Cuenta 06-usuario-superadministrador.sql como esperado, igual que el
    switch del mismo nombre de preparar-base-datos.ps1. Por defecto no
    cuenta: en produccion no se aplica.

.PARAMETER Simular
    Imprime lo que haria sin conectarse ni pedir contrasenas.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\diagnosticar-codigos-categorias.ps1
#>

[CmdletBinding()]
param(
    [string] $BaseDatos = 'munidata',
    [string] $ServidorMysql = '127.0.0.1',
    [int]    $PuertoMysql = 3306,
    [string] $UsuarioAdministrador = 'root',
    [string] $RutaDiagnostico = '',
    [string] $RutaScripts = '',
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
$SCRIPT_MIGRACION = '10-codigos-categorias-autogenerados.sql'
$CODIGO_CONTINUAR = 0
$CODIGO_ERROR = 1
$CODIGO_DETENERSE = 2

$raizRepositorio = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
if ($RutaDiagnostico -eq '') {
    $RutaDiagnostico = Join-Path $raizRepositorio 'base-datos\scripts\diagnostico\10-diagnostico-codigos-categorias.sql'
}
if ($RutaScripts -eq '') {
    $RutaScripts = Join-Path $raizRepositorio 'base-datos\scripts\init'
}

$archivoOpciones = $null

# ------------------------------------------------------------
# Utilidades (las mismas que preparar-base-datos.ps1)
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
        if ($null -eq $texto) { return '' }
        return $texto
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero)
    }
}

function Convertir-ALineas {
    <#
        Normaliza la salida de un comando externo a un arreglo de cadenas
        no nulas, descartando los avisos del propio cliente de MySQL. Ver
        la explicacion completa en preparar-base-datos.ps1.
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
        Archivo de opciones de MySQL con las credenciales, con permisos
        restringidos al usuario actual y a los administradores (por SID,
        que no depende del idioma de Windows). Ver preparar-base-datos.ps1.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Usuario,
        [Parameter(Mandatory = $true)][string] $Contrasena
    )

    $ruta = Join-Path $env:TEMP ("munidata-mysql-{0}.cnf" -f ([guid]::NewGuid().ToString('N')))

    $usuarioEscapado = $Usuario.Replace('\', '\\').Replace('"', '\"')
    $contrasenaEscapada = $Contrasena.Replace('\', '\\').Replace('"', '\"')

    $contenido = @(
        '[client]',
        ("user=`"{0}`"" -f $usuarioEscapado),
        ("password=`"{0}`"" -f $contrasenaEscapada),
        ("host={0}" -f $ServidorMysql),
        ("port={0}" -f $PuertoMysql)
    ) -join "`r`n"

    [System.IO.File]::WriteAllText($ruta, $contenido, [System.Text.Encoding]::ASCII)

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
        Ejecuta una sentencia y devuelve sus filas (-N sin encabezados, -B
        separadas por tabulaciones). Quien vaya a contar o indexar debe
        envolver la llamada en @(...).
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
    param(
        [Parameter(Mandatory = $true)][string] $Sentencia,
        [string] $Base = ''
    )

    $filas = @(Invocar-Mysql -Sentencia $Sentencia -Base $Base)
    if ($filas.Count -eq 0) { return '' }
    return $filas[0].Trim()
}

function Invocar-Diagnostico {
    <#
        Ejecuta el archivo de diagnostico quitando su linea "USE <base>;",
        como hace preparar-base-datos.ps1 con los scripts de init/.
        -Formato 'tabla' es para mostrarlo; 'filas' devuelve tabulaciones
        sin encabezados, para leer el resumen final.
    #>
    param(
        [Parameter(Mandatory = $true)][ValidateSet('tabla', 'filas')][string] $Formato
    )

    $lineas = @(Get-Content -LiteralPath $RutaDiagnostico -Encoding UTF8)
    $filtradas = @($lineas | Where-Object { $null -ne $_ -and $_ -notmatch '^\s*USE\s+[`\w]+\s*;' })
    $contenido = $filtradas -join "`r`n"

    $temporal = Join-Path $env:TEMP ("munidata-sql-{0}.sql" -f ([guid]::NewGuid().ToString('N')))
    try {
        [System.IO.File]::WriteAllText($temporal, $contenido, (New-Object System.Text.UTF8Encoding($false)))

        $opcionesFormato = @('-t')
        if ($Formato -eq 'filas') { $opcionesFormato = @('-N', '-B') }

        $salida = & mysql.exe "--defaults-extra-file=$archivoOpciones" '--default-character-set=utf8mb4' @opcionesFormato '--database' $BaseDatos '-e' "source $($temporal -replace '\\', '/')" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Fallo el diagnostico: $((Convertir-ALineas $salida) -join ' ')"
        }
        return (Convertir-ALineas $salida)
    } finally {
        if (Test-Path -LiteralPath $temporal) {
            Remove-Item -LiteralPath $temporal -Force -ErrorAction SilentlyContinue
        }
    }
}

function Obtener-ScriptsEsperados {
    <#
        Nombres de init/*.sql en el orden en que se aplican. El 06 solo
        cuenta con -IncluirUsuarioSemilla, como en preparar-base-datos.ps1.
    #>
    $nombres = @(Get-ChildItem -LiteralPath $RutaScripts -Filter '*.sql' | Sort-Object -Property Name | ForEach-Object { $_.Name })
    if (-not $IncluirUsuarioSemilla) {
        $nombres = @($nombres | Where-Object { $_ -ne $SCRIPT_USUARIO_SEMILLA })
    }
    return $nombres
}

# ------------------------------------------------------------
# Inicio
# ------------------------------------------------------------
Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - diagnostico de codigos de categoria (solo lectura)'
Write-Host '============================================================'
Write-Host ("Base de datos : {0}" -f $BaseDatos)
Write-Host ("Servidor      : {0}:{1}" -f $ServidorMysql, $PuertoMysql)
Write-Host ("Diagnostico   : {0}" -f $RutaDiagnostico)
Write-Host ("Scripts SQL   : {0}" -f $RutaScripts)

foreach ($rutaNecesaria in @($RutaDiagnostico, $RutaScripts)) {
    if (-not (Test-Path -LiteralPath $rutaNecesaria)) {
        Write-Host ''
        Write-Host "ERROR: no existe $rutaNecesaria" -ForegroundColor Red
        exit $CODIGO_ERROR
    }
}

if ($Simular) {
    Write-Host ''
    Write-Host '[SIMULACION] No se pediran contrasenas ni se consultara la base de datos.'
    Write-Host '[SIMULACION] En una ejecucion real este script haria:'
    Write-Host ('[SIMULACION]   1. Pedir la contrasena de {0} en MySQL.' -f $UsuarioAdministrador)
    Write-Host '[SIMULACION]   2. Escribir un archivo de opciones temporal con permisos restringidos.'
    Write-Host ('[SIMULACION]   3. Comprobar que existe la base {0}.' -f $BaseDatos)
    Write-Host '[SIMULACION]   4. Ejecutar el diagnostico (solo SELECT) y mostrar sus bloques.'
    Write-Host ('[SIMULACION]   5. Comparar {0} con los scripts de init/ (bloque 1b).' -f $TABLA_CONTROL)
    Write-Host '[SIMULACION]   6. Dar el veredicto CONTINUAR o DETENERSE.'
    Write-Host '[SIMULACION]   7. Borrar el archivo de opciones temporal.'
    Write-Host ''
    Write-Host '[SIMULACION] Terminado sin cambios.' -ForegroundColor Green
    exit $CODIGO_CONTINUAR
}

if ($null -eq (Get-Command -Name 'mysql.exe' -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host 'ERROR: no se encontro mysql.exe en el PATH.' -ForegroundColor Red
    Write-Host '       Agregue la carpeta bin de MySQL al PATH y vuelva a intentar.' -ForegroundColor Red
    exit $CODIGO_ERROR
}

try {
    # --------------------------------------------------------
    # Credenciales y conexion
    # --------------------------------------------------------
    Escribir-Paso 'Credenciales'
    Escribir-Detalle 'Lo que escriba no se mostrara en pantalla ni quedara en el historial.'

    $contrasena = Read-Host -Prompt ("Contrasena de {0} en MySQL" -f $UsuarioAdministrador) -AsSecureString
    if ($contrasena.Length -eq 0) {
        throw 'La contrasena no puede estar vacia.'
    }
    $textoContrasena = Convertir-ASecreto -Segura $contrasena
    if ($textoContrasena -match '[^\x20-\x7E]') {
        throw 'La contrasena tiene caracteres fuera del ASCII imprimible. El cliente de MySQL no puede recibirla por archivo de opciones.'
    }
    $archivoOpciones = Nuevo-ArchivoOpciones -Usuario $UsuarioAdministrador -Contrasena $textoContrasena

    Escribir-Paso 'Comprobando la conexion con MySQL'
    $version = Obtener-ValorMysql -Sentencia 'SELECT VERSION();'
    Escribir-Detalle "Conectado. Version del servidor: $version"

    $esquemaEncontrado = Obtener-ValorMysql -Sentencia ("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '{0}';" -f $BaseDatos)
    if ($esquemaEncontrado -eq '') {
        throw "No existe la base de datos $BaseDatos."
    }

    # --------------------------------------------------------
    # Bloques 1 a 7
    # --------------------------------------------------------
    Escribir-Paso 'Diagnostico'
    foreach ($linea in @(Invocar-Diagnostico -Formato 'tabla')) {
        Write-Host $linea
    }

    # La ultima fila de la salida es el resumen: nulos_vacios,
    # grupos_duplicados, sin_vista_previa.
    $filas = @(Invocar-Diagnostico -Formato 'filas')
    if ($filas.Count -eq 0) {
        throw 'El diagnostico no devolvio el resumen final.'
    }
    $resumen = @($filas[$filas.Count - 1] -split "`t")
    if ($resumen.Count -ne 3) {
        throw "No se pudo leer el resumen del diagnostico: '$($filas[$filas.Count - 1])'."
    }
    $nulosVacios = [int] $resumen[0]
    $gruposDuplicados = [int] $resumen[1]
    $sinVistaPrevia = [int] $resumen[2]

    # --------------------------------------------------------
    # Bloque 1b: tabla de control
    # --------------------------------------------------------
    Escribir-Paso "1b. Tabla de control $TABLA_CONTROL"
    $motivosParaDetenerse = New-Object System.Collections.ArrayList
    $migracionRegistrada = $false

    $existeControl = Obtener-ValorMysql -Sentencia ("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{0}' AND TABLE_NAME = '{1}';" -f $BaseDatos, $TABLA_CONTROL)
    $esperados = @(Obtener-ScriptsEsperados)

    if ($existeControl -ne '1') {
        Escribir-Detalle "NO EXISTE la tabla $TABLA_CONTROL."
        $null = $motivosParaDetenerse.Add("no existe la tabla $TABLA_CONTROL")
    } else {
        $registrados = @(Invocar-Mysql -Sentencia ("SELECT nombre_script FROM ``{0}`` ORDER BY nombre_script;" -f $TABLA_CONTROL) -Base $BaseDatos | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })

        if ($registrados.Count -eq 0) {
            Escribir-Detalle "La tabla $TABLA_CONTROL esta VACIA."
            $null = $motivosParaDetenerse.Add("la tabla $TABLA_CONTROL esta vacia")
        } else {
            foreach ($nombre in $registrados) {
                Escribir-Detalle ("REGISTRADO  {0}" -f $nombre)
            }
            $migracionRegistrada = ($registrados -contains $SCRIPT_MIGRACION)

            # Ultimo registrado entre los esperados: lo que falte antes de
            # el es un hueco; lo que falte despues, un pendiente.
            $ultimoRegistrado = ''
            foreach ($nombre in $esperados) {
                if ($registrados -contains $nombre) { $ultimoRegistrado = $nombre }
            }

            $huecos = @($esperados | Where-Object { ($registrados -notcontains $_) -and ([string]::CompareOrdinal($_, $ultimoRegistrado) -lt 0) })
            $pendientes = @($esperados | Where-Object { ($registrados -notcontains $_) -and ([string]::CompareOrdinal($_, $ultimoRegistrado) -gt 0) })
            $desconocidos = @($registrados | Where-Object { ($esperados -notcontains $_) -and ($_ -ne $SCRIPT_USUARIO_SEMILLA) })

            foreach ($nombre in $huecos) {
                Write-Host ("    HUECO       {0}  (no registrado, pero hay otros posteriores registrados)" -f $nombre) -ForegroundColor Red
            }
            foreach ($nombre in $pendientes) {
                Escribir-Detalle ("PENDIENTE   {0}  (lo aplicara preparar-base-datos.ps1 -SoloScripts)" -f $nombre)
            }
            foreach ($nombre in $desconocidos) {
                Write-Host ("    AVISO       {0}  (registrado, pero no existe en init/)" -f $nombre) -ForegroundColor Yellow
            }

            if ($ultimoRegistrado -eq '') {
                $null = $motivosParaDetenerse.Add('la tabla de control no registra ninguno de los scripts de init/')
            }
            if ($huecos.Count -gt 0) {
                $null = $motivosParaDetenerse.Add(("la tabla de control tiene huecos: {0}" -f ($huecos -join ', ')))
            }
        }
    }

    # --------------------------------------------------------
    # Veredicto
    # --------------------------------------------------------
    Escribir-Paso 'Veredicto'
    Escribir-Detalle ("Codigos nulos o vacios      : {0}" -f $nulosVacios)
    Escribir-Detalle ("Grupos de codigos duplicados: {0}" -f $gruposDuplicados)
    Escribir-Detalle ("Subsecciones sin raiz       : {0}" -f $sinVistaPrevia)

    if ($gruposDuplicados -gt 0) {
        $null = $motivosParaDetenerse.Add('hay codigos duplicados (bloque 4): corrijalos a mano con el PO')
    }
    if ($sinVistaPrevia -gt 0) {
        $null = $motivosParaDetenerse.Add('hay subsecciones sin codigo cuyo padre no es una raiz (bloque 6)')
    }

    Write-Host ''
    if ($motivosParaDetenerse.Count -gt 0) {
        Write-Host 'DETENERSE: no aplique la migracion todavia.' -ForegroundColor Red
        foreach ($motivo in $motivosParaDetenerse) {
            Write-Host ("  - {0}" -f $motivo) -ForegroundColor Red
        }
        exit $CODIGO_DETENERSE
    }

    if ($migracionRegistrada) {
        # Es la comprobacion de despues de migrar (15.3, paso 7).
        Write-Host ("CONTINUAR: {0} ya esta aplicada." -f $SCRIPT_MIGRACION) -ForegroundColor Green
        if ($nulosVacios -gt 0) {
            Write-Host ("AVISO: aun hay {0} codigos nulos o vacios; revise el bloque 2." -f $nulosVacios) -ForegroundColor Yellow
        }
    } else {
        Write-Host 'CONTINUAR: se puede aplicar la migracion con preparar-base-datos.ps1 -SoloScripts.' -ForegroundColor Green
        if ($nulosVacios -eq 0) {
            Write-Host '(No hay codigos nulos ni vacios: la migracion no rellenara ninguno.)'
        }
    }
    exit $CODIGO_CONTINUAR

} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit $CODIGO_ERROR
} finally {
    # El archivo de opciones contiene la contrasena: se borra siempre.
    if ($null -ne $archivoOpciones -and (Test-Path -LiteralPath $archivoOpciones)) {
        Remove-Item -LiteralPath $archivoOpciones -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $archivoOpciones) {
            Write-Host ''
            Write-Host 'AVISO: no se pudo borrar el archivo de credenciales temporal:' -ForegroundColor Yellow
            Write-Host ("       {0}" -f $archivoOpciones) -ForegroundColor Yellow
            Write-Host '       Contiene la contrasena de MySQL. Borrelo a mano.' -ForegroundColor Yellow
        } else {
            Write-Host '(archivo de credenciales temporal eliminado)'
        }
    }
}
