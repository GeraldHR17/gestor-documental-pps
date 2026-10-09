<#
.SINOPSIS
    Comprueba que la VM tiene todo lo necesario para desplegar Muni Data.

.DESCRIPCION
    No instala ni modifica nada: solo informa. Esta pensado para
    ejecutarse ANTES de cualquier otro script del despliegue, de modo que
    las carencias se descubran con tiempo y no a mitad de la instalacion.

    Cada comprobacion se informa como OK, AVISO o FALTA. El script
    termina con codigo 1 si hay algun FALTA.

.PARAMETER RutaNssm
    Ruta completa a nssm.exe si no esta en el PATH.

.PARAMETER RutaHttpd
    Ruta completa a httpd.exe. Si se indica, se comprueban los modulos de
    Apache necesarios.

.PARAMETER Puerto
    Puerto que usara el backend. Se comprueba que este libre.

.PARAMETER RutaDatos
    Carpeta raiz de datos en la VM. Se comprueba el espacio en su unidad.

.PARAMETER Simular
    Imprime lo que haria sin ejecutar nada.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-requisitos.ps1

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-requisitos.ps1 -RutaHttpd "C:\Apache24\bin\httpd.exe"
#>

[CmdletBinding()]
param(
    [string] $RutaNssm = '',
    [string] $RutaHttpd = '',
    [int]    $Puerto = 3000,
    [string] $RutaDatos = 'C:\munidata',
    [int]    $EspacioMinimoGb = 5,
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------
# Resultados
# ------------------------------------------------------------
$resultados = New-Object System.Collections.ArrayList

function Agregar-Resultado {
    param(
        [Parameter(Mandatory = $true)][string] $Requisito,
        [Parameter(Mandatory = $true)][ValidateSet('OK', 'AVISO', 'FALTA')][string] $Estado,
        [string] $Detalle = ''
    )
    $null = $resultados.Add([pscustomobject]@{
        Requisito = $Requisito
        Estado    = $Estado
        Detalle   = $Detalle
    })
}

function Buscar-Ejecutable {
    <#
        Devuelve la ruta del ejecutable, o $null. Se prueba primero la
        ruta explicita que haya pasado el usuario y despues el PATH,
        porque en esta VM varias herramientas estan instaladas sin
        agregarse al PATH.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Nombre,
        [string] $RutaExplicita = ''
    )

    if ($RutaExplicita -ne '') {
        if (Test-Path -LiteralPath $RutaExplicita) {
            return (Resolve-Path -LiteralPath $RutaExplicita).Path
        }
        return $null
    }

    $comando = Get-Command -Name $Nombre -ErrorAction SilentlyContinue
    if ($null -ne $comando) {
        return $comando.Source
    }
    return $null
}

function Obtener-Version {
    <#
        Ejecuta el comando y devuelve su primera linea de salida. Se
        envuelve en try/catch porque un ejecutable presente pero roto
        debe reportarse como AVISO, no tumbar el script.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [string[]] $Argumentos = @('--version')
    )
    try {
        $salida = & $Ruta @Argumentos 2>&1
        if ($null -eq $salida) { return '' }
        return ([string[]]$salida)[0].Trim()
    } catch {
        return ''
    }
}

Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - verificacion de requisitos de la VM'
Write-Host '============================================================'
if ($Simular) {
    Write-Host '[SIMULACION] Este script solo lee informacion del sistema;'
    Write-Host '[SIMULACION] no modifica nada ni en modo normal. Se ejecuta igual.'
}
Write-Host ''

# ------------------------------------------------------------
# 1. Node.js
# ------------------------------------------------------------
$rutaNode = Buscar-Ejecutable -Nombre 'node.exe'
if ($null -eq $rutaNode) {
    Agregar-Resultado 'Node.js' 'FALTA' 'Instale la version LTS desde https://nodejs.org/es (instalador MSI de 64 bits).'
} else {
    $version = Obtener-Version -Ruta $rutaNode
    # Se exige 20 o superior: NestJS 11 y Vite 8 no soportan versiones
    # anteriores, y el backend se compila con el mismo Node que lo ejecuta.
    $numero = 0
    if ($version -match 'v(\d+)\.') { $numero = [int]$Matches[1] }

    if ($numero -ge 20) {
        Agregar-Resultado 'Node.js' 'OK' "$version en $rutaNode"
    } elseif ($numero -gt 0) {
        Agregar-Resultado 'Node.js' 'FALTA' "$version es demasiado antigua; se requiere 20 LTS o superior."
    } else {
        Agregar-Resultado 'Node.js' 'AVISO' "Presente en $rutaNode pero no se pudo leer la version."
    }
}

# ------------------------------------------------------------
# 2. npm
# ------------------------------------------------------------
$rutaNpm = Buscar-Ejecutable -Nombre 'npm.cmd'
if ($null -eq $rutaNpm) {
    $rutaNpm = Buscar-Ejecutable -Nombre 'npm'
}
if ($null -eq $rutaNpm) {
    Agregar-Resultado 'npm' 'FALTA' 'Viene con Node.js; reinstale Node.js.'
} else {
    Agregar-Resultado 'npm' 'OK' (Obtener-Version -Ruta $rutaNpm)
}

