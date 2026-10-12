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
    [int]    $Puerto = 3100,
    [string] $RutaDatos = 'C:\munidata',
    [int]    $EspacioMinimoGb = 5,
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------
# Constantes
# ------------------------------------------------------------
# Version mayor de Node con la que se probo el sistema. No es un minimo:
# backend/package.json declara ">=22", asi que 24 tambien cumple. Se usa
# solo para avisar cuando la VM corre otra.
$VERSION_NODE_PROBADA = 22

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

function Buscar-FueraDelPath {
    <#
        Busca un ejecutable en rutas conocidas cuando no esta en el PATH.

        En esta VM eso es lo habitual: NSSM existe pero no esta en el
        PATH, y el cliente de MySQL vive bajo "C:\Program Files\MySQL\...".
        Devolver la ruta exacta ahorra tener que ir a buscarla a mano para
        pasarla por parametro.
    #>
    param([Parameter(Mandatory = $true)][string[]] $Patrones)

    foreach ($patron in $Patrones) {
        $encontrados = @(Get-Item -Path $patron -ErrorAction SilentlyContinue |
            Where-Object { -not $_.PSIsContainer } |
            Sort-Object -Property FullName -Descending)
        if ($encontrados.Count -gt 0) {
            return $encontrados[0].FullName
        }
    }
    return $null
}

function Buscar-NssmEnServicios {
    <#
        Deduce la ruta de nssm.exe a partir de los servicios que ya lo
        usan.

        Es el camino mas fiable en esta VM: los otros sistemas corren con
        NSSM, asi que su ruta esta registrada en el PathName de cada
        servicio, aunque nssm.exe no este en el PATH ni en una carpeta
        predecible.
    #>
    try {
        $servicios = @(Get-CimInstance -ClassName Win32_Service -ErrorAction Stop |
            Where-Object { $_.PathName -and $_.PathName -match 'nssm' })

        foreach ($servicio in $servicios) {
            # El PathName viene entrecomillado y con argumentos:
            #   "C:\herramientas\nssm.exe" ...
            $coincide = [regex]::Match($servicio.PathName, '"?([A-Za-z]:\\[^"]*?nssm\.exe)"?')
            if ($coincide.Success) {
                $ruta = $coincide.Groups[1].Value
                if (Test-Path -LiteralPath $ruta) {
                    return [pscustomobject]@{ Ruta = $ruta; Servicio = $servicio.Name }
                }
            }
        }
    } catch {
        return $null
    }
    return $null
}

