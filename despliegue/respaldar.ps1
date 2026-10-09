<#
.SINOPSIS
    Respalda la base de datos y los PDF de Muni Data.

.DESCRIPCION
    Genera, dentro de C:\munidata\respaldos\<fecha>:

      - base-datos.sql.gz : volcado completo con mysqldump
                            --single-transaction, comprimido.
      - documentos.zip    : copia comprimida de la carpeta de PDF.

    Conserva unicamente los ultimos 14 respaldos y borra los anteriores.

    Las credenciales no viajan por la linea de comandos: se escriben en un
    archivo de opciones temporal con permisos restringidos, que se borra
    al terminar. Con -RegistrarTarea, la contrasena se guarda una sola vez
    en un archivo de opciones permanente, tambien con permisos
    restringidos, porque una tarea programada no puede escribirla a mano
    cada noche.

.PARAMETER RutaDatos
    Carpeta raiz de datos del sistema.

.PARAMETER BaseDatos
    Nombre de la base de datos.

.PARAMETER UsuarioMysql
    Usuario con el que se hace el volcado.

.PARAMETER ServidorMysql
    Host de MySQL.

.PARAMETER PuertoMysql
    Puerto de MySQL.

.PARAMETER RespaldosAConservar
    Cuantas carpetas de respaldo mantener.

.PARAMETER RegistrarTarea
    Crea una tarea programada diaria que ejecuta este mismo script.

.PARAMETER HoraTarea
    Hora de la tarea programada, en formato HH:mm.

.PARAMETER ArchivoCredenciales
    Archivo de opciones de MySQL a usar. Si existe, no se pide contrasena
    (es lo que permite que la tarea programada corra sin intervencion).

.PARAMETER Simular
    Imprime lo que haria sin ejecutar nada.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1 -RegistrarTarea
#>

[CmdletBinding()]
param(
    [string] $RutaDatos = 'C:\munidata',
    [string] $BaseDatos = 'munidata',
    [string] $UsuarioMysql = 'munidata_app',
    [string] $ServidorMysql = '127.0.0.1',
    [int]    $PuertoMysql = 3306,
    [int]    $RespaldosAConservar = 14,
    [switch] $RegistrarTarea,
    [string] $HoraTarea = '02:30',
    [string] $ArchivoCredenciales = '',
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$rutaRespaldos      = Join-Path $RutaDatos 'respaldos'
$rutaDocumentos     = Join-Path $RutaDatos 'storage\documentos'
$rutaConfig         = Join-Path $RutaDatos 'config'
$credencialesPorDefecto = Join-Path $rutaConfig 'mysql-respaldo.cnf'
$nombreTarea        = 'MuniData-Respaldo-Diario'

$credencialesTemporales = $null

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
    param([Parameter(Mandatory = $true)][System.Security.SecureString] $Segura)
    $puntero = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Segura)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($puntero)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero)
    }
}

function Nuevo-ArchivoOpciones {
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [Parameter(Mandatory = $true)][string] $Contrasena
    )
    $contenido = @(
        '[client]',
        ("user={0}" -f $UsuarioMysql),
        ("password={0}" -f $Contrasena),
        ("host={0}" -f $ServidorMysql),
        ("port={0}" -f $PuertoMysql)
    ) -join "`r`n"

    $carpeta = Split-Path -Parent $Ruta
    if (-not (Test-Path -LiteralPath $carpeta)) {
        $null = New-Item -ItemType Directory -Path $carpeta -Force
    }

    [System.IO.File]::WriteAllText($Ruta, $contenido, [System.Text.Encoding]::ASCII)
    & icacls.exe $Ruta /inheritance:r /grant:r 'Administrators:(F)' /grant:r 'SYSTEM:(R)' | Out-Null
}

Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - respaldo'
Write-Host '============================================================'
Write-Host ("Base de datos : {0} en {1}:{2}" -f $BaseDatos, $ServidorMysql, $PuertoMysql)
Write-Host ("Documentos    : {0}" -f $rutaDocumentos)
Write-Host ("Destino       : {0}" -f $rutaRespaldos)
Write-Host ("Se conservan  : los ultimos {0} respaldos" -f $RespaldosAConservar)

if ($ArchivoCredenciales -eq '') {
    $ArchivoCredenciales = $credencialesPorDefecto
}