# ------------------------------------------------------------
# 3. Git
# ------------------------------------------------------------
$rutaGit = Buscar-Ejecutable -Nombre 'git.exe'
if ($null -eq $rutaGit) {
    Agregar-Resultado 'Git' 'FALTA' 'Instale Git para Windows desde https://git-scm.com/download/win'
} else {
    Agregar-Resultado 'Git' 'OK' (Obtener-Version -Ruta $rutaGit)
}

# ------------------------------------------------------------
# 4. NSSM
# ------------------------------------------------------------
$rutaNssmResuelta = Buscar-Ejecutable -Nombre 'nssm.exe' -RutaExplicita $RutaNssm
if ($null -eq $rutaNssmResuelta) {
    $mensaje = 'Descargue nssm desde https://nssm.cc/download, copie nssm.exe (carpeta win64) '
    $mensaje += 'a una ruta estable y pase -RutaNssm, o agreguela al PATH.'
    Agregar-Resultado 'NSSM' 'FALTA' $mensaje
} else {
    Agregar-Resultado 'NSSM' 'OK' $rutaNssmResuelta
}

# ------------------------------------------------------------
# 5. Cliente de MySQL
# ------------------------------------------------------------
foreach ($herramienta in @('mysql.exe', 'mysqldump.exe')) {
    $ruta = Buscar-Ejecutable -Nombre $herramienta
    if ($null -eq $ruta) {
        $mensaje = "No esta en el PATH. Suele estar en C:\Program Files\MySQL\MySQL Server 8.0\bin. "
        $mensaje += 'Agregue esa carpeta al PATH del sistema.'
        Agregar-Resultado $herramienta 'FALTA' $mensaje
    } else {
        Agregar-Resultado $herramienta 'OK' $ruta
    }
}

# ------------------------------------------------------------
# 6. Servicio de MySQL
# ------------------------------------------------------------
# El nombre del servicio varia segun como se instalo (MySQL80, MySQL,
# MariaDB...), asi que se busca por patron en vez de por nombre exacto.
$serviciosMysql = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'mysql|mariadb' })
if ($serviciosMysql.Count -eq 0) {
    Agregar-Resultado 'Servicio MySQL' 'FALTA' 'No se encontro ningun servicio de MySQL o MariaDB instalado.'
} else {
    $enEjecucion = @($serviciosMysql | Where-Object { $_.Status -eq 'Running' })
    if ($enEjecucion.Count -gt 0) {
        $nombres = ($enEjecucion | ForEach-Object { $_.Name }) -join ', '
        Agregar-Resultado 'Servicio MySQL' 'OK' "En ejecucion: $nombres"
    } else {
        $nombres = ($serviciosMysql | ForEach-Object { "$($_.Name) ($($_.Status))" }) -join ', '
        Agregar-Resultado 'Servicio MySQL' 'FALTA' "Instalado pero detenido: $nombres. Inicielo con: Start-Service <nombre>"
    }
}

# ------------------------------------------------------------
# 7. Modulos de Apache
# ------------------------------------------------------------
$modulosRequeridos = @('proxy_module', 'proxy_http_module', 'headers_module', 'rewrite_module')
$rutaHttpdResuelta = Buscar-Ejecutable -Nombre 'httpd.exe' -RutaExplicita $RutaHttpd