function Normalizar-SalidaDeComando {
    <#
        Quita los caracteres nulos de la salida capturada de un programa
        externo.

        Hace falta porque un programa compilado como aplicacion Unicode
        (nssm.exe es el caso de esta VM) escribe UTF-16 en la salida
        estandar: en consola se ve bien, pero al capturarla en una
        variable PowerShell decodifica esos bytes de a uno y cada
        caracter llega seguido de un NUL, de modo que buscar cualquier
        texto en ella falla siempre. node, npm, git, mysql y httpd son
        aplicaciones ANSI y no tienen ese problema, pero normalizar aqui
        cuesta nada y evita que la comprobacion mienta si alguno de ellos
        cambia o se sustituye por un envoltorio.
    #>
    param([string] $Texto = '')

    if ([string]::IsNullOrEmpty($Texto)) { return '' }
    return $Texto.Replace([string][char]0, '')
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
        # Un comando que no imprime nada deja $salida en $null, y
        # ([string[]]$null)[0] no se puede indexar. Se normaliza a un
        # arreglo de cadenas: cada elemento se convierte con [string]
        # porque con 2>&1 pueden llegar ErrorRecord, que no tienen Trim().
        $lineas = @($salida | ForEach-Object { if ($null -eq $_) { '' } else { Normalizar-SalidaDeComando -Texto ([string] $_) } })
        if ($lineas.Count -eq 0) { return '' }
        return $lineas[0].Trim()
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
# 0. Sesion de administrador
# ------------------------------------------------------------
# No lo necesita este script, que solo lee, pero si desplegar.ps1: crea un
# servicio de Windows y escribe en HKLM. Mejor descubrirlo ahora que a
# mitad del despliegue.
$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Agregar-Resultado 'Sesion de administrador' 'OK' "Elevada ($($identidad.Name))."
} else {
    Agregar-Resultado 'Sesion de administrador' 'AVISO' "No elevada ($($identidad.Name)). desplegar.ps1 la necesita: abra PowerShell con 'Ejecutar como administrador'."
}

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

    # La version mayor se informa aparte. backend/package.json declara
    # ">=22", asi que 24 y 26 tambien valen; se avisa cuando no es 22
    # porque es la unica con la que se probo el sistema, no porque otra
    # vaya a fallar.
    if ($numero -ne 0 -and $numero -ne $VERSION_NODE_PROBADA) {
        Agregar-Resultado 'Version mayor de Node' 'AVISO' "Es $numero; el sistema se probo con $VERSION_NODE_PROBADA. package.json pide >=22, asi que $numero cumple, pero conviene saberlo si algo se comporta distinto."
    } elseif ($numero -ne 0) {
        Agregar-Resultado 'Version mayor de Node' 'OK' "$numero, la misma con la que se probo el sistema."
    }

    # El servicio de Windows corre como LocalSystem, que no tiene perfil
    # de usuario: un node.exe instalado bajo C:\Users\<alguien> puede
    # quedar inaccesible para el servicio, o desaparecer si se borra ese
    # perfil. El sintoma seria un servicio que no arranca con un error de
    # ruta, difícil de relacionar con la causa.
    if ($rutaNode -like 'C:\Users\*') {
        $aviso = "node.exe esta dentro de un perfil de usuario ($rutaNode). "
        $aviso += 'El servicio corre como LocalSystem y puede no tener acceso. '
        $aviso += 'Conviene instalar Node para todos los usuarios, por ejemplo en C:\Program Files\nodejs.'
        Agregar-Resultado 'Ubicacion de node.exe' 'AVISO' $aviso
    } else {
        Agregar-Resultado 'Ubicacion de node.exe' 'OK' "Fuera de un perfil de usuario: $rutaNode"
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
    # No esta en el PATH, lo habitual en esta VM. Se deduce de los
    # servicios que ya usan NSSM, que es donde su ruta queda registrada.
    $porServicio = Buscar-NssmEnServicios

    if ($null -eq $porServicio) {
        # Ultimo recurso: rutas donde suele copiarse a mano.
        $porRuta = Buscar-FueraDelPath -Patrones @(
            'C:\nssm\*\nssm.exe', 'C:\nssm\nssm.exe',
            'C:\herramientas\nssm.exe', 'C:\Tools\nssm.exe',
            'C:\Program Files\nssm\*\nssm.exe', 'C:\Program Files\nssm\nssm.exe'
        )
        if ($null -eq $porRuta) {
            $mensaje = 'No esta en el PATH, ningun servicio lo referencia y no aparece en las rutas habituales. '
            $mensaje += 'Localicelo con:  Get-ChildItem C:\ -Filter nssm.exe -Recurse -ErrorAction SilentlyContinue  '
            $mensaje += 'y pase la ruta con -RutaNssm. Si no esta instalado, descarguelo de https://nssm.cc/download'
            Agregar-Resultado 'NSSM' 'FALTA' $mensaje
        } else {
            Agregar-Resultado 'NSSM' 'OK' "Fuera del PATH, encontrado en $porRuta  ->  pase:  -RutaNssm `"$porRuta`""
        }
    } else {
        $detalle = "Fuera del PATH. El servicio '$($porServicio.Servicio)' lo usa desde $($porServicio.Ruta)"
        $detalle += "  ->  pase:  -RutaNssm `"$($porServicio.Ruta)`""
        Agregar-Resultado 'NSSM' 'OK' $detalle
    }
} else {
    Agregar-Resultado 'NSSM' 'OK' "En el PATH: $rutaNssmResuelta"
}

# ------------------------------------------------------------
# 5. Cliente de MySQL
# ------------------------------------------------------------
# En esta VM MySQL esta instalado como servicio pero su carpeta bin no
# esta en el PATH, asi que no basta con mirar el PATH: se busca tambien
# bajo "C:\Program Files\MySQL\*\bin". preparar-base-datos.ps1 y
# respaldar.ps1 si exigen que esten en el PATH, de modo que lo que importa
# es dejar escrita la carpeta exacta que hay que agregar.
$carpetasBinMysql = @()

foreach ($herramienta in @('mysql.exe', 'mysqldump.exe')) {
    $ruta = Buscar-Ejecutable -Nombre $herramienta

    if ($null -ne $ruta) {
        Agregar-Resultado $herramienta 'OK' "En el PATH: $ruta"
        continue
    }

    $fuera = Buscar-FueraDelPath -Patrones @(
        "C:\Program Files\MySQL\*\bin\$herramienta",
        "C:\Program Files (x86)\MySQL\*\bin\$herramienta",
        "C:\xampp\mysql\bin\$herramienta",
        "C:\MariaDB*\bin\$herramienta"
    )

    if ($null -eq $fuera) {
        $mensaje = 'No esta en el PATH ni en las rutas habituales. Localicelo con:  '
        $mensaje += "Get-ChildItem 'C:\Program Files' -Filter $herramienta -Recurse -ErrorAction SilentlyContinue"
        Agregar-Resultado $herramienta 'FALTA' $mensaje
    } else {
        $carpetaBin = Split-Path -Parent $fuera
        $carpetasBinMysql += $carpetaBin
        $mensaje = "Fuera del PATH, encontrado en $fuera. "
        $mensaje += 'preparar-base-datos.ps1 y respaldar.ps1 lo necesitan en el PATH.'
        Agregar-Resultado $herramienta 'AVISO' $mensaje
    }
}

if ($carpetasBinMysql.Count -gt 0) {
    $carpeta = ($carpetasBinMysql | Sort-Object -Unique)[0]
    $mensaje = "Agregue esta carpeta al PATH de la sesion antes de ejecutar los scripts de base de datos:  "
    $mensaje += "`$env:Path += ';$carpeta'"
    Agregar-Resultado 'PATH de MySQL' 'AVISO' $mensaje
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
        $salidaModulos = Normalizar-SalidaDeComando -Texto (& $rutaHttpdResuelta '-M' 2>&1 | Out-String)
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