# ------------------------------------------------------------
# Registro de la tarea programada
# ------------------------------------------------------------
if ($RegistrarTarea) {
    Escribir-Paso "Tarea programada diaria a las $HoraTarea"

    $comando = ('-ExecutionPolicy Bypass -NoProfile -File "{0}" -RutaDatos "{1}" -BaseDatos "{2}" -UsuarioMysql "{3}" -ArchivoCredenciales "{4}"' -f $PSCommandPath, $RutaDatos, $BaseDatos, $UsuarioMysql, $ArchivoCredenciales)

    if ($Simular) {
        Write-Host '    [SIMULACION] crearia la tarea:' -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION]   Nombre  : {0}" -f $nombreTarea) -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION]   Diaria  : {0}" -f $HoraTarea) -ForegroundColor DarkGray
        Write-Host '    [SIMULACION]   Usuario : SYSTEM, con privilegios maximos' -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION]   Accion  : powershell.exe {0}" -f $comando) -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION] y pediria la contrasena de {0} para guardarla en {1}" -f $UsuarioMysql, $ArchivoCredenciales) -ForegroundColor DarkGray
        Write-Host '    [SIMULACION] (permisos restringidos a Administradores y SYSTEM)' -ForegroundColor DarkGray
    } else {
        if (-not (Test-Path -LiteralPath $ArchivoCredenciales)) {
            Escribir-Detalle 'La tarea corre sin nadie delante, asi que necesita la contrasena guardada.'
            $segura = Read-Host -Prompt ("Contrasena de {0} en MySQL" -f $UsuarioMysql) -AsSecureString
            if ($segura.Length -eq 0) { throw 'La contrasena no puede estar vacia.' }
            Nuevo-ArchivoOpciones -Ruta $ArchivoCredenciales -Contrasena (Convertir-ASecreto -Segura $segura)
            Escribir-Detalle "Credenciales guardadas en $ArchivoCredenciales (solo Administradores y SYSTEM)."
        } else {
            Escribir-Detalle "Se reutiliza el archivo de credenciales existente."
        }

        $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $comando
        $disparador = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($HoraTarea, 'HH:mm', $null))
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        # StartWhenAvailable: si la VM estaba apagada a esa hora, el
        # respaldo se hace al encenderla en vez de perderse.
        $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

        $existente = Get-ScheduledTask -TaskName $nombreTarea -ErrorAction SilentlyContinue
        if ($null -ne $existente) {
            Unregister-ScheduledTask -TaskName $nombreTarea -Confirm:$false
            Escribir-Detalle 'Se reemplaza la tarea anterior.'
        }

        $null = Register-ScheduledTask -TaskName $nombreTarea -Action $accion -Trigger $disparador -Principal $principal -Settings $ajustes -Description 'Respaldo diario de la base de datos y los documentos de Muni Data.'
        Escribir-Detalle "Tarea '$nombreTarea' registrada."
        Write-Host ''
        Write-Host 'Comprobaciones utiles:' -ForegroundColor Green
        Write-Host ("  Get-ScheduledTask -TaskName '{0}'" -f $nombreTarea) -ForegroundColor Green
        Write-Host ("  Start-ScheduledTask -TaskName '{0}'   # ejecutarla ahora" -f $nombreTarea) -ForegroundColor Green
        Write-Host ("  Get-ScheduledTaskInfo -TaskName '{0}' # ultimo resultado" -f $nombreTarea) -ForegroundColor Green
    }
}

# ------------------------------------------------------------
# Respaldo
# ------------------------------------------------------------
$marca = Get-Date -Format 'yyyyMMdd-HHmmss'
$destino = Join-Path $rutaRespaldos $marca

if ($Simular) {
    Escribir-Paso 'Respaldo'
    Write-Host ("    [SIMULACION] crearia {0}" -f $destino) -ForegroundColor DarkGray
    Write-Host '    [SIMULACION] mysqldump --single-transaction --default-character-set=utf8mb4' -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION]   -> {0}\base-datos.sql.gz" -f $destino) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION] comprimiria {0}" -f $rutaDocumentos) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION]   -> {0}\documentos.zip" -f $destino) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION] borraria las carpetas de respaldo mas alla de las {0} mas recientes" -f $RespaldosAConservar) -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '[SIMULACION] Terminado sin cambios.' -ForegroundColor Green
    exit 0
}