if ($null -eq $rutaHttpdResuelta) {
    $mensaje = 'No se indico -RutaHttpd y httpd.exe no esta en el PATH. Compruebe los modulos a mano con: '
    $mensaje += 'httpd -M  (deben aparecer ' + ($modulosRequeridos -join ', ') + ')'
    Agregar-Resultado 'Modulos de Apache' 'AVISO' $mensaje
} else {
    try {
        $salidaModulos = & $rutaHttpdResuelta '-M' 2>&1 | Out-String
        $faltantes = @()
        foreach ($modulo in $modulosRequeridos) {
            if ($salidaModulos -notmatch [regex]::Escape($modulo)) {
                $faltantes += $modulo
            }
        }
        if ($faltantes.Count -eq 0) {
            Agregar-Resultado 'Modulos de Apache' 'OK' ('Activos: ' + ($modulosRequeridos -join ', '))
        } else {
            $mensaje = 'Faltan: ' + ($faltantes -join ', ') + '. Descomente las lineas LoadModule correspondientes '
            $mensaje += 'en httpd.conf y valide con: httpd -t'
            Agregar-Resultado 'Modulos de Apache' 'FALTA' $mensaje
        }
    } catch {
        Agregar-Resultado 'Modulos de Apache' 'AVISO' "No se pudo ejecutar httpd -M: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------
# 8. Puerto libre
# ------------------------------------------------------------
# Se mira si algo escucha ya en ese puerto. Si el servicio MuniData-API ya
# existe y esta corriendo, lo esperable es que el puerto este ocupado por
# el, lo que no es un problema sino un redespliegue.
$ocupado = $null
try {
    $ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
} catch {
    $ocupado = $null
}

if ($null -eq $ocupado) {
    Agregar-Resultado "Puerto $Puerto" 'OK' 'Libre.'
} else {
    $pids = @($ocupado | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
    $descripcion = @()
    foreach ($identificador in $pids) {
        $proceso = Get-Process -Id $identificador -ErrorAction SilentlyContinue
        if ($null -ne $proceso) {
            $descripcion += "$($proceso.ProcessName) (PID $identificador)"
        } else {
            $descripcion += "PID $identificador"
        }
    }
    $servicioExistente = Get-Service -Name 'MuniData-API' -ErrorAction SilentlyContinue
    if ($null -ne $servicioExistente -and $servicioExistente.Status -eq 'Running') {
        Agregar-Resultado "Puerto $Puerto" 'OK' ('Ocupado por el propio servicio MuniData-API: ' + ($descripcion -join ', '))
    } else {
        $mensaje = 'Ocupado por ' + ($descripcion -join ', ') + '. Detenga ese proceso o use otro puerto '
        $mensaje += '(parametro -Puerto, y ajuste PUERTO en .env.produccion y el ProxyPass de Apache).'
        Agregar-Resultado "Puerto $Puerto" 'FALTA' $mensaje
    }
}

# ------------------------------------------------------------
# 9. Espacio en disco
# ------------------------------------------------------------
try {
    $unidad = (Split-Path -Qualifier $RutaDatos).TrimEnd(':')
    $volumen = Get-PSDrive -Name $unidad -ErrorAction Stop
    $libresGb = [math]::Round($volumen.Free / 1GB, 1)
    if ($libresGb -ge $EspacioMinimoGb) {
        Agregar-Resultado "Espacio en ${unidad}:" 'OK' "$libresGb GB libres."
    } else {
        Agregar-Resultado "Espacio en ${unidad}:" 'FALTA' "Solo $libresGb GB libres; se recomiendan al menos $EspacioMinimoGb GB para el codigo, los PDF y los respaldos."
    }
} catch {
    Agregar-Resultado 'Espacio en disco' 'AVISO' "No se pudo determinar el espacio de $RutaDatos : $($_.Exception.Message)"
}

# ------------------------------------------------------------
# 10. Conectividad de salida
# ------------------------------------------------------------
$destinos = @(
    [pscustomobject]@{ Nombre = 'smtp.gmail.com:587'; Host = 'smtp.gmail.com'; Puerto = 587; Motivo = 'envio de correos (recuperacion de contrasena)' },
    [pscustomobject]@{ Nombre = 'registry.npmjs.org:443'; Host = 'registry.npmjs.org'; Puerto = 443; Motivo = 'instalacion de dependencias con npm ci' }
)

foreach ($destino in $destinos) {
    try {
        $prueba = Test-NetConnection -ComputerName $destino.Host -Port $destino.Puerto -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($prueba) {
            Agregar-Resultado "Salida a $($destino.Nombre)" 'OK' $destino.Motivo
        } else {
            Agregar-Resultado "Salida a $($destino.Nombre)" 'FALTA' "Bloqueado. Necesario para $($destino.Motivo). Revise el firewall de salida."
        }
    } catch {
        # Test-NetConnection no existe como tal en todas las versiones;
        # el nombre real del cmdlet es Test-NetConnection en Windows 8+,
        # pero si fallara se informa sin romper el script.
        Agregar-Resultado "Salida a $($destino.Nombre)" 'AVISO' "No se pudo comprobar: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------
# Informe
# ------------------------------------------------------------
Write-Host ''
$resultados | Format-Table -AutoSize -Property Estado, Requisito, Detalle | Out-String -Width 200 | Write-Host

$faltas = @($resultados | Where-Object { $_.Estado -eq 'FALTA' })
$avisos = @($resultados | Where-Object { $_.Estado -eq 'AVISO' })

Write-Host '------------------------------------------------------------'
Write-Host ("Comprobaciones: {0} total, {1} con problema, {2} con aviso." -f $resultados.Count, $faltas.Count, $avisos.Count)

if ($faltas.Count -gt 0) {
    Write-Host ''
    Write-Host 'NO se puede desplegar todavia. Resuelva primero:' -ForegroundColor Red
    foreach ($falta in $faltas) {
        Write-Host (" - {0}: {1}" -f $falta.Requisito, $falta.Detalle) -ForegroundColor Red
    }
    exit 1
}

if ($avisos.Count -gt 0) {
    Write-Host ''
    Write-Host 'Requisitos cubiertos, con comprobaciones que quedaron pendientes de verificar a mano:' -ForegroundColor Yellow
    foreach ($aviso in $avisos) {
        Write-Host (" - {0}: {1}" -f $aviso.Requisito, $aviso.Detalle) -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host 'Todo listo para continuar con preparar-base-datos.ps1.' -ForegroundColor Green
exit 0
