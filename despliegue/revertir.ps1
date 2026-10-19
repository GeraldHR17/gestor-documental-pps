<#
.SINOPSIS
    Restaura la version anterior del backend y del frontend.

.DESCRIPCION
    Deshace un despliegue que salio mal:

      1. Detiene el servicio.
      2. Restaura dist y package*.json del backend desde el respaldo.
      3. Reinstala las dependencias de produccion.
      4. Restaura la carpeta publicada del frontend.
      5. Arranca el servicio.
      6. Ejecuta verificar-despliegue.ps1.

    NO restaura la base de datos. Eso no se automatiza a proposito: una
    restauracion borra todo lo que se haya hecho despues del volcado, y
    esa decision no puede tomarla un script. Al terminar se imprime el
    comando exacto para hacerlo a mano.

    REQUIERE PERMISOS DE ADMINISTRADOR.

.PARAMETER RutaHtdocs
    Carpeta htdocs de Apache. Obligatoria.

.PARAMETER RutaDatos
    Carpeta raiz de datos del sistema.

.PARAMETER RutaPublicaFrontend
    Subcarpeta, dentro de htdocs, donde se publica el frontend.

.PARAMETER NombreServicio
    Nombre del servicio de Windows.

.PARAMETER Puerto
    Puerto local del backend.

.PARAMETER Respaldo
    Marca de tiempo del respaldo a restaurar (carpeta aaaammdd-hhmmss).
    Si se omite, se usa el mas reciente.

.PARAMETER UrlPublica
    URL publica para la verificacion final.

.PARAMETER RutaNssm
    Ruta a nssm.exe si no esta en el PATH.

.PARAMETER Simular
    Imprime lo que haria sin ejecutar nada.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\revertir.ps1 -RutaHtdocs "C:\Apache24\htdocs"
#>

[CmdletBinding()]
param(
    [string] $RutaHtdocs = '',
    [string] $RutaDatos = 'C:\munidata',
    [string] $RutaPublicaFrontend = 'munipalmares\wp-munidata',
    [string] $NombreServicio = 'MuniData-API',
    [int]    $Puerto = 3100,
    [string] $Respaldo = '',
    [string] $UrlPublica = '',
    [string] $RutaNssm = '',
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$raizRepositorio    = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$rutaDespliegue     = Join-Path $raizRepositorio 'despliegue'
$rutaRespaldos      = Join-Path $RutaDatos 'respaldos'
$rutaBackendDestino = Join-Path $RutaDatos 'backend'
$rutaConfig         = Join-Path $RutaDatos 'config'

function Escribir-Paso {
    param([Parameter(Mandatory = $true)][string] $Mensaje)
    Write-Host ''
    Write-Host "==> $Mensaje" -ForegroundColor Cyan
}

function Escribir-Detalle {
    param([Parameter(Mandatory = $true)][string] $Mensaje)
    Write-Host "    $Mensaje"
}

function Escribir-Simulado {
    param([Parameter(Mandatory = $true)][string] $Mensaje)
    Write-Host "    [SIMULACION] $Mensaje" -ForegroundColor DarkGray
}

# Archivo que marca una carpeta como publicada por este sistema. Sin el,
# este script se niega a borrar nada. Su gemelo esta en desplegar.ps1,
# que es quien lo escribe.
$NOMBRE_MARCADOR = '.munidata-despliegue'

function Confirmar-CarpetaDestinoPropia {
    <#
        Se niega a continuar si la carpeta de publicacion ya tiene
        contenido que este sistema no puso.

        Mismo motivo que en desplegar.ps1: en esta VM Apache sirve
        WordPress y otros sistemas desde el mismo htdocs, y una reversion
        apuntada a la carpeta equivocada la borraria entera. Solo se borra
        lo que lleva nuestro marcador; una carpeta inexistente o vacia
        tambien es segura, porque no hay nada que destruir.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [switch] $Simulacion
    )

    if (-not (Test-Path -LiteralPath $Ruta)) {
        Escribir-Detalle "No existe todavia; se creara: $Ruta"
        return
    }

    # -Force para contar tambien los archivos ocultos: una carpeta con
    # solo un .htaccess no esta vacia.
    $contenido = @(Get-ChildItem -LiteralPath $Ruta -Force -ErrorAction SilentlyContinue)
    if ($contenido.Count -eq 0) {
        Escribir-Detalle "Existe y esta vacia; se puede restaurar: $Ruta"
        return
    }

    if (Test-Path -LiteralPath (Join-Path $Ruta $NOMBRE_MARCADOR)) {
        Escribir-Detalle ("Publicada por este sistema ({0} elementos, marcador presente)." -f $contenido.Count)
        return
    }

    $mensaje = @"
La carpeta de destino ya tiene contenido y NO lleva el marcador de este sistema:

    $Ruta

Contiene $($contenido.Count) elemento(s) y no se encontro '$NOMBRE_MARCADOR'.
Eso significa que la publico algo que no es Muni Data, muy probablemente
WordPress u otro de los sistemas que conviven en este Apache.

No se toco nada.

Que hacer:
  - Compruebe que -RutaHtdocs y -RutaPublicaFrontend son los mismos
    valores que uso en desplegar.ps1.
  - Si esa carpeta de verdad es de Muni Data, revise su contenido y cree
    el marcador para autorizar el reemplazo:

        Set-Content -LiteralPath "$(Join-Path $Ruta $NOMBRE_MARCADOR)" -Value 'autorizado a mano'

    Despues vuelva a ejecutar este script.
"@

    if ($Simulacion) {
        Write-Host ''
        Write-Host $mensaje -ForegroundColor Yellow
        Write-Host '[SIMULACION] En una ejecucion real la reversion se detendria aqui.' -ForegroundColor Yellow
        return
    }

    throw $mensaje
}