try {
    if ($null -eq (Get-Command -Name 'mysqldump.exe' -ErrorAction SilentlyContinue)) {
        throw 'No se encontro mysqldump.exe en el PATH.'
    }

    # ----------------------------------------------------------
    # Credenciales
    # ----------------------------------------------------------
    if (Test-Path -LiteralPath $ArchivoCredenciales) {
        $opcionesEnUso = $ArchivoCredenciales
    } else {
        Escribir-Paso 'Credenciales'
        $segura = Read-Host -Prompt ("Contrasena de {0} en MySQL" -f $UsuarioMysql) -AsSecureString
        if ($segura.Length -eq 0) { throw 'La contrasena no puede estar vacia.' }
        $credencialesTemporales = Join-Path $env:TEMP ("munidata-respaldo-{0}.cnf" -f ([guid]::NewGuid().ToString('N')))
        Nuevo-ArchivoOpciones -Ruta $credencialesTemporales -Contrasena (Convertir-ASecreto -Segura $segura)
        $opcionesEnUso = $credencialesTemporales
    }

    $null = New-Item -ItemType Directory -Path $destino -Force

    # ----------------------------------------------------------
    # Base de datos
    # ----------------------------------------------------------
    Escribir-Paso 'Volcado de la base de datos'

    # --single-transaction toma una instantanea coherente sin bloquear las
    # tablas, asi que el sistema sigue funcionando durante el respaldo
    # (solo valido con InnoDB, que es el motor de todas las tablas).
    $archivoSql = Join-Path $destino 'base-datos.sql'
    & mysqldump.exe "--defaults-extra-file=$opcionesEnUso" '--single-transaction' '--default-character-set=utf8mb4' '--routines' '--events' $BaseDatos --result-file=$archivoSql
    if ($LASTEXITCODE -ne 0) {
        throw 'mysqldump fallo; el respaldo no es valido.'
    }

    $tamanoSql = [math]::Round((Get-Item -LiteralPath $archivoSql).Length / 1MB, 2)
    Escribir-Detalle "Volcado: $tamanoSql MB"

    # Compress-Archive produce .zip, no .gz; para un unico archivo se usa
    # GZipStream, que es lo que corresponde a la extension .sql.gz y es
    # mas comodo de restaurar con una linea.
    $archivoGz = "$archivoSql.gz"
    $entrada = [System.IO.File]::OpenRead($archivoSql)
    try {
        $salida = [System.IO.File]::Create($archivoGz)
        try {
            $compresor = New-Object System.IO.Compression.GZipStream($salida, [System.IO.Compression.CompressionMode]::Compress)
            try {
                $entrada.CopyTo($compresor)
            } finally {
                $compresor.Dispose()
            }
        } finally {
            $salida.Dispose()
        }
    } finally {
        $entrada.Dispose()
    }
    Remove-Item -LiteralPath $archivoSql -Force

    $tamanoGz = [math]::Round((Get-Item -LiteralPath $archivoGz).Length / 1MB, 2)
    Escribir-Detalle "Comprimido: $tamanoGz MB -> $archivoGz"

    # ----------------------------------------------------------
    # Documentos
    # ----------------------------------------------------------
    Escribir-Paso 'Copia de los documentos PDF'
    if (-not (Test-Path -LiteralPath $rutaDocumentos)) {
        Escribir-Detalle "No existe $rutaDocumentos todavia; no hay documentos que respaldar."
    } else {
        $archivos = @(Get-ChildItem -LiteralPath $rutaDocumentos -File -Recurse -ErrorAction SilentlyContinue)
        if ($archivos.Count -eq 0) {
            Escribir-Detalle 'La carpeta esta vacia; no se genera el zip.'
        } else {
            $archivoZip = Join-Path $destino 'documentos.zip'
            Compress-Archive -Path (Join-Path $rutaDocumentos '*') -DestinationPath $archivoZip -CompressionLevel Optimal -Force
            $tamanoZip = [math]::Round((Get-Item -LiteralPath $archivoZip).Length / 1MB, 2)
            Escribir-Detalle ("{0} archivo(s), {1} MB -> {2}" -f $archivos.Count, $tamanoZip, $archivoZip)
        }
    }

    # ----------------------------------------------------------
    # Rotacion
    # ----------------------------------------------------------
    Escribir-Paso 'Rotacion de respaldos'

    # Solo se consideran las carpetas con nombre de marca de tiempo: las
    # que crea desplegar.ps1 tienen el mismo formato, asi que se cuentan
    # juntas a proposito (todas ocupan el mismo disco).
    $carpetas = @(Get-ChildItem -LiteralPath $rutaRespaldos -Directory |
        Where-Object { $_.Name -match '^\d{8}-\d{6}$' } |
        Sort-Object -Property Name -Descending)

    if ($carpetas.Count -le $RespaldosAConservar) {
        Escribir-Detalle ("{0} respaldo(s); no hay nada que borrar." -f $carpetas.Count)
    } else {
        $sobrantes = $carpetas[$RespaldosAConservar..($carpetas.Count - 1)]
        foreach ($carpeta in $sobrantes) {
            Remove-Item -LiteralPath $carpeta.FullName -Recurse -Force
            Escribir-Detalle ("eliminado  {0}" -f $carpeta.Name)
        }
        Escribir-Detalle ("Se conservan los {0} mas recientes." -f $RespaldosAConservar)
    }

    Write-Host ''
    Write-Host "Respaldo completado en $destino" -ForegroundColor Green
    Write-Host ''
    Write-Host 'Para restaurar la base de datos desde este respaldo (DESTRUYE los datos actuales):' -ForegroundColor Yellow
    Write-Host ("  node -e `"const z=require('zlib'),f=require('fs');f.writeFileSync('restaurar.sql',z.gunzipSync(f.readFileSync('{0}')))`"" -f $archivoGz) -ForegroundColor Yellow
    Write-Host ("  mysql -u {0} -p {1} < restaurar.sql" -f $UsuarioMysql, $BaseDatos) -ForegroundColor Yellow
    exit 0

} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $credencialesTemporales -and (Test-Path -LiteralPath $credencialesTemporales)) {
        Remove-Item -LiteralPath $credencialesTemporales -Force -ErrorAction SilentlyContinue
    }
}
