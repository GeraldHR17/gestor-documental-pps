<#
.SINOPSIS
    Respalda la base de datos y los PDF de Muni Data.

.DESCRIPCION
    Genera, dentro de C:\munidata\respaldos\<fecha>:

      - base-datos.sql.gz : volcado completo con mysqldump
                            --single-transaction, comprimido.
      - documentos.zip    : copia comprimida de la carpeta de PDF.

    Conserva unicamente los ultimos 14 respaldos y borra los anteriores.
    Mientras se genera, la carpeta se llama "<fecha>.parcial" y solo se
    renombra al terminar bien, de modo que un respaldo fallido no se
    confunde con uno bueno ni cuenta para la rotacion.

    La ruta de mysqldump.exe se resuelve siempre a ruta absoluta y se le
    pasa a la tarea programada por parametro: la tarea corre como SYSTEM,
    que no ve el PATH del usuario que la registro.

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

.PARAMETER RutaMysqldump
    Ruta completa de mysqldump.exe. Si se omite, se busca en el PATH y,
    si tampoco esta ahi, bajo "C:\Program Files\MySQL\*\bin".

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
    [string] $RutaMysqldump = '',
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

# El SID del usuario con el que corre el proceso. Se usa en dos sitios y
# se calcula una sola vez. Bajo la tarea programada vale S-1-5-18
# (SYSTEM), que es como se distingue una corrida desatendida de una
# corrida a mano: $env:USERNAME no sirve para eso, porque bajo SYSTEM
# devuelve el nombre de la maquina con "$" al final.
$sidUsuarioActual = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value

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

function Resolver-Mysqldump {
    <#
        Devuelve la ruta absoluta de mysqldump.exe.

        La tarea programada corre como SYSTEM, y SYSTEM solo ve el PATH
        de maquina: nada de lo que este en el PATH del usuario que
        registro la tarea existe para ella. En esta VM la carpeta "bin"
        de MySQL no esta en ninguno de los dos PATH, de modo que un
        script que invoque "mysqldump.exe" a secas funciona al probarlo
        a mano desde una consola con el PATH ya arreglado y falla todas
        las noches a las 02:30 sin que nadie lo note.

        Por eso la ruta se resuelve una sola vez, al principio, y se usa
        esa misma ruta absoluta tanto para el volcado de esta corrida
        como en la linea de comandos de la tarea que se registra.
    #>
    param([switch] $ToleranteEnSimulacion)

    if ($RutaMysqldump -ne '') {
        if (Test-Path -LiteralPath $RutaMysqldump) {
            return (Resolve-Path -LiteralPath $RutaMysqldump).Path
        }
        if ($ToleranteEnSimulacion) { return $null }
        throw ("La ruta indicada en -RutaMysqldump no existe: {0}" -f $RutaMysqldump)
    }

    $comando = Get-Command -Name 'mysqldump.exe' -ErrorAction SilentlyContinue
    if ($null -ne $comando) {
        return $comando.Source
    }

    # Fuera del PATH: las carpetas donde los instaladores dejan el
    # cliente. Se ordena descendente para quedarse con la version mas
    # alta cuando hay varias instaladas una al lado de la otra.
    $patrones = @(
        'C:\Program Files\MySQL\*\bin\mysqldump.exe',
        'C:\Program Files (x86)\MySQL\*\bin\mysqldump.exe',
        'C:\xampp\mysql\bin\mysqldump.exe',
        'C:\MariaDB*\bin\mysqldump.exe'
    )

    foreach ($patron in $patrones) {
        $encontrados = @(Get-Item -Path $patron -ErrorAction SilentlyContinue |
            Where-Object { -not $_.PSIsContainer } |
            Sort-Object -Property FullName -Descending)
        if ($encontrados.Count -gt 0) {
            return $encontrados[0].FullName
        }
    }

    if ($ToleranteEnSimulacion) { return $null }

    $mensaje  = 'No se encontro mysqldump.exe: no esta en el PATH ni bajo "C:\Program Files\MySQL\*\bin".' + [Environment]::NewLine
    $mensaje += '       Localicelo con:' + [Environment]::NewLine
    $mensaje += '         Get-ChildItem "C:\Program Files" -Filter mysqldump.exe -Recurse -ErrorAction SilentlyContinue' + [Environment]::NewLine
    $mensaje += '       y vuelva a ejecutar agregando:' + [Environment]::NewLine
    $mensaje += '         -RutaMysqldump "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"'
    throw $mensaje
}