function Mostrar-ColaDelLog {
    <#
        Muestra las ultimas lineas que el log recibio a partir de un
        desplazamiento en bytes, con los secretos tapados.

        Se abre con FileStream y comparticion ReadWrite|Delete, no con
        Get-Content, porque NSSM mantiene el archivo abierto para
        escritura: con una comparticion mas estricta la lectura fallaria
        justo cuando mas falta hace.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [long] $DesdeByte = 0,
        [int] $Lineas = 30
    )

    if (-not (Test-Path -LiteralPath $Ruta)) {
        Write-Host '    (el log no existe: el servicio no llego a escribir nada)' -ForegroundColor Yellow
        return
    }

    $texto = ''
    $rotado = $false
    try {
        $comparticion = ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
        $flujo = New-Object System.IO.FileStream($Ruta, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $comparticion)
        try {
            $inicio = $DesdeByte
            if ($flujo.Length -lt $DesdeByte) { $rotado = $true; $inicio = [long] 0 }
            $null = $flujo.Seek($inicio, [System.IO.SeekOrigin]::Begin)
            $lector = New-Object System.IO.StreamReader($flujo, [System.Text.Encoding]::UTF8, $false)
            try {
                $texto = $lector.ReadToEnd()
            } finally {
                $lector.Dispose()
            }
        } finally {
            $flujo.Dispose()
        }
    } catch {
        Write-Host ("    (no se pudo leer el log: {0})" -f $_.Exception.Message) -ForegroundColor Yellow
        return
    }

    if ($rotado) {
        Write-Host '    (el log roto o se vacio desde el arranque; se muestra desde el principio)' -ForegroundColor Yellow
    }

    $texto = [regex]::Replace(
        $texto,
        '(?i)((?:BD_CONTRASENA|SMTP_PASS|JWT_[A-Z_]*SECRET|password|contrasena)\s*[=:]\s*)\S+',
        '${1}***')

    $todas = @($texto -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
    if ($todas.Count -eq 0) {
        Write-Host '    (ni una linea nueva desde el arranque: lo que hay en el log es de antes)' -ForegroundColor Yellow
        return
    }

    $desde = 0
    if ($todas.Count -gt $Lineas) { $desde = $todas.Count - $Lineas }
    Write-Host ("    --- {0} (solo lo escrito en este intento) ---" -f $Ruta) -ForegroundColor Yellow
    foreach ($linea in $todas[$desde..($todas.Count - 1)]) {
        Write-Host ("    {0}" -f $linea)
    }
}

function Resolver-Ejecutable {
    param(
        [Parameter(Mandatory = $true)][string] $Nombre,
        [string] $RutaExplicita = ''
    )
    if ($RutaExplicita -ne '') {
        if (-not (Test-Path -LiteralPath $RutaExplicita)) { throw "No existe $RutaExplicita" }
        return (Resolve-Path -LiteralPath $RutaExplicita).Path
    }
    $comando = Get-Command -Name $Nombre -ErrorAction SilentlyContinue
    if ($null -eq $comando) {
        # Mismo caso que en desplegar.ps1: en esta VM nssm.exe esta
        # instalado pero fuera del PATH, asi que el mensaje tiene que
        # nombrar el parametro que existe para eso.
        if ($Nombre -eq 'nssm.exe') {
            $aviso = 'No se encontro nssm.exe en el PATH, pero puede estar instalado fuera de el.' + [Environment]::NewLine
            $aviso += '       Ejecute verificar-requisitos.ps1 para obtener la ruta y repita este' + [Environment]::NewLine
            $aviso += '       comando agregando:  -RutaNssm "C:\ruta\a\nssm.exe"'
            throw $aviso
        }
        throw "No se encontro $Nombre en el PATH."
    }
    return $comando.Source
}

Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - reversion a la version anterior'
Write-Host '============================================================'

if ($RutaHtdocs -eq '') {
    Write-Host ''
    Write-Host 'ERROR: falta -RutaHtdocs (la misma que uso en desplegar.ps1).' -ForegroundColor Red
    exit 1
}

$rutaFrontendDestino = Join-Path $RutaHtdocs $RutaPublicaFrontend