function Nuevo-ArchivoOpciones {
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [Parameter(Mandatory = $true)][string] $Contrasena
    )
    # El archivo se escribe en ASCII, que es lo que el cliente de MySQL
    # lee sin ambiguedad de pagina de codigos; una letra acentuada se
    # convertiria en '?' y el servidor rechazaria la conexion sin decir
    # por que.
    if ($Contrasena -match '[^\x20-\x7E]') {
        throw 'La contrasena tiene caracteres fuera del ASCII imprimible (acentos, ene u otros). El cliente de MySQL no puede recibirla por archivo de opciones.'
    }

    # Usuario y contrasena entre comillas dobles: el analizador de
    # archivos de opciones de MySQL corta la linea en el primer '#', de
    # modo que una contrasena como "Palmares#2026" llegaria al servidor
    # como "Palmares" y mysqldump fallaria con un "Access denied"
    # inexplicable. Dentro de las comillas la barra invertida es escape,
    # asi que se duplica.
    $usuarioEscapado = $UsuarioMysql.Replace('\', '\\').Replace('"', '\"')
    $contrasenaEscapada = $Contrasena.Replace('\', '\\').Replace('"', '\"')

    $contenido = @(
        '[client]',
        ("user=`"{0}`"" -f $usuarioEscapado),
        ("password=`"{0}`"" -f $contrasenaEscapada),
        ("host={0}" -f $ServidorMysql),
        ("port={0}" -f $PuertoMysql)
    ) -join "`r`n"

    $carpeta = Split-Path -Parent $Ruta
    if (-not (Test-Path -LiteralPath $carpeta)) {
        $null = New-Item -ItemType Directory -Path $carpeta -Force
    }

    [System.IO.File]::WriteAllText($Ruta, $contenido, [System.Text.Encoding]::ASCII)

    # Administradores y SYSTEM por SID conocido (S-1-5-32-544 y
    # S-1-5-18): en un Windows en espanol los nombres "Administrators" y
    # "SYSTEM" no resuelven, icacls falla con el codigo 1332 y no aplica
    # ninguna concesion ni el /inheritance:r, de modo que este archivo
    # con la contrasena de MySQL se quedaria con los permisos heredados.
    # Al usuario que ejecuta el script se le concede (M): es quien acaba
    # de escribir el archivo y quien tiene que leerlo en la misma corrida
    # para pasarselo a mysqldump, y borrarlo al terminar. Sin esa
    # concesion, una corrida sin elevacion crea un archivo que ni el
    # propio proceso puede volver a abrir, porque la pertenencia a
    # Administradores no esta en el testigo de un proceso no elevado.
    #
    # Se nombra por SID y no por $env:USERNAME porque esa variable sale
    # del entorno del proceso: bajo SYSTEM no es un nombre de cuenta que
    # icacls pueda resolver, y en un dominio puede llegar sin el dominio
    # delante. El SID siempre resuelve.
    $concesiones = @("*$($sidUsuarioActual):(M)", '*S-1-5-32-544:(F)')
    if ($sidUsuarioActual -ne 'S-1-5-18') {
        # Si el proceso ya es SYSTEM, la concesion de arriba lo cubre.
        # Repetir el SID en un segundo /grant:r pisaria la primera y
        # dejaria el archivo en solo lectura para quien tiene que
        # borrarlo al terminar.
        $concesiones += '*S-1-5-18:(R)'
    }

    $argumentosIcacls = @($Ruta, '/inheritance:r')
    foreach ($concesion in $concesiones) {
        $argumentosIcacls += '/grant:r'
        $argumentosIcacls += $concesion
    }

    $salidaIcacls = & icacls.exe @argumentosIcacls 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host ("AVISO: no se pudieron restringir los permisos de {0}" -f $Ruta) -ForegroundColor Yellow
        Write-Host ("       icacls devolvio {0}: {1}" -f $LASTEXITCODE, (($salidaIcacls | Out-String).Trim())) -ForegroundColor Yellow
        Write-Host '       Ese archivo contiene la contrasena de MySQL: revise sus permisos a mano.' -ForegroundColor Yellow
    }
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

# La ruta de mysqldump.exe se resuelve antes que nada: la necesitan por
# igual el volcado de esta corrida y el registro de la tarea, y si no
# aparece conviene decirlo antes de pedir contrasenas o crear carpetas.
try {
    $rutaMysqldumpResuelta = Resolver-Mysqldump -ToleranteEnSimulacion:$Simular
} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($null -eq $rutaMysqldumpResuelta) {
    Write-Host 'mysqldump     : no se encontro (en una corrida real el script se detendria aqui)'
} else {
    Write-Host ("mysqldump     : {0}" -f $rutaMysqldumpResuelta)
}

# ------------------------------------------------------------
# Registro de la tarea programada
# ------------------------------------------------------------
if ($RegistrarTarea) {
    Escribir-Paso "Tarea programada diaria a las $HoraTarea"

    # La ruta de mysqldump.exe viaja en la linea de comandos de la tarea:
    # es lo unico que garantiza que SYSTEM la encuentre sin depender del
    # PATH de maquina, que esta VM no tiene configurado con el "bin" de
    # MySQL.
    $rutaMysqldumpParaTarea = if ($null -eq $rutaMysqldumpResuelta) { '<ruta de mysqldump.exe>' } else { $rutaMysqldumpResuelta }

    $comando = ('-ExecutionPolicy Bypass -NoProfile -File "{0}" -RutaDatos "{1}" -BaseDatos "{2}" -UsuarioMysql "{3}" -ArchivoCredenciales "{4}" -RutaMysqldump "{5}"' -f $PSCommandPath, $RutaDatos, $BaseDatos, $UsuarioMysql, $ArchivoCredenciales, $rutaMysqldumpParaTarea)

    if ($Simular) {
        Write-Host '    [SIMULACION] crearia la tarea:' -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION]   Nombre  : {0}" -f $nombreTarea) -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION]   Diaria  : {0}" -f $HoraTarea) -ForegroundColor DarkGray
        Write-Host '    [SIMULACION]   Usuario : SYSTEM, con privilegios maximos' -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION]   Accion  : powershell.exe {0}" -f $comando) -ForegroundColor DarkGray
        Write-Host ("    [SIMULACION] y pediria la contrasena de {0} para guardarla en {1}" -f $UsuarioMysql, $ArchivoCredenciales) -ForegroundColor DarkGray
        Write-Host '    [SIMULACION] (permisos restringidos al usuario actual, Administradores y SYSTEM)' -ForegroundColor DarkGray
    } else {
        if (-not (Test-Path -LiteralPath $ArchivoCredenciales)) {
            Escribir-Detalle 'La tarea corre sin nadie delante, asi que necesita la contrasena guardada.'
            $segura = Read-Host -Prompt ("Contrasena de {0} en MySQL" -f $UsuarioMysql) -AsSecureString
            if ($segura.Length -eq 0) { throw 'La contrasena no puede estar vacia.' }
            Nuevo-ArchivoOpciones -Ruta $ArchivoCredenciales -Contrasena (Convertir-ASecreto -Segura $segura)
            Escribir-Detalle "Credenciales guardadas en $ArchivoCredenciales (solo el usuario actual, Administradores y SYSTEM)."
        } else {
            Escribir-Detalle "Se reutiliza el archivo de credenciales existente."
        }

        $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $comando

        # InvariantCulture y no $null: con $null se usa la cultura del
        # proceso, cuyo separador de hora no tiene por que ser ':'. En
        # es-CR lo es y la conversion funciona, pero la tarea se registra
        # una sola vez y en la unica VM que importa, asi que no conviene
        # que dependa de la configuracion regional de quien la registre.
        $horaConvertida = [datetime]::ParseExact($HoraTarea, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture)
        $disparador = New-ScheduledTaskTrigger -Daily -At $horaConvertida
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

# Se trabaja en "<marca>.parcial" y la carpeta se renombra al terminar.
# Antes se escribia directamente en "<marca>": si mysqldump fallaba, la
# carpeta quedaba igual, con un volcado a medias y un nombre que la
# rotacion cuenta como respaldo bueno, asi que unas cuantas noches
# fallidas seguidas desplazaban a los respaldos que si servian. El
# sufijo no casa con '^\d{8}-\d{6}$', de modo que la rotacion lo ignora
# y el resto queda a la vista para diagnosticar.
$destinoParcial = "$destino.parcial"

if ($Simular) {
    $rutaMysqldumpParaSimulacion = if ($null -eq $rutaMysqldumpResuelta) { '<ruta de mysqldump.exe>' } else { $rutaMysqldumpResuelta }

    Escribir-Paso 'Respaldo'
    Write-Host ("    [SIMULACION] crearia {0}" -f $destinoParcial) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION] y al terminar la renombraria a {0}" -f $destino) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION] `"{0}`" --single-transaction --default-character-set=utf8mb4" -f $rutaMysqldumpParaSimulacion) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION]   -> {0}\base-datos.sql.gz" -f $destino) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION] comprimiria {0}" -f $rutaDocumentos) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION]   -> {0}\documentos.zip" -f $destino) -ForegroundColor DarkGray
    Write-Host ("    [SIMULACION] borraria las carpetas de respaldo mas alla de las {0} mas recientes" -f $RespaldosAConservar) -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '[SIMULACION] Terminado sin cambios.' -ForegroundColor Green
    exit 0
}

try {
    # ----------------------------------------------------------
    # Credenciales
    # ----------------------------------------------------------
    if (Test-Path -LiteralPath $ArchivoCredenciales) {
        $opcionesEnUso = $ArchivoCredenciales
    } else {
        # Bajo la tarea programada no hay nadie delante: pedir la
        # contrasena ahi deja el proceso esperando una respuesta que
        # nunca llega hasta que vence el limite de dos horas de la
        # tarea, y el respaldo de esa noche se pierde sin un mensaje que
        # lo explique. Mejor cortar en el acto y decir que hacer.
        if ($sidUsuarioActual -eq 'S-1-5-18') {
            $aviso  = ("No existe el archivo de opciones {0} y este proceso corre como SYSTEM, sin nadie que pueda escribir la contrasena." -f $ArchivoCredenciales) + [Environment]::NewLine
            $aviso += '       Vuelva a crearlo desde una consola de administrador con:' + [Environment]::NewLine
            $aviso += '         powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1 -RegistrarTarea'
            throw $aviso
        }

        Escribir-Paso 'Credenciales'
        $segura = Read-Host -Prompt ("Contrasena de {0} en MySQL" -f $UsuarioMysql) -AsSecureString
        if ($segura.Length -eq 0) { throw 'La contrasena no puede estar vacia.' }
        $credencialesTemporales = Join-Path $env:TEMP ("munidata-respaldo-{0}.cnf" -f ([guid]::NewGuid().ToString('N')))
        Nuevo-ArchivoOpciones -Ruta $credencialesTemporales -Contrasena (Convertir-ASecreto -Segura $segura)
        $opcionesEnUso = $credencialesTemporales
    }

    $null = New-Item -ItemType Directory -Path $destinoParcial -Force

    # ----------------------------------------------------------
    # Base de datos
    # ----------------------------------------------------------
    Escribir-Paso 'Volcado de la base de datos'

    # --single-transaction toma una instantanea coherente sin bloquear las
    # tablas, asi que el sistema sigue funcionando durante el respaldo
    # (solo valido con InnoDB, que es el motor de todas las tablas).
    # --no-tablespaces y sin --events a proposito, no por descuido:
    #
    #   - mysqldump 8.0 consulta INFORMATION_SCHEMA.FILES, que exige el
    #     privilegio global PROCESS. Darselo al usuario de la aplicacion
    #     significaria dejarle ver las consultas de los otros sistemas
    #     que comparten este MySQL en la VM. --no-tablespaces se salta
    #     ese paso, que para tablas InnoDB en el espacio general no
    #     aporta nada al restaurar.
    #   - "show events" exige el privilegio EVENT sobre la base, que
    #     tampoco se concede. El esquema no define ningun evento.
    #
    # Con los privilegios que concede preparar-base-datos.ps1 (SELECT,
    # INSERT, UPDATE, DELETE) este volcado sale completo: tablas, datos y
    # rutinas. El esquema no tiene eventos ni disparadores; si algun dia
    # se agregan, habra que conceder EVENT y TRIGGER sobre la base y
    # volver a poner --events, porque si no el respaldo los omitiria en
    # silencio.
    #
    # Se invoca por ruta absoluta (ver Resolver-Mysqldump) y no por
    # nombre: la tarea programada corre como SYSTEM y no veria el PATH
    # del usuario que la registro.
    $archivoSql = Join-Path $destinoParcial 'base-datos.sql'
    Escribir-Detalle ("mysqldump: {0}" -f $rutaMysqldumpResuelta)
    & $rutaMysqldumpResuelta "--defaults-extra-file=$opcionesEnUso" '--single-transaction' '--default-character-set=utf8mb4' '--no-tablespaces' '--routines' $BaseDatos --result-file=$archivoSql
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
            # Compress-Archive de PowerShell 5.1 no escribe ZIP64, asi
            # que por encima de 2 GB de contenido falla. Se avisa antes
            # de intentarlo: si algun dia los PDF pasan de ese tamano, el
            # mensaje dice que mirar en vez de dejar un error de .NET sin
            # contexto en el registro de la tarea. No se usa 7-Zip ni
            # ninguna herramienta externa a proposito, para que el
            # respaldo no dependa de nada que haya que instalar aparte.
            $bytesDocumentos = ($archivos | Measure-Object -Property Length -Sum).Sum
            if ($bytesDocumentos -gt 2GB) {
                Write-Host ''
                Write-Host ("AVISO: los documentos ocupan {0} GB." -f [math]::Round($bytesDocumentos / 1GB, 2)) -ForegroundColor Yellow
                Write-Host '       Compress-Archive de PowerShell 5.1 no admite mas de 2 GB y es probable que falle.' -ForegroundColor Yellow
                Write-Host '       Si falla, respalde la carpeta con robocopy a otro disco en vez de comprimirla.' -ForegroundColor Yellow
            }

            $archivoZip = Join-Path $destinoParcial 'documentos.zip'
            Compress-Archive -Path (Join-Path $rutaDocumentos '*') -DestinationPath $archivoZip -CompressionLevel Optimal -Force
            $tamanoZip = [math]::Round((Get-Item -LiteralPath $archivoZip).Length / 1MB, 2)
            Escribir-Detalle ("{0} archivo(s), {1} MB -> {2}" -f $archivos.Count, $tamanoZip, $archivoZip)
        }
    }

    # ----------------------------------------------------------
    # El respaldo ya esta completo: ahora si lleva nombre de respaldo
    # ----------------------------------------------------------
    # El renombrado va antes de la rotacion a proposito, para que este
    # respaldo se cuente entre los que se conservan y no se borre uno
    # bueno de mas.
    Move-Item -LiteralPath $destinoParcial -Destination $destino
    $archivoGz = Join-Path $destino 'base-datos.sql.gz'

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
    if (Test-Path -LiteralPath $destinoParcial) {
        Write-Host ("       El respaldo quedo a medias en {0}" -f $destinoParcial) -ForegroundColor Yellow
        Write-Host '       Termina en ".parcial" a proposito: la rotacion no lo cuenta como respaldo,' -ForegroundColor Yellow
        Write-Host '       asi que no desplaza a los buenos. Reviselo y borrelo cuando ya no haga falta.' -ForegroundColor Yellow
    }
    exit 1
} finally {
    # Ese archivo tiene la contrasena de MySQL. Si el borrado no sale, hay
    # que decirlo: antes se descartaba el error en silencio y el archivo
    # podia quedarse en la carpeta temporal sin que nadie se enterara.
    if ($null -ne $credencialesTemporales -and (Test-Path -LiteralPath $credencialesTemporales)) {
        Remove-Item -LiteralPath $credencialesTemporales -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $credencialesTemporales) {
            Write-Host ''
            Write-Host 'AVISO: no se pudo borrar el archivo de credenciales temporal:' -ForegroundColor Yellow
            Write-Host ("       {0}" -f $credencialesTemporales) -ForegroundColor Yellow
            Write-Host '       Contiene la contrasena de MySQL. Borrelo a mano.' -ForegroundColor Yellow
        }
    }
}