try {
    # --------------------------------------------------------
    # Eleccion del respaldo
    # --------------------------------------------------------
    Escribir-Paso 'Buscando el respaldo a restaurar'

    if (-not (Test-Path -LiteralPath $rutaRespaldos)) {
        throw "No existe la carpeta de respaldos $rutaRespaldos. No hay nada que restaurar."
    }

    $disponibles = @(Get-ChildItem -LiteralPath $rutaRespaldos -Directory |
        Where-Object { $_.Name -match '^\d{8}-\d{6}$' } |
        Sort-Object -Property Name -Descending)

    if ($disponibles.Count -eq 0) {
        throw "No hay ningun respaldo con formato aaaammdd-hhmmss en $rutaRespaldos"
    }

    Write-Host '    Respaldos disponibles (del mas reciente al mas antiguo):'
    foreach ($candidato in $disponibles) {
        $tieneBackend = Test-Path -LiteralPath (Join-Path $candidato.FullName 'backend\dist')
        $tieneFrontend = Test-Path -LiteralPath (Join-Path $candidato.FullName 'frontend\index.html')
        $contenido = @()
        if ($tieneBackend) { $contenido += 'backend' }
        if ($tieneFrontend) { $contenido += 'frontend' }
        if ($contenido.Count -eq 0) { $contenido += 'solo base de datos' }
        Write-Host ("      {0}   [{1}]" -f $candidato.Name, ($contenido -join ' + '))
    }

    if ($Respaldo -eq '') {
        # Se elige el mas reciente que de verdad contenga codigo: los
        # respaldos creados por respaldar.ps1 solo tienen base de datos y
        # documentos, y restaurar desde uno de esos no devolveria el
        # codigo anterior.
        $elegido = $disponibles | Where-Object {
            (Test-Path -LiteralPath (Join-Path $_.FullName 'backend\dist')) -or
            (Test-Path -LiteralPath (Join-Path $_.FullName 'frontend\index.html'))
        } | Select-Object -First 1

        if ($null -eq $elegido) {
            throw 'Ningun respaldo contiene codigo de backend ni de frontend. Solo hay respaldos de datos, que este script no restaura.'
        }
    } else {
        $elegido = $disponibles | Where-Object { $_.Name -eq $Respaldo } | Select-Object -First 1
        if ($null -eq $elegido) {
            throw "No existe el respaldo '$Respaldo'. Use una de las marcas listadas arriba."
        }
    }

    $rutaElegida = $elegido.FullName
    Write-Host ''
    Escribir-Detalle "Se restaurara: $($elegido.Name)"

    $origenBackend  = Join-Path $rutaElegida 'backend'
    $origenFrontend = Join-Path $rutaElegida 'frontend'
    $hayBackend  = Test-Path -LiteralPath (Join-Path $origenBackend 'dist')
    $hayFrontend = Test-Path -LiteralPath (Join-Path $origenFrontend 'index.html')

    if ($Simular) {
        Escribir-Paso 'Comprobando la carpeta de destino del frontend'
        Confirmar-CarpetaDestinoPropia -Ruta $rutaFrontendDestino -Simulacion

        Escribir-Paso 'Plan de reversion'
        Escribir-Simulado "detendria el servicio $NombreServicio y confirmaria con Get-Service que quedo detenido"
        Escribir-Simulado 'antes de tocar un solo archivo (si no se detiene, aborta sin restaurar nada)'
        if ($hayBackend) {
            Escribir-Simulado "reemplazaria $rutaBackendDestino\dist desde $origenBackend"
            Escribir-Simulado "ejecutaria npm ci --omit=dev en $rutaBackendDestino"
        } else {
            Escribir-Simulado 'este respaldo no trae backend; no se tocaria'
        }
        if ($hayFrontend) {
            Escribir-Simulado "reemplazaria $rutaFrontendDestino desde $origenFrontend, pero SOLO si lleva el marcador $NOMBRE_MARCADOR"
        } else {
            Escribir-Simulado 'este respaldo no trae frontend; no se tocaria'
        }
        Escribir-Simulado "arrancaria el servicio y esperaria hasta 60 s a que el puerto $Puerto escuche"
        Escribir-Simulado 'y si no escuchara, mostraria solo las lineas que api-error.log recibiera en ese intento'
        Escribir-Simulado 'despues ejecutaria verificar-despliegue.ps1'
        Escribir-Simulado 'NO restauraria la base de datos (se imprime el comando para hacerlo a mano)'
        Write-Host ''
        Write-Host '[SIMULACION] Terminado sin cambios.' -ForegroundColor Green
        exit 0
    }

    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Este script necesita permisos de administrador. Abra PowerShell como administrador.'
    }

    # Antes de detener el servicio o tocar un solo archivo: si la carpeta
    # de destino es de otro sistema, hay que abortar sin haber hecho nada.
    Escribir-Paso 'Comprobando la carpeta de destino del frontend'
    Confirmar-CarpetaDestinoPropia -Ruta $rutaFrontendDestino

    $rutaNpm = Resolver-Ejecutable -Nombre 'npm.cmd'
    $rutaNssmResuelta = Resolver-Ejecutable -Nombre 'nssm.exe' -RutaExplicita $RutaNssm

    # --------------------------------------------------------
    # Detener el servicio
    # --------------------------------------------------------
    Escribir-Paso 'Deteniendo el servicio'
    $servicio = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
    if ($null -eq $servicio) {
        Escribir-Detalle 'El servicio no existe; se continua con la restauracion de archivos.'
        # Se compara con 'Stopped' y no con 'Running': un servicio en
        # StartPending, StopPending o Paused TIENE proceso vivo con sus
        # archivos abiertos. Mirando solo 'Running' se saltaba la parada
        # en esos estados y se iba derecho a reemplazar dist con el
        # proceso en pie, que es el mismo fallo que se corrigio en
        # desplegar.ps1.
    } elseif ($servicio.Status -ne 'Stopped') {
        & $rutaNssmResuelta 'stop' $NombreServicio | Out-Null
        $codigoParada = $LASTEXITCODE

        # No basta con lanzar el comando: hay que confirmar con
        # Get-Service que el proceso solto los archivos. Si siguiera
        # corriendo, el Remove-Item del dist de abajo fallaria por
        # archivo en uso, y la reversion se quedaria a medias con el
        # backend antiguo ya borrado en parte.
        #
        # El estado se consulta con Get-Service y no con "nssm status":
        # nssm es una aplicacion Unicode y su salida, al capturarla,
        # llega con un NUL entre cada caracter, de modo que compararla
        # con 'SERVICE_STOPPED' no coincidiria nunca.
        $limiteParada = (Get-Date).AddSeconds(30)
        $detenido = $false
        while ((Get-Date) -lt $limiteParada) {
            $actual = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
            if ($null -eq $actual -or $actual.Status -eq 'Stopped') { $detenido = $true; break }
            Start-Sleep -Seconds 2
        }

        if (-not $detenido) {
            $estadoFinal = (Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue)
            $texto = 'desconocido'
            if ($null -ne $estadoFinal) { $texto = [string] $estadoFinal.Status }
            throw ("El servicio no se detuvo en 30 segundos (estado: {0}, nssm stop devolvio {1}). " -f $texto, $codigoParada) +
                  'No se restaura nada: con el proceso en pie, reemplazar dist dejaria la instalacion a medias. ' +
                  ("Detengalo a mano con: Stop-Service {0} -Force" -f $NombreServicio)
        }
        Escribir-Detalle 'Detenido y confirmado por Get-Service.'
    } else {
        Escribir-Detalle "Ya estaba detenido (estado: $($servicio.Status))."
    }

    # --------------------------------------------------------
    # Backend
    # --------------------------------------------------------
    Escribir-Paso 'Restaurando el backend'
    if (-not $hayBackend) {
        Escribir-Detalle 'Este respaldo no contiene backend; se deja el actual.'
    } else {
        $distDestino = Join-Path $rutaBackendDestino 'dist'
        if (Test-Path -LiteralPath $distDestino) {
            Remove-Item -LiteralPath $distDestino -Recurse -Force
        }
        Copy-Item -LiteralPath (Join-Path $origenBackend 'dist') -Destination $rutaBackendDestino -Recurse -Force
        foreach ($archivo in @('package.json', 'package-lock.json')) {
            $origen = Join-Path $origenBackend $archivo
            if (Test-Path -LiteralPath $origen) {
                Copy-Item -LiteralPath $origen -Destination $rutaBackendDestino -Force
            }
        }
        Escribir-Detalle 'dist y package*.json restaurados.'

        # Se reinstalan porque el package-lock.json restaurado puede
        # declarar versiones distintas de las que quedaron instaladas.
        Escribir-Detalle 'Reinstalando dependencias de produccion...'
        $anterior = (Get-Location).Path
        try {
            Set-Location -LiteralPath $rutaBackendDestino
            & $rutaNpm 'ci' '--omit=dev'
            if ($LASTEXITCODE -ne 0) { throw "npm ci --omit=dev fallo (codigo $LASTEXITCODE)" }
        } finally {
            Set-Location -LiteralPath $anterior
        }
        Escribir-Detalle 'Dependencias reinstaladas.'
    }

    # --------------------------------------------------------
    # Frontend
    # --------------------------------------------------------
    Escribir-Paso 'Restaurando el frontend'
    if (-not $hayFrontend) {
        Escribir-Detalle 'Este respaldo no contiene frontend; se deja el actual.'
    } else {
        if (-not (Test-Path -LiteralPath $rutaFrontendDestino)) {
            $null = New-Item -ItemType Directory -Path $rutaFrontendDestino -Force
            Escribir-Detalle 'Carpeta de destino creada.'
        } elseif (Test-Path -LiteralPath (Join-Path $rutaFrontendDestino $NOMBRE_MARCADOR)) {
            # Solo se llega aqui con el marcador presente. La comprobacion
            # del inicio ya aborto en cualquier otro caso; esta segunda
            # condicion es la red de seguridad para que un cambio futuro
            # en el orden de los pasos no reintroduzca un borrado a
            # ciegas.
            Get-ChildItem -LiteralPath $rutaFrontendDestino -Force | Remove-Item -Recurse -Force
            Escribir-Detalle 'Contenido anterior de Muni Data eliminado (marcador presente).'
        } else {
            Escribir-Detalle 'Carpeta de destino vacia; se restaura directamente.'
        }

        Copy-Item -Path (Join-Path $origenFrontend '*') -Destination $rutaFrontendDestino -Recurse -Force
        # El comodin omite los archivos que empiezan por punto.
        foreach ($oculto in @('.htaccess', $NOMBRE_MARCADOR)) {
            $origen = Join-Path $origenFrontend $oculto
            if (Test-Path -LiteralPath $origen) {
                Copy-Item -LiteralPath $origen -Destination $rutaFrontendDestino -Force
            }
        }

        # Si el respaldo no traia marcador (por ser anterior a esta
        # proteccion), se escribe ahora: la carpeta acaba de quedar con
        # contenido nuestro, y sin el la siguiente ejecucion abortaria.
        if (-not (Test-Path -LiteralPath (Join-Path $rutaFrontendDestino $NOMBRE_MARCADOR))) {
            Set-Content -LiteralPath (Join-Path $rutaFrontendDestino $NOMBRE_MARCADOR) `
                -Value ("Carpeta restaurada por despliegue/revertir.ps1 el {0}." -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) `
                -Encoding UTF8
            Escribir-Detalle "Marcador $NOMBRE_MARCADOR escrito."
        }

        Escribir-Detalle "Restaurado en $rutaFrontendDestino"
    }

    # --------------------------------------------------------
    # Arrancar
    # --------------------------------------------------------
    Escribir-Paso 'Arrancando el servicio'
    if ($null -ne (Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue)) {
        # Se anota el tamano del log antes de arrancar para poder mostrar
        # despues solo lo que escriba este intento: api-error.log es
        # acumulativo y conserva los errores que llevaron a revertir,
        # que son justo los que no hay que volver a leer aqui.
        $archivoLogError = Join-Path $RutaDatos 'registros\api-error.log'
        $tamanoLogPrevio = [long] 0
        if (Test-Path -LiteralPath $archivoLogError) {
            try { $tamanoLogPrevio = [long] (Get-Item -LiteralPath $archivoLogError -Force).Length } catch { $tamanoLogPrevio = [long] 0 }
        }
        $instanteArranque = Get-Date

        & $rutaNssmResuelta 'start' $NombreServicio | Out-Null
        $codigoArranque = $LASTEXITCODE
        if ($codigoArranque -ne 0) {
            Write-Host ("    AVISO: nssm start devolvio {0}." -f $codigoArranque) -ForegroundColor Yellow
        }

        # Se acepta 0.0.0.0 ademas de 127.0.0.1 porque un socket en
        # 0.0.0.0 tambien atiende el loopback; que escuche SOLO en
        # loopback lo juzga verificar-despliegue.ps1.
        $limite = (Get-Date).AddSeconds(60)
        $escuchando = $false
        $direcciones = @()
        while ($true) {
            $conexiones = @(Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue)
            if ($conexiones.Count -gt 0) {
                $direcciones = @($conexiones | ForEach-Object { [string] $_.LocalAddress } | Sort-Object -Unique)
                $utiles = @($direcciones | Where-Object { $_ -eq '127.0.0.1' -or $_ -eq '0.0.0.0' -or $_ -eq '::' -or $_ -eq '::1' })
                if ($utiles.Count -gt 0) { $escuchando = $true; break }
            }
            if ((Get-Date) -ge $limite) { break }
            Start-Sleep -Seconds 2
        }

        if ($escuchando) {
            Escribir-Detalle ("Escuchando en el puerto {0} ({1})." -f $Puerto, ($direcciones -join ', '))
        } else {
            Write-Host ''
            Write-Host "    El servicio no empezo a escuchar en 60 segundos." -ForegroundColor Red
            Write-Host ("    Arranque solicitado a las {0}; lo que sigue es posterior a esa hora." -f $instanteArranque.ToString('HH:mm:ss')) -ForegroundColor Red
            $estadoAhora = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
            if ($null -ne $estadoAhora) {
                Write-Host ("    Estado del servicio: {0}" -f $estadoAhora.Status) -ForegroundColor Red
            }
            Mostrar-ColaDelLog -Ruta $archivoLogError -DesdeByte $tamanoLogPrevio -Lineas 30
            Write-Host ("    Log completo en: {0}" -f $archivoLogError) -ForegroundColor Red
        }
    } else {
        Escribir-Detalle 'No hay servicio que arrancar.'
    }

    # --------------------------------------------------------
    # Verificacion
    # --------------------------------------------------------
    Escribir-Paso 'Verificacion'
    $scriptVerificacion = Join-Path $rutaDespliegue 'verificar-despliegue.ps1'
    $argumentos = @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', $scriptVerificacion, '-Puerto', $Puerto, '-NombreServicio', $NombreServicio, '-RutaDatos', $RutaDatos)
    if ($UrlPublica -ne '') {
        $argumentos += @('-UrlPublica', $UrlPublica)
    }
    & powershell.exe @argumentos
    $codigoVerificacion = $LASTEXITCODE

    # --------------------------------------------------------
    # Base de datos
    # --------------------------------------------------------
    Write-Host ''
    Write-Host '------------------------------------------------------------' -ForegroundColor Yellow
    Write-Host ' BASE DE DATOS: NO se restauro' -ForegroundColor Yellow
    Write-Host '------------------------------------------------------------' -ForegroundColor Yellow
    Write-Host ' Este script restaura solo el codigo. La base de datos sigue' -ForegroundColor Yellow
    Write-Host ' como estaba, lo que casi siempre es lo correcto: los documentos' -ForegroundColor Yellow
    Write-Host ' y la bitactora posteriores al despliegue no se pierden.' -ForegroundColor Yellow
    Write-Host '' -ForegroundColor Yellow
    Write-Host ' Si el problema fue un cambio de esquema y hay que volver atras' -ForegroundColor Yellow
    Write-Host ' tambien la base, hagalo a mano.' -ForegroundColor Yellow
    Write-Host '' -ForegroundColor Yellow
    Write-Host ' ADVERTENCIA: restaurar la base DESTRUYE todo lo registrado' -ForegroundColor Red
    Write-Host ' despues de la fecha del volcado: documentos, versiones, usuarios' -ForegroundColor Red
    Write-Host ' y bitacora. No hay forma de recuperarlo luego.' -ForegroundColor Red
    Write-Host '' -ForegroundColor Yellow

    $volcados = @(Get-ChildItem -LiteralPath $rutaRespaldos -Recurse -Filter 'base-datos.sql.gz' -ErrorAction SilentlyContinue |
        Sort-Object -Property FullName -Descending)

    if ($volcados.Count -eq 0) {
        Write-Host ' No se encontro ningun base-datos.sql.gz en los respaldos.' -ForegroundColor Yellow
        Write-Host ' Busque tambien los volcados que dejo preparar-base-datos.ps1' -ForegroundColor Yellow
        Write-Host (' en {0} (archivos previo-a-scripts-*.sql).' -f $rutaRespaldos) -ForegroundColor Yellow
    } else {
        $ultimo = $volcados[0].FullName
        Write-Host (' Ultimo volcado disponible: {0}' -f $ultimo) -ForegroundColor Yellow
        Write-Host '' -ForegroundColor Yellow
        Write-Host ' Comandos exactos:' -ForegroundColor Yellow
        Write-Host ('   cd "{0}"' -f (Split-Path -Parent $ultimo)) -ForegroundColor Yellow
        Write-Host ("   node -e `"const z=require('zlib'),f=require('fs');f.writeFileSync('restaurar.sql',z.gunzipSync(f.readFileSync('base-datos.sql.gz')))`"") -ForegroundColor Yellow
        Write-Host ('   mysql --defaults-extra-file="{0}\mysql-respaldo.cnf" munidata < restaurar.sql' -f $rutaConfig) -ForegroundColor Yellow
        Write-Host '   del restaurar.sql' -ForegroundColor Yellow
        Write-Host '' -ForegroundColor Yellow
        Write-Host ' Si no existe ese archivo de credenciales, use:' -ForegroundColor Yellow
        Write-Host '   mysql -u munidata_app -p munidata < restaurar.sql' -ForegroundColor Yellow
    }
    Write-Host '------------------------------------------------------------' -ForegroundColor Yellow

    Write-Host ''
    if ($codigoVerificacion -eq 0) {
        Write-Host ("Reversion completada al respaldo {0}." -f $elegido.Name) -ForegroundColor Green
        exit 0
    }
    Write-Host ("Reversion aplicada al respaldo {0}, pero la verificacion encontro problemas." -f $elegido.Name) -ForegroundColor Yellow
    exit 1

} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
