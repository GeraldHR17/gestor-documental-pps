<#
.SINOPSIS
    Despliega Muni Data en la VM: compila, publica, registra el servicio y
    verifica.

.DESCRIPCION
    Pasos, en orden:

      1. Prepara C:\munidata\config\.env.produccion. Si no existe, lo crea
         desde la plantilla generando los secretos JWT y se detiene para
         que usted complete BD_* y SMTP_*.
      2. Valida que no queden valores CAMBIEME sin reemplazar.
      3. Respalda el backend y el frontend publicados actualmente.
      4. Compila el backend y lo copia a C:\munidata\backend, instalando
         alli solo las dependencias de produccion.
      5. Compila el frontend y lo publica en la carpeta de Apache.
      6. Registra o actualiza el servicio de Windows con NSSM.
      7. Escribe las variables de entorno del servicio en el registro y
         comprueba, releyendolo, que quedaron todas con su valor exacto.
      8. Arranca o reinicia el servicio y espera a que el puerto escuche.
         Si no escucha, muestra el estado, los reinicios y la cola de los
         log de este intento, y termina con error.
      9. Ejecuta verificar-despliegue.ps1.

    Se puede volver a ejecutar para actualizar: los pasos son
    idempotentes y siempre se respalda antes de reemplazar.

    REQUIERE PERMISOS DE ADMINISTRADOR (crea un servicio de Windows y
    escribe en HKLM).

.PARAMETER RutaHtdocs
    Carpeta htdocs de Apache. Obligatoria, y sin valor por defecto a
    proposito: publicar en la carpeta equivocada sobreescribiria otro
    sistema. En esta VM es C:\Apache24\htdocs.

.PARAMETER RutaDatos
    Carpeta raiz de datos del sistema en la VM.

.PARAMETER RutaPublicaFrontend
    Subcarpeta, dentro de htdocs, donde se publica el frontend.

.PARAMETER NombreServicio
    Nombre del servicio de Windows.

.PARAMETER Puerto
    Puerto local del backend.

.PARAMETER RutaNssm
    Ruta a nssm.exe si no esta en el PATH.

.PARAMETER OmitirVerificacion
    No ejecutar verificar-despliegue.ps1 al terminar.

.PARAMETER Simular
    Imprime lo que haria sin ejecutar nada.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs" -Simular

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\desplegar.ps1 -RutaHtdocs "C:\Apache24\htdocs"
#>

[CmdletBinding()]
param(
    [string] $RutaHtdocs = '',
    [string] $RutaDatos = 'C:\munidata',
    [string] $RutaPublicaFrontend = 'munipalmares\wp-munidata',
    [string] $NombreServicio = 'MuniData-API',
    [int]    $Puerto = 3100,
    [string] $RutaNssm = '',
    [switch] $OmitirVerificacion,
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------
# Rutas derivadas
# ------------------------------------------------------------
$raizRepositorio   = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$rutaDespliegue    = Join-Path $raizRepositorio 'despliegue'
$rutaBackendRepo   = Join-Path $raizRepositorio 'backend'
$rutaFrontendRepo  = Join-Path $raizRepositorio 'frontend'

$rutaConfig        = Join-Path $RutaDatos 'config'
$archivoEntorno    = Join-Path $rutaConfig '.env.produccion'
$plantillaEntorno  = Join-Path $rutaDespliegue '.env.produccion.ejemplo'
$rutaBackendDestino = Join-Path $RutaDatos 'backend'
$rutaAlmacenamiento = Join-Path $RutaDatos 'storage\documentos'
$rutaRespaldos     = Join-Path $RutaDatos 'respaldos'
$rutaRegistros     = Join-Path $RutaDatos 'registros'

$marcaTiempo       = Get-Date -Format 'yyyyMMdd-HHmmss'
$rutaRespaldoActual = Join-Path $rutaRespaldos $marcaTiempo

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

function Escribir-Simulado {
    param([Parameter(Mandatory = $true)][string] $Mensaje)
    Write-Host "    [SIMULACION] $Mensaje" -ForegroundColor DarkGray
}

function Confirmar-Administrador {
    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolver-Ejecutable {
    <#
        En modo simulacion una herramienta ausente no detiene el script:
        se devuelve un marcador y se sigue, para que se pueda revisar el
        plan completo desde una maquina que todavia no tiene NSSM o MySQL
        instalados. En una ejecucion real, en cambio, falta es falta.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Nombre,
        [string] $RutaExplicita = '',
        [switch] $ToleranteEnSimulacion
    )

    if ($RutaExplicita -ne '') {
        if (Test-Path -LiteralPath $RutaExplicita) {
            return (Resolve-Path -LiteralPath $RutaExplicita).Path
        }
        if ($ToleranteEnSimulacion) {
            return "(no encontrado: $RutaExplicita)"
        }
        throw "No existe $RutaExplicita"
    }

    $comando = Get-Command -Name $Nombre -ErrorAction SilentlyContinue
    if ($null -ne $comando) {
        return $comando.Source
    }
    if ($ToleranteEnSimulacion) {
        return "(no encontrado en el PATH: $Nombre)"
    }

    # Para NSSM el mensaje nombra el parametro: en esta VM lo habitual es
    # que nssm.exe este instalado pero fuera del PATH, asi que "no se
    # encontro en el PATH" sin mas haria pensar que falta instalarlo.
    if ($Nombre -eq 'nssm.exe') {
        $mensaje = 'No se encontro nssm.exe en el PATH, pero puede estar instalado fuera de el.' + [Environment]::NewLine
        $mensaje += '       Ejecute verificar-requisitos.ps1: si lo localiza, imprime la ruta exacta' + [Environment]::NewLine
        $mensaje += '       lista para copiar. Luego repita este comando agregando:' + [Environment]::NewLine
        $mensaje += '           -RutaNssm "C:\ruta\a\nssm.exe"' + [Environment]::NewLine
        $mensaje += '       Para buscarlo a mano:' + [Environment]::NewLine
        $mensaje += '           Get-ChildItem C:\ -Filter nssm.exe -Recurse -ErrorAction SilentlyContinue'
        throw $mensaje
    }

    throw "No se encontro $Nombre en el PATH. Ejecute verificar-requisitos.ps1."
}

function Invocar-Comando {
    <#
        Ejecuta un programa externo y falla si devuelve un codigo distinto
        de 0. Hace falta porque $ErrorActionPreference no aplica a los
        ejecutables nativos: sin esta comprobacion, un "npm ci" que falla
        pasaria desapercibido y se desplegaria un backend incompleto.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Programa,
        [Parameter(Mandatory = $true)][string[]] $Argumentos,
        [string] $DirectorioTrabajo = '',
        [string] $Descripcion = ''
    )

    $etiqueta = $Descripcion
    if ($etiqueta -eq '') { $etiqueta = "$Programa $($Argumentos -join ' ')" }

    $anterior = (Get-Location).Path
    try {
        if ($DirectorioTrabajo -ne '') { Set-Location -LiteralPath $DirectorioTrabajo }
        & $Programa @Argumentos
        if ($LASTEXITCODE -ne 0) {
            throw "Fallo: $etiqueta (codigo $LASTEXITCODE)"
        }
    } finally {
        Set-Location -LiteralPath $anterior
    }
}

# Archivo que marca una carpeta como publicada por este sistema. Sin el,
# los scripts se niegan a borrar nada.
$NOMBRE_MARCADOR = '.munidata-despliegue'

function Confirmar-CarpetaDestinoPropia {
    <#
        Se niega a continuar si la carpeta de publicacion ya tiene
        contenido que este sistema no puso.

        Hace falta porque en la VM Apache sirve WordPress y varios otros
        sistemas desde el mismo htdocs. Un -RutaHtdocs mal escrito, o un
        -RutaPublicaFrontend equivocado, apuntaria a la carpeta de otro
        sistema, y el reemplazo limpio del paso 7 la borraria entera. El
        respaldo previo no alcanzaria como consuelo: el otro sistema
        quedaria caido hasta que alguien lo notara.

        La regla es simple: solo se borra lo que lleva nuestro marcador.
        Una carpeta inexistente o vacia tambien es segura, porque no hay
        nada que destruir.
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
        Escribir-Detalle "Existe y esta vacia; se puede publicar: $Ruta"
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
  - Si se equivoco de ruta, repita con el valor correcto de -RutaHtdocs
    o de -RutaPublicaFrontend.
  - Si esa carpeta de verdad es de Muni Data (por ejemplo porque se
    publico a mano antes de usar estos scripts), revise su contenido y
    cree el marcador para autorizar el reemplazo:

        Set-Content -LiteralPath "$(Join-Path $Ruta $NOMBRE_MARCADOR)" -Value 'autorizado a mano'

    Despues vuelva a ejecutar este script.
"@

    if ($Simulacion) {
        Write-Host ''
        Write-Host $mensaje -ForegroundColor Yellow
        Write-Host '[SIMULACION] En una ejecucion real el despliegue se detendria aqui.' -ForegroundColor Yellow
        return
    }

    throw $mensaje
}

function Nuevo-Marcador {
    <#
        Deja el marcador en la carpeta recien publicada.

        Se escribe inmediatamente despues de copiar el frontend y no al
        final del despliegue a proposito: en ese momento el contenido de
        la carpeta ya es nuestro, y eso es justo lo que el marcador
        afirma. Si se escribiera al final y el servicio no arrancara, la
        siguiente ejecucion encontraria una carpeta con nuestros archivos
        pero sin marcador, y se negaria a continuar sin motivo.
    #>
    param([Parameter(Mandatory = $true)][string] $Ruta)

    $contenido = @(
        'Carpeta publicada por despliegue/desplegar.ps1 (Muni Data).',
        'Su presencia autoriza a los scripts a reemplazar el contenido de esta carpeta.',
        'NO lo borre: sin el, desplegar.ps1 y revertir.ps1 se negaran a publicar aqui.',
        '',
        ("Ultimo despliegue: {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    ) -join "`r`n"

    Set-Content -LiteralPath (Join-Path $Ruta $NOMBRE_MARCADOR) -Value $contenido -Encoding UTF8
}

function Nuevo-SecretoBase64 {
    <#
        64 bytes de aleatoriedad criptografica en base64. Se usa
        RandomNumberGenerator y no Get-Random porque este ultimo no es
        apto para secretos: con el, dos despliegues en el mismo instante
        podrian producir el mismo valor.
    #>
    $bytes = New-Object byte[] 64
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generador.GetBytes($bytes)
    } finally {
        $generador.Dispose()
    }
    return [Convert]::ToBase64String($bytes)
}

function Leer-ArchivoEntorno {
    <#
        Devuelve una tabla ordenada con las variables del .env. Se ignoran
        comentarios y lineas vacias. No se recortan comillas: en un .env
        las comillas son parte del valor, y asi el error se nota.
    #>
    param([Parameter(Mandatory = $true)][string] $Ruta)

    $variables = [ordered]@{}
    foreach ($linea in (Get-Content -LiteralPath $Ruta -Encoding UTF8)) {
        $texto = $linea.Trim()
        if ($texto -eq '' -or $texto.StartsWith('#')) { continue }
        $posicion = $texto.IndexOf('=')
        if ($posicion -lt 1) { continue }
        $nombre = $texto.Substring(0, $posicion).Trim()
        $valor = $texto.Substring($posicion + 1)
        $variables[$nombre] = $valor
    }
    return $variables
}

# ------------------------------------------------------------
# Lectura y escritura de AppEnvironmentExtra en el registro
# ------------------------------------------------------------
# Variables cuyo valor se puede imprimir sin riesgo en un diagnostico.
# Cualquier otra se trata como secreta: de ella se nombra la variable,
# nunca el contenido.
$VARIABLES_PUBLICAS = @('NODE_ENV', 'PUERTO', 'HOST_ESCUCHA', 'BD_HOST', 'BD_PUERTO', 'BD_NOMBRE')

# Margen de arranque del backend: abre el pool de MySQL, mapea las rutas
# y registra los trabajos programados. 60 segundos con sondeos cada 2
# cubren el arranque en frio de la VM con holgura.
$SEGUNDOS_ESPERA_PUERTO = 60
$SEGUNDOS_ENTRE_SONDEOS = 2

function Obtener-TipoDeValor {
    <#
        Devuelve el tipo del valor del registro ('MultiString',
        'String'...) o $null si ese valor no existe.

        Importa el tipo y no solo el contenido: NSSM solo interpreta
        AppEnvironmentExtra como lista de variables si es REG_MULTI_SZ.
        Si quedara como REG_SZ, el servicio arrancaria sin ninguna
        variable y el sintoma seria un fallo de conexion a la base de
        datos, que no apunta a ningun sitio.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Clave,
        [Parameter(Mandatory = $true)][string] $Nombre
    )

    try {
        $item = Get-Item -LiteralPath $Clave -ErrorAction Stop
        if (@($item.GetValueNames()) -notcontains $Nombre) { return $null }
        return [string] $item.GetValueKind($Nombre)
    } catch {
        return $null
    }
}

function Obtener-EntradasDeEntorno {
    <#
        Devuelve siempre un [string[]] (vacio si el valor no existe) con
        las entradas "NOMBRE=valor" guardadas en el registro.

        Se lee del registro y NO de la salida de "nssm get": nssm es una
        aplicacion Unicode y, cuando su salida se captura en una variable
        en vez de ir a la consola, PowerShell recibe los bytes UTF-16 y
        los decodifica de a uno, asi que "NODE_ENV=" llega como
        "N\0O\0D\0E\0_\0E\0N\0V\0=\0". Comparar ese texto fallaba para
        TODAS las variables aunque estuvieran perfectamente escritas, y
        detenia el despliegue justo antes de arrancar el servicio.

        El registro es ademas la fuente autentica: es de donde el
        servicio toma estas variables.

        OJO al usarla: PowerShell desenvuelve los arreglos vacios al
        devolverlos, asi que cuando el valor no existe quien llama recibe
        $null y no un arreglo. Hay que envolver la llamada en @() antes
        de mirar .Count, que es justamente lo que rompia el script con
        las salidas vacias de mysql.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Clave,
        [Parameter(Mandatory = $true)][string] $Nombre
    )

    try {
        $propiedad = Get-ItemProperty -Path $Clave -Name $Nombre -ErrorAction Stop
    } catch {
        return [string[]] @()
    }
    if ($null -eq $propiedad) { return [string[]] @() }

    $valor = $propiedad.$Nombre
    if ($null -eq $valor) { return [string[]] @() }
    return [string[]] @($valor | ForEach-Object { if ($null -eq $_) { '' } else { [string] $_ } })
}

function Comparar-EntradasDeEntorno {
    <#
        Compara lo que se queria escribir con lo que de verdad quedo en
        el registro, por nombre Y por valor exacto, y distingue los dos
        fallos posibles: la variable no se escribio, o se escribio con
        otro valor.

        De las variables sensibles solo se devuelve el nombre.
    #>
    param(
        [Parameter(Mandatory = $true)] $Esperadas,
        [string[]] $Escritas = @(),
        [string[]] $Publicas = @()
    )

    $porNombre = @{}
    foreach ($entrada in $Escritas) {
        $texto = [string] $entrada
        if ($texto -eq '') { continue }
        # Se parte en el PRIMER '=' unicamente: los secretos en base64
        # terminan en '=' y cualquier valor puede contener el signo.
        $posicion = $texto.IndexOf('=')
        if ($posicion -lt 1) { continue }
        $porNombre[$texto.Substring(0, $posicion)] = $texto.Substring($posicion + 1)
    }

    $ausentes = @()
    $distintas = @()
    foreach ($nombre in $Esperadas.Keys) {
        if (-not $porNombre.ContainsKey($nombre)) {
            $ausentes += $nombre
            continue
        }
        # -cne: comparacion exacta y sensible a mayusculas. Un valor que
        # difiera solo en el caso tambien es un valor equivocado.
        if ($porNombre[$nombre] -cne $Esperadas[$nombre]) {
            if ($Publicas -contains $nombre) {
                $distintas += ("{0} (se esperaba '{1}' y en el registro hay '{2}')" -f $nombre, $Esperadas[$nombre], $porNombre[$nombre])
            } else {
                $distintas += ("{0} (el valor no coincide; no se imprime porque es sensible)" -f $nombre)
            }
        }
    }

    return [pscustomobject]@{ Ausentes = @($ausentes); Distintas = @($distintas) }
}

function Restaurar-EntradasDeEntorno {
    <#
        Devuelve AppEnvironmentExtra a como estaba.

        Se usa cuando la escritura no se pudo verificar: el valor se
        reemplaza entero, de modo que un fallo a medias dejaria al
        servicio sin ninguna variable, y al arrancar el backend se
        quedaria sin datos de conexion ni secretos. Es preferible
        dejarlo con las variables anteriores, que al menos funcionaban.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Clave,
        [Parameter(Mandatory = $true)][string] $Nombre,
        [string[]] $Anteriores = @(),
        [bool] $Habia = $false
    )

    try {
        if ($Habia -and $Anteriores.Count -gt 0) {
            $null = New-ItemProperty -Path $Clave -Name $Nombre -PropertyType MultiString -Value ([string[]] $Anteriores) -Force
            return ("se restauro el valor anterior, con {0} variables" -f $Anteriores.Count)
        }
        Remove-ItemProperty -Path $Clave -Name $Nombre -ErrorAction SilentlyContinue
        return 'no habia valor previo, asi que se quito el que se acababa de escribir'
    } catch {
        return ("ATENCION: no se pudo restaurar el valor anterior: {0}" -f $_.Exception.Message)
    }
}

# ------------------------------------------------------------
# Diagnostico del arranque
# ------------------------------------------------------------
function Obtener-TamanoArchivo {
    <#
        Tamano en bytes, o 0 si el archivo no existe.

        Se usa para anotar hasta donde llegaba cada log ANTES de arrancar
        el servicio: si el arranque falla se muestran solo las lineas que
        escribio este intento. api-error.log es acumulativo y conserva
        los errores de intentos anteriores, que despistan mas de lo que
        ayudan.
    #>
    param([Parameter(Mandatory = $true)][string] $Ruta)

    if (-not (Test-Path -LiteralPath $Ruta)) { return [long] 0 }
    try {
        return [long] (Get-Item -LiteralPath $Ruta -Force).Length
    } catch {
        return [long] 0
    }
}

function Leer-TextoDesde {
    <#
        Devuelve el texto de un archivo a partir de un desplazamiento en
        bytes.

        Se abre con FileStream y comparticion ReadWrite|Delete, no con
        Get-Content, porque el servicio mantiene el log abierto para
        escritura: con una comparticion mas estricta la lectura fallaria
        con "el archivo esta siendo usado por otro proceso" justo cuando
        mas falta hace leerlo.

        Si el archivo mide menos que el desplazamiento es que roto (NSSM
        rota a los 10 MB) o se vacio: se lee entero y se avisa.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [long] $DesdeByte = 0
    )

    $resultado = [pscustomobject]@{ Texto = ''; Rotado = $false; Existe = $false; Error = '' }
    if (-not (Test-Path -LiteralPath $Ruta)) { return $resultado }
    $resultado.Existe = $true

    try {
        $comparticion = ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
        $flujo = New-Object System.IO.FileStream($Ruta, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $comparticion)
        try {
            $inicio = $DesdeByte
            if ($flujo.Length -lt $DesdeByte) {
                $resultado.Rotado = $true
                $inicio = [long] 0
            }
            $null = $flujo.Seek($inicio, [System.IO.SeekOrigin]::Begin)
            # Sin deteccion de BOM: se empieza a leer en medio del
            # archivo y unos bytes que se le parecieran se perderian.
            $lector = New-Object System.IO.StreamReader($flujo, [System.Text.Encoding]::UTF8, $false)
            try {
                $resultado.Texto = $lector.ReadToEnd()
            } finally {
                $lector.Dispose()
            }
        } finally {
            $flujo.Dispose()
        }
    } catch {
        $resultado.Error = $_.Exception.Message
    }
    return $resultado
}

function Ocultar-Secretos {
    <#
        Reemplaza por *** los valores sensibles antes de mostrar un log.

        Dos capas: los valores literales que se le pasan (los del
        archivo de entorno, que es la fuente real de los secretos) y,
        como red de seguridad por si alguno llegara de otro sitio, los
        patrones "NOMBRE=algo" de las variables sensibles.
    #>
    param(
        [string] $Texto = '',
        [string[]] $ValoresLiterales = @()
    )

    if ([string]::IsNullOrEmpty($Texto)) { return '' }
    $resultado = $Texto

    foreach ($valor in $ValoresLiterales) {
        # Por debajo de 8 caracteres el reemplazo literal haria mas dano
        # que bien: un valor corto coincide con cualquier palabra del log
        # y lo dejaria ilegible.
        if ($null -ne $valor -and $valor.Length -ge 8) {
            $resultado = $resultado.Replace($valor, '***')
        }
    }

    return [regex]::Replace(
        $resultado,
        '(?i)((?:BD_CONTRASENA|SMTP_PASS|JWT_[A-Z_]*SECRET|password|contrasena)\s*[=:]\s*)\S+',
        '${1}***')
}

function Mostrar-ColaRegistro {
    <#
        Muestra las ultimas lineas que un log recibio DESPUES del
        desplazamiento indicado, con los secretos ocultos.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Ruta,
        [long] $DesdeByte = 0,
        [int] $Lineas = 30,
        [string[]] $ValoresAOcultar = @()
    )

    Write-Host ''
    Write-Host ("--- {0} (solo lo escrito en este intento) ---" -f $Ruta) -ForegroundColor Yellow

    $lectura = Leer-TextoDesde -Ruta $Ruta -DesdeByte $DesdeByte
    if (-not $lectura.Existe) {
        Write-Host '    (el archivo no existe: el servicio no llego a escribir nada)' -ForegroundColor Yellow
        return
    }
    if ($lectura.Error -ne '') {
        Write-Host ("    (no se pudo leer: {0})" -f $lectura.Error) -ForegroundColor Yellow
        return
    }
    if ($lectura.Rotado) {
        Write-Host '    (el archivo roto o se vacio desde el arranque; se muestra desde el principio)' -ForegroundColor Yellow
    }

    $texto = Ocultar-Secretos -Texto $lectura.Texto -ValoresLiterales $ValoresAOcultar
    $todas = @($texto -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
    if ($todas.Count -eq 0) {
        Write-Host '    (ni una linea nueva desde el arranque: lo que hay en el archivo es de intentos anteriores)' -ForegroundColor Yellow
        return
    }

    $desde = 0
    if ($todas.Count -gt $Lineas) { $desde = $todas.Count - $Lineas }
    foreach ($linea in $todas[$desde..($todas.Count - 1)]) {
        Write-Host ("    {0}" -f $linea)
    }
    if ($desde -gt 0) {
        Write-Host ("    (ultimas {0} de {1} lineas nuevas)" -f $Lineas, $todas.Count) -ForegroundColor Yellow
    }
}

function Obtener-ProcesosDelServicio {
    <#
        Devuelve el PID del proceso del servicio y los de sus hijos.

        La distincion hace falta porque con NSSM el proceso del servicio
        es nssm.exe y node.exe es su hijo: si la aplicacion se cae y NSSM
        la relanza (AppExit Default Restart), el PID del servicio no
        cambia y el del hijo si. Ver como cambia el hijo entre sondeos es
        lo que delata un bucle de reinicios, que desde fuera se ve igual
        que un arranque lento.
    #>
    param([Parameter(Mandatory = $true)][string] $Nombre)

    $resultado = [pscustomobject]@{ Servicio = 0; Hijos = @() }

    try {
        $filtro = "Name='{0}'" -f $Nombre.Replace("'", "''")
        $servicio = Get-CimInstance -ClassName Win32_Service -Filter $filtro -ErrorAction Stop
        if ($null -ne $servicio -and $null -ne $servicio.ProcessId) {
            $resultado.Servicio = [int] $servicio.ProcessId
        }
    } catch {
        return $resultado
    }

    if ($resultado.Servicio -gt 0) {
        try {
            $hijos = @(Get-CimInstance -ClassName Win32_Process -Filter ("ParentProcessId={0}" -f $resultado.Servicio) -ErrorAction Stop)
            $resultado.Hijos = @($hijos | ForEach-Object { [int] $_.ProcessId } | Sort-Object)
        } catch {
            $resultado.Hijos = @()
        }
    }
    return $resultado
}

function Esperar-PuertoEscuchando {
    <#
        Sondea, hasta agotar el plazo, a que algo escuche en el puerto, y
        va anotando el PID de la aplicacion para delatar un bucle de
        reinicios.

        Se aceptan 127.0.0.1 y 0.0.0.0: un socket en 0.0.0.0 tambien
        atiende el loopback, de modo que el servicio funciona, pero queda
        accesible desde fuera de la VM y eso hay que decirlo. La
        comprobacion de que escuche SOLO en loopback es de
        verificar-despliegue.ps1.
    #>
    param(
        [Parameter(Mandatory = $true)][int] $Puerto,
        [Parameter(Mandatory = $true)][string] $NombreDelServicio,
        [int] $Segundos = 60,
        [int] $Intervalo = 2
    )

    $limite = (Get-Date).AddSeconds($Segundos)
    $pidsVistos = New-Object System.Collections.ArrayList
    $direcciones = @()
    $escuchando = $false

    while ($true) {
        $procesos = Obtener-ProcesosDelServicio -Nombre $NombreDelServicio
        foreach ($identificador in $procesos.Hijos) {
            if (-not $pidsVistos.Contains($identificador)) { $null = $pidsVistos.Add($identificador) }
        }

        $conexiones = @(Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue)
        if ($conexiones.Count -gt 0) {
            $direcciones = @($conexiones | ForEach-Object { [string] $_.LocalAddress } | Sort-Object -Unique)
            $utiles = @($direcciones | Where-Object { $_ -eq '127.0.0.1' -or $_ -eq '0.0.0.0' -or $_ -eq '::' -or $_ -eq '::1' })
            if ($utiles.Count -gt 0) {
                $escuchando = $true
                break
            }
        }

        if ((Get-Date) -ge $limite) { break }
        Start-Sleep -Seconds $Intervalo
    }

    return [pscustomobject]@{
        Escuchando  = $escuchando
        Direcciones = @($direcciones)
        PidsVistos  = @($pidsVistos)
    }
}

# ------------------------------------------------------------
# Inicio
# ------------------------------------------------------------
Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - despliegue'
Write-Host '============================================================'

if ($RutaHtdocs -eq '') {
    Write-Host ''
    Write-Host 'ERROR: falta -RutaHtdocs.' -ForegroundColor Red
    Write-Host '       Es la carpeta htdocs de Apache. No tiene valor por defecto a' -ForegroundColor Red
    Write-Host '       proposito: publicar en la carpeta equivocada sobreescribiria otro' -ForegroundColor Red
    Write-Host '       sistema de la VM.' -ForegroundColor Red
    Write-Host '' -ForegroundColor Red
    Write-Host '       En esta VM, Apache esta en C:\Apache24, asi que use:' -ForegroundColor Red
    Write-Host '           -RutaHtdocs "C:\Apache24\htdocs"' -ForegroundColor Red
    Write-Host '' -ForegroundColor Red
    Write-Host '       Para confirmarlo, busque DocumentRoot en C:\Apache24\conf\httpd.conf' -ForegroundColor Red
    exit 1
}

$rutaFrontendDestino = Join-Path $RutaHtdocs $RutaPublicaFrontend

Write-Host ("Repositorio     : {0}" -f $raizRepositorio)
Write-Host ("Backend destino : {0}" -f $rutaBackendDestino)
Write-Host ("Frontend destino: {0}" -f $rutaFrontendDestino)
Write-Host ("Configuracion   : {0}" -f $archivoEntorno)
Write-Host ("Servicio        : {0} (puerto {1})" -f $NombreServicio, $Puerto)
Write-Host ("Respaldo        : {0}" -f $rutaRespaldoActual)

if ($Simular) {
    Write-Host ''
    Write-Host '[SIMULACION] No se modificara nada: ni archivos, ni servicios, ni registro.' -ForegroundColor Yellow
} else {
    if (-not (Confirmar-Administrador)) {
        Write-Host ''
        Write-Host 'ERROR: este script necesita permisos de administrador.' -ForegroundColor Red
        Write-Host '       Abra PowerShell con "Ejecutar como administrador" y repita.' -ForegroundColor Red
        exit 1
    }
}

try {
    # --------------------------------------------------------
    # 0. Herramientas
    # --------------------------------------------------------
    Escribir-Paso 'Comprobando herramientas'
    $rutaNode = Resolver-Ejecutable -Nombre 'node.exe' -ToleranteEnSimulacion:$Simular
    $rutaNpm  = Resolver-Ejecutable -Nombre 'npm.cmd' -ToleranteEnSimulacion:$Simular
    $rutaNssmResuelta = Resolver-Ejecutable -Nombre 'nssm.exe' -RutaExplicita $RutaNssm -ToleranteEnSimulacion:$Simular
    Escribir-Detalle "node : $rutaNode"
    Escribir-Detalle "npm  : $rutaNpm"
    Escribir-Detalle "nssm : $rutaNssmResuelta"

    if (-not (Test-Path -LiteralPath $RutaHtdocs)) {
        if ($Simular) {
            Escribir-Simulado "la carpeta htdocs indicada no existe en esta maquina: $RutaHtdocs"
            Escribir-Simulado 'en la VM debe existir; una ejecucion real se detendria aqui'
        } else {
            throw "No existe la carpeta htdocs indicada: $RutaHtdocs"
        }
    }

    # --------------------------------------------------------
    # 1. Carpeta de destino del frontend
    # --------------------------------------------------------
    # Va antes de cualquier otra cosa: si la carpeta es de otro sistema,
    # el despliegue debe abortar sin haber creado carpetas, compilado ni
    # tocado el servicio.
    Escribir-Paso 'Comprobando la carpeta de destino del frontend'
    Confirmar-CarpetaDestinoPropia -Ruta $rutaFrontendDestino -Simulacion:$Simular

    # --------------------------------------------------------
    # 2. Carpetas de datos
    # --------------------------------------------------------
    Escribir-Paso 'Carpetas de datos'
    foreach ($carpeta in @($RutaDatos, $rutaConfig, $rutaBackendDestino, $rutaAlmacenamiento, $rutaRespaldos, $rutaRegistros)) {
        if (Test-Path -LiteralPath $carpeta) {
            Escribir-Detalle "ya existe  $carpeta"
        } elseif ($Simular) {
            Escribir-Simulado "crearia  $carpeta"
        } else {
            $null = New-Item -ItemType Directory -Path $carpeta -Force
            Escribir-Detalle "creada     $carpeta"
        }
    }

    # --------------------------------------------------------
    # 3. Archivo de entorno
    # --------------------------------------------------------
    Escribir-Paso 'Archivo de variables de entorno'

    if (-not (Test-Path -LiteralPath $plantillaEntorno)) {
        throw "No se encontro la plantilla $plantillaEntorno"
    }

    if (-not (Test-Path -LiteralPath $archivoEntorno)) {
        if ($Simular) {
            Escribir-Simulado "copiaria la plantilla a $archivoEntorno"
            Escribir-Simulado 'generaria JWT_ACCESS_SECRET y JWT_REFRESH_SECRET (64 bytes aleatorios en base64)'
            Escribir-Simulado 'y SE DETENDRIA para que usted complete BD_* y SMTP_*'
        } else {
            # -Raw devuelve $null si la plantilla esta vacia, y entonces
            # los -replace de abajo producirian una cadena vacia y se
            # escribiria un .env sin ninguna variable.
            $contenido = Get-Content -LiteralPath $plantillaEntorno -Encoding UTF8 -Raw
            if ([string]::IsNullOrWhiteSpace($contenido)) {
                throw "La plantilla $plantillaEntorno esta vacia; no se puede generar el archivo de entorno."
            }

            # Los secretos se generan aqui y no se piden: son valores que
            # nadie debe elegir a mano ni recordar.
            $contenido = $contenido -replace 'JWT_ACCESS_SECRET=.*', ("JWT_ACCESS_SECRET=" + (Nuevo-SecretoBase64))
            $contenido = $contenido -replace 'JWT_REFRESH_SECRET=.*', ("JWT_REFRESH_SECRET=" + (Nuevo-SecretoBase64))
            $contenido = $contenido -replace 'RUTA_ALMACENAMIENTO=.*', ("RUTA_ALMACENAMIENTO=" + $rutaAlmacenamiento)
            $contenido = $contenido -replace 'PUERTO=.*', ("PUERTO=" + $Puerto)

            [System.IO.File]::WriteAllText($archivoEntorno, $contenido, (New-Object System.Text.UTF8Encoding($false)))

            # El archivo guarda la contrasena de la base y la del correo:
            # se quita la herencia de permisos y se deja solo para
            # administradores y para la cuenta del servicio (SYSTEM).
            #
            # Se nombran por SID conocido (S-1-5-32-544 y S-1-5-18) y no
            # por "Administrators"/"SYSTEM": en un Windows en espanol esos
            # nombres no existen, icacls falla con el codigo 1332 y no
            # aplica NINGUNA de las concesiones, ni siquiera
            # /inheritance:r, dejando el archivo de secretos con los
            # permisos heredados de la carpeta. Se comprueba el resultado
            # porque antes se descartaba con Out-Null y el fallo pasaba
            # inadvertido.
            $salidaIcacls = & icacls.exe $archivoEntorno /inheritance:r /grant:r '*S-1-5-32-544:(F)' /grant:r '*S-1-5-18:(R)' 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host ''
                Write-Host ("AVISO: no se pudieron restringir los permisos de {0}" -f $archivoEntorno) -ForegroundColor Yellow
                Write-Host ("       icacls devolvio {0}: {1}" -f $LASTEXITCODE, (($salidaIcacls | Out-String).Trim())) -ForegroundColor Yellow
                Write-Host '       Ese archivo contiene las contrasenas de la base y del correo:' -ForegroundColor Yellow
                Write-Host '       revise sus permisos a mano antes de continuar.' -ForegroundColor Yellow
            }

            Write-Host ''
            Write-Host '------------------------------------------------------------' -ForegroundColor Yellow
            Write-Host ' ACCION REQUERIDA' -ForegroundColor Yellow
            Write-Host '------------------------------------------------------------' -ForegroundColor Yellow
            Write-Host (" Se creo {0}" -f $archivoEntorno) -ForegroundColor Yellow
            Write-Host ' con los secretos JWT ya generados.' -ForegroundColor Yellow
            Write-Host '' -ForegroundColor Yellow
            Write-Host ' Ahora edite ese archivo y reemplace TODOS los valores que' -ForegroundColor Yellow
            Write-Host ' empiezan por CAMBIEME:' -ForegroundColor Yellow
            Write-Host '   - BD_CONTRASENA  : la que definio en preparar-base-datos.ps1' -ForegroundColor Yellow
            Write-Host '   - FRONTEND_URL   : la URL publica real, con la subruta' -ForegroundColor Yellow
            Write-Host '   - SMTP_USER / SMTP_PASS / SMTP_FROM' -ForegroundColor Yellow
            Write-Host '' -ForegroundColor Yellow
            Write-Host ' Recuerde: SMTP_PASS va SIN ESPACIOS.' -ForegroundColor Yellow
            Write-Host '' -ForegroundColor Yellow
            Write-Host ' Cuando termine, vuelva a ejecutar este mismo script.' -ForegroundColor Yellow
            Write-Host '------------------------------------------------------------' -ForegroundColor Yellow
            exit 2
        }
    } else {
        Escribir-Detalle "ya existe  $archivoEntorno"
    }

    # --------------------------------------------------------
    # 4. Validacion del archivo de entorno
    # --------------------------------------------------------
    Escribir-Paso 'Validando las variables de entorno'

    $variables = [ordered]@{}
    if ((Test-Path -LiteralPath $archivoEntorno)) {
        $variables = Leer-ArchivoEntorno -Ruta $archivoEntorno
    } elseif ($Simular) {
        Escribir-Simulado 'leeria el archivo real; aqui se valida la plantilla para mostrar el procedimiento'
        $variables = Leer-ArchivoEntorno -Ruta $plantillaEntorno
    }

    $obligatorias = @(
        'NODE_ENV', 'PUERTO', 'HOST_ESCUCHA', 'CONFIAR_EN_PROXY', 'FRONTEND_URL',
        'BD_HOST', 'BD_PUERTO', 'BD_NOMBRE', 'BD_USUARIO', 'BD_CONTRASENA',
        'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
        'RUTA_ALMACENAMIENTO', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'
    )

    $problemas = @()
    foreach ($nombre in $obligatorias) {
        if (-not $variables.Contains($nombre)) {
            $problemas += "falta la variable $nombre"
        } elseif ($variables[$nombre].Trim() -eq '') {
            $problemas += "$nombre esta vacia"
        } elseif ($variables[$nombre] -match 'CAMBIEME') {
            $problemas += "$nombre sigue con el valor de ejemplo (CAMBIEME)"
        }
    }

    # Comprobaciones de coherencia que, si fallan, producen sintomas
    # confusos mas adelante en vez de un error claro.
    if ($variables.Contains('NODE_ENV') -and $variables['NODE_ENV'].Trim() -ne 'production') {
        $problemas += "NODE_ENV debe valer exactamente 'production' (ahora: '$($variables['NODE_ENV'])')"
    }
    if ($variables.Contains('FRONTEND_URL')) {
        $url = $variables['FRONTEND_URL'].Trim()
        if ($url.EndsWith('/')) {
            $problemas += 'FRONTEND_URL no debe terminar con barra: los enlaces de los correos quedarian con doble barra'
        }
        if ($url -match 'localhost|127\.0\.0\.1') {
            $problemas += 'FRONTEND_URL apunta a localhost; los enlaces de los correos no funcionarian para nadie'
        }
    }
    if ($variables.Contains('SMTP_PASS') -and $variables['SMTP_PASS'] -match '\s') {
        $problemas += 'SMTP_PASS contiene espacios; escribala en una sola palabra'
    }
    if ($variables.Contains('PUERTO') -and $variables['PUERTO'].Trim() -ne [string]$Puerto) {
        $problemas += "PUERTO en el archivo ($($variables['PUERTO'])) no coincide con -Puerto ($Puerto); tambien debe coincidir con el ProxyPass de Apache"
    }

    if ($problemas.Count -gt 0) {
        Write-Host ''
        Write-Host ("Hay {0} problema(s) en {1}:" -f $problemas.Count, $archivoEntorno) -ForegroundColor Red
        foreach ($problema in $problemas) {
            Write-Host "  - $problema" -ForegroundColor Red
        }
        if ($Simular) {
            Write-Host ''
            Write-Host '[SIMULACION] En una ejecucion real el despliegue se detendria aqui.' -ForegroundColor Yellow
            Write-Host '[SIMULACION] Es lo esperable al validar la plantilla, que esta llena de CAMBIEME.' -ForegroundColor Yellow
        } else {
            throw 'Corrija el archivo de entorno y vuelva a ejecutar.'
        }
    } else {
        Escribir-Detalle ("{0} variables presentes y sin valores de ejemplo." -f $variables.Count)
    }

    # --------------------------------------------------------
    # 5. Respaldo de lo que hay publicado
    # --------------------------------------------------------
    Escribir-Paso 'Respaldo previo'

    $hayAlgoQueRespaldar = (Test-Path -LiteralPath (Join-Path $rutaBackendDestino 'dist')) -or (Test-Path -LiteralPath $rutaFrontendDestino)

    if (-not $hayAlgoQueRespaldar) {
        Escribir-Detalle 'Primera instalacion: no hay nada publicado que respaldar.'
    } elseif ($Simular) {
        Escribir-Simulado "copiaria el backend y el frontend actuales a $rutaRespaldoActual"
    } else {
        $null = New-Item -ItemType Directory -Path $rutaRespaldoActual -Force

        if (Test-Path -LiteralPath (Join-Path $rutaBackendDestino 'dist')) {
            $destino = Join-Path $rutaRespaldoActual 'backend'
            $null = New-Item -ItemType Directory -Path $destino -Force
            # Solo dist y los package*.json: node_modules se reinstala y
            # copiarlo multiplicaria el tamano del respaldo por diez.
            Copy-Item -LiteralPath (Join-Path $rutaBackendDestino 'dist') -Destination $destino -Recurse -Force
            foreach ($archivo in @('package.json', 'package-lock.json')) {
                $origen = Join-Path $rutaBackendDestino $archivo
                if (Test-Path -LiteralPath $origen) {
                    Copy-Item -LiteralPath $origen -Destination $destino -Force
                }
            }
            Escribir-Detalle "backend  -> $destino"
        }

        if (Test-Path -LiteralPath $rutaFrontendDestino) {
            $destino = Join-Path $rutaRespaldoActual 'frontend'
            $null = New-Item -ItemType Directory -Path $destino -Force
            # Get-ChildItem -Force en vez de un comodin: el comodin omite
            # los archivos que empiezan por punto, y sin el .htaccess en
            # el respaldo una reversion dejaria el SPA devolviendo 404 en
            # las rutas profundas.
            Get-ChildItem -LiteralPath $rutaFrontendDestino -Force |
                Copy-Item -Destination $destino -Recurse -Force
            Escribir-Detalle "frontend -> $destino"
        }

        # Marca para que revertir.ps1 sepa cual es el ultimo respaldo
        # bueno sin depender del orden alfabetico de las carpetas.
        Set-Content -LiteralPath (Join-Path $rutaRespaldos 'ultimo.txt') -Value $marcaTiempo -Encoding ASCII
    }

    # --------------------------------------------------------
    # 6. Compilacion del backend
    # --------------------------------------------------------
    Escribir-Paso 'Compilando el backend'
    if ($Simular) {
        Escribir-Simulado "npm ci        en $rutaBackendRepo"
        Escribir-Simulado "npm run build en $rutaBackendRepo"
    } else {
        Invocar-Comando -Programa $rutaNpm -Argumentos @('ci') -DirectorioTrabajo $rutaBackendRepo -Descripcion 'npm ci del backend'
        Invocar-Comando -Programa $rutaNpm -Argumentos @('run', 'build') -DirectorioTrabajo $rutaBackendRepo -Descripcion 'nest build'
        if (-not (Test-Path -LiteralPath (Join-Path $rutaBackendRepo 'dist\main.js'))) {
            throw 'La compilacion no produjo dist\main.js'
        }
        Escribir-Detalle 'dist\main.js generado.'
    }

    # --------------------------------------------------------
    # 7. Publicacion del backend
    # --------------------------------------------------------
    Escribir-Paso 'Publicando el backend'
    if ($Simular) {
        Escribir-Simulado "reemplazaria $rutaBackendDestino\dist"
        Escribir-Simulado "copiaria package.json y package-lock.json"
        Escribir-Simulado "npm ci --omit=dev en $rutaBackendDestino"
    } else {
        $distDestino = Join-Path $rutaBackendDestino 'dist'
        if (Test-Path -LiteralPath $distDestino) {
            Remove-Item -LiteralPath $distDestino -Recurse -Force
        }
        Copy-Item -LiteralPath (Join-Path $rutaBackendRepo 'dist') -Destination $rutaBackendDestino -Recurse -Force
        foreach ($archivo in @('package.json', 'package-lock.json')) {
            Copy-Item -LiteralPath (Join-Path $rutaBackendRepo $archivo) -Destination $rutaBackendDestino -Force
        }
        Escribir-Detalle "dist y package*.json copiados a $rutaBackendDestino"

        # --omit=dev deja fuera NestJS CLI, TypeScript, Jest y demas: el
        # servicio solo ejecuta JavaScript ya compilado.
        Invocar-Comando -Programa $rutaNpm -Argumentos @('ci', '--omit=dev') -DirectorioTrabajo $rutaBackendDestino -Descripcion 'npm ci --omit=dev en el destino'
        Escribir-Detalle 'Dependencias de produccion instaladas.'
    }

    # --------------------------------------------------------
    # 8. Compilacion y publicacion del frontend
    # --------------------------------------------------------
    Escribir-Paso 'Compilando y publicando el frontend'
    if ($Simular) {
        Escribir-Simulado "npm ci        en $rutaFrontendRepo"
        Escribir-Simulado "npm run build en $rutaFrontendRepo  (lee frontend\.env.production)"
        Escribir-Simulado "reemplazaria el contenido de $rutaFrontendDestino, pero SOLO si lleva el marcador $NOMBRE_MARCADOR"
        Escribir-Simulado "y escribiria ese marcador tras publicar"
    } else {
        Invocar-Comando -Programa $rutaNpm -Argumentos @('ci') -DirectorioTrabajo $rutaFrontendRepo -Descripcion 'npm ci del frontend'
        Invocar-Comando -Programa $rutaNpm -Argumentos @('run', 'build') -DirectorioTrabajo $rutaFrontendRepo -Descripcion 'vite build'

        $distFrontend = Join-Path $rutaFrontendRepo 'dist'
        if (-not (Test-Path -LiteralPath (Join-Path $distFrontend 'index.html'))) {
            throw 'La compilacion del frontend no produjo dist\index.html'
        }
        # El .htaccess es imprescindible: sin el, las rutas profundas del
        # SPA devuelven 404 al recargar la pagina.
        if (-not (Test-Path -LiteralPath (Join-Path $distFrontend '.htaccess'))) {
            throw 'dist no contiene .htaccess; compruebe que frontend\public\.htaccess existe en el repositorio'
        }

        if (-not (Test-Path -LiteralPath $rutaFrontendDestino)) {
            $null = New-Item -ItemType Directory -Path $rutaFrontendDestino -Force
            Escribir-Detalle 'Carpeta de destino creada.'
        } elseif (Test-Path -LiteralPath (Join-Path $rutaFrontendDestino $NOMBRE_MARCADOR)) {
            # Reemplazo limpio: si quedaran assets de la version anterior,
            # convivirian con los nuevos y la carpeta creceria sin fin.
            # El respaldo del paso 5 ya se hizo.
            #
            # Solo se llega aqui con el marcador presente, es decir con la
            # certeza de que lo que se borra lo publico este sistema. La
            # comprobacion del paso 1 ya aborto en cualquier otro caso;
            # esta segunda condicion es la red de seguridad para que un
            # cambio futuro en el orden de los pasos no reintroduzca un
            # borrado a ciegas.
            Get-ChildItem -LiteralPath $rutaFrontendDestino -Force | Remove-Item -Recurse -Force
            Escribir-Detalle 'Contenido anterior de Muni Data eliminado (marcador presente).'
        } else {
            # Carpeta existente y vacia: no hay nada que borrar.
            Escribir-Detalle 'Carpeta de destino vacia; se publica directamente.'
        }

        Copy-Item -Path (Join-Path $distFrontend '*') -Destination $rutaFrontendDestino -Recurse -Force
        # Copy-Item con comodin omite los archivos que empiezan por punto;
        # el .htaccess se copia aparte por eso.
        Copy-Item -LiteralPath (Join-Path $distFrontend '.htaccess') -Destination $rutaFrontendDestino -Force

        Nuevo-Marcador -Ruta $rutaFrontendDestino

        Escribir-Detalle "Publicado en $rutaFrontendDestino"
        Escribir-Detalle "Marcador $NOMBRE_MARCADOR escrito."
    }

    # --------------------------------------------------------
    # 9. Servicio de Windows
    # --------------------------------------------------------
    Escribir-Paso "Servicio de Windows $NombreServicio"

    $servicioExistente = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
    $rutaMain = Join-Path $rutaBackendDestino 'dist\main.js'

    if ($Simular) {
        if ($null -eq $servicioExistente) {
            Escribir-Simulado "nssm install $NombreServicio `"$rutaNode`" `"$rutaMain`""
        } else {
            Escribir-Simulado "el servicio ya existe; actualizaria su configuracion"
        }
        Escribir-Simulado "nssm set $NombreServicio AppDirectory $rutaBackendDestino"
        Escribir-Simulado "nssm set $NombreServicio Start SERVICE_AUTO_START"
        Escribir-Simulado "nssm set $NombreServicio AppExit Default Restart"
        Escribir-Simulado "nssm set $NombreServicio AppStdout $rutaRegistros\api-salida.log  (rotado a 10 MB)"
        Escribir-Simulado "nssm set $NombreServicio AppStderr $rutaRegistros\api-error.log   (rotado a 10 MB)"
    } else {
        if ($null -eq $servicioExistente) {
            Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('install', $NombreServicio, $rutaNode, $rutaMain) -Descripcion 'nssm install'
            Escribir-Detalle 'Servicio creado.'
        } else {
            Escribir-Detalle "Ya existe (estado: $($servicioExistente.Status)). Se actualiza su configuracion."
            if ($servicioExistente.Status -eq 'Running') {
                Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('stop', $NombreServicio) -Descripcion 'nssm stop'
                Escribir-Detalle 'Servicio detenido para actualizarlo.'
            }
            # Se reescriben por si cambio la ruta de node (una
            # actualizacion de Node.js cambia la carpeta de instalacion).
            Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('set', $NombreServicio, 'Application', $rutaNode) -Descripcion 'nssm set Application'
            Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('set', $NombreServicio, 'AppParameters', $rutaMain) -Descripcion 'nssm set AppParameters'
        }

        $ajustes = @(
            @('AppDirectory', $rutaBackendDestino),
            @('DisplayName', 'Muni Data - API de Gestion Documental'),
            @('Description', 'Backend NestJS del Sistema Integral de Gestion Documental de la Municipalidad de Palmares.'),
            @('Start', 'SERVICE_AUTO_START'),
            @('AppStdout', (Join-Path $rutaRegistros 'api-salida.log')),
            @('AppStderr', (Join-Path $rutaRegistros 'api-error.log')),
            # Rotacion: sin esto los log crecen sin limite hasta llenar el
            # disco, que es un modo de fallo real en un servidor que nadie
            # mira durante meses.
            @('AppRotateFiles', '1'),
            @('AppRotateOnline', '1'),
            @('AppRotateBytes', '10485760'),
            # Reinicio ante fallo, con 5 segundos de espera para no entrar
            # en un bucle de reinicios si la base de datos esta caida.
            @('AppExit', 'Default'),
            @('AppRestartDelay', '5000'),
            # Margen para que Nest cierre conexiones al detenerse.
            @('AppStopMethodConsole', '15000')
        )

        foreach ($ajuste in $ajustes) {
            if ($ajuste[0] -eq 'AppExit') {
                Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('set', $NombreServicio, 'AppExit', 'Default', 'Restart') -Descripcion 'nssm set AppExit'
            } else {
                Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('set', $NombreServicio, $ajuste[0], $ajuste[1]) -Descripcion ("nssm set " + $ajuste[0])
            }
        }
        Escribir-Detalle 'Configuracion del servicio aplicada.'
    }

    # --------------------------------------------------------
    # 10. Variables de entorno del servicio
    # --------------------------------------------------------
    Escribir-Paso 'Variables de entorno del servicio'

    # Se escriben directamente en el registro y no con "nssm set
    # AppEnvironmentExtra", porque ese camino pasa por la linea de
    # comandos: una contrasena con espacios, comillas o simbolos de
    # redireccion se partiria o se interpretaria. El valor es un
    # REG_MULTI_SZ, es decir un arreglo de cadenas "CLAVE=valor", que es
    # exactamente lo que PowerShell escribe al pasar un string[].
    $claveRegistro = "HKLM:\SYSTEM\CurrentControlSet\Services\$NombreServicio\Parameters"
    $entradas = @()
    foreach ($nombre in $variables.Keys) {
        $entradas += ("{0}={1}" -f $nombre, $variables[$nombre])
    }

    if ($Simular) {
        Escribir-Simulado "escribiria $($entradas.Count) variables en $claveRegistro\AppEnvironmentExtra (REG_MULTI_SZ)"
        Escribir-Simulado ("nombres: {0}" -f (($variables.Keys) -join ', '))
        Escribir-Simulado 'y comprobaria releyendo ese valor del registro: tipo REG_MULTI_SZ, y cada'
        Escribir-Simulado 'variable por nombre y por valor exacto, sin imprimir los valores sensibles'
    } else {
        if (-not (Test-Path -LiteralPath $claveRegistro)) {
            $null = New-Item -Path $claveRegistro -Force
        }

        # El valor se reemplaza entero, asi que antes se guarda el que
        # hay: si la escritura no se puede verificar, se devuelve el
        # anterior en vez de dejar al servicio con un valor a medias.
        $tipoAnterior = Obtener-TipoDeValor -Clave $claveRegistro -Nombre 'AppEnvironmentExtra'
        $habiaValor = ($null -ne $tipoAnterior)
        # @() porque sin valor previo la funcion devuelve $null y .Count
        # sobre $null detiene el script.
        $entradasAnteriores = @(Obtener-EntradasDeEntorno -Clave $claveRegistro -Nombre 'AppEnvironmentExtra')
        if ($habiaValor) {
            Escribir-Detalle ("Habia un valor anterior con {0} variables; se guarda por si hay que devolverlo." -f $entradasAnteriores.Count)
        }

        try {
            $null = New-ItemProperty -Path $claveRegistro -Name 'AppEnvironmentExtra' `
                -PropertyType MultiString -Value ([string[]] $entradas) -Force
        } catch {
            throw ("No se pudo escribir AppEnvironmentExtra en {0}: {1}" -f $claveRegistro, $_.Exception.Message)
        }

        # Verificacion releyendo el registro, NO la salida de "nssm get"
        # (ver Obtener-EntradasDeEntorno). Se comprueban el tipo del
        # valor y cada variable por nombre y por valor exacto.
        $problemas = @()

        $tipoEscrito = Obtener-TipoDeValor -Clave $claveRegistro -Nombre 'AppEnvironmentExtra'
        if ($null -eq $tipoEscrito) {
            $problemas += 'el valor AppEnvironmentExtra no existe despues de escribirlo'
        } elseif ($tipoEscrito -ne 'MultiString') {
            $problemas += ("AppEnvironmentExtra quedo como {0} y NSSM solo interpreta REG_MULTI_SZ" -f $tipoEscrito)
        }

        $entradasEscritas = @(Obtener-EntradasDeEntorno -Clave $claveRegistro -Nombre 'AppEnvironmentExtra')
        $comparacion = Comparar-EntradasDeEntorno -Esperadas $variables -Escritas $entradasEscritas -Publicas $VARIABLES_PUBLICAS

        if ($comparacion.Ausentes.Count -gt 0) {
            $problemas += ("no se escribieron estas variables: " + ($comparacion.Ausentes -join ', '))
        }
        if ($comparacion.Distintas.Count -gt 0) {
            $problemas += ("se escribieron con otro valor: " + ($comparacion.Distintas -join '; '))
        }

        if ($problemas.Count -gt 0) {
            $resultadoRestauracion = Restaurar-EntradasDeEntorno -Clave $claveRegistro -Nombre 'AppEnvironmentExtra' `
                -Anteriores $entradasAnteriores -Habia $habiaValor

            $aviso = 'Las variables del servicio no quedaron como debian.' + [Environment]::NewLine
            foreach ($problema in $problemas) {
                $aviso += ("         - {0}" -f $problema) + [Environment]::NewLine
            }
            $aviso += ("       Para no dejar el servicio sin configuracion: {0}." -f $resultadoRestauracion) + [Environment]::NewLine
            $aviso += '       Revise los NOMBRES guardados en esta clave (no imprime ningun valor):' + [Environment]::NewLine
            $aviso += ("           (Get-ItemProperty '{0}' -Name AppEnvironmentExtra).AppEnvironmentExtra | ForEach-Object {{ (`$_ -split '=',2)[0] }}" -f $claveRegistro)
            throw $aviso
        }

        Escribir-Detalle ("{0} variables escritas y verificadas en el registro: REG_MULTI_SZ, nombres y valores exactos (los valores no se imprimen)." -f $entradas.Count)
    }

    # --------------------------------------------------------
    # 11. Arranque
    # --------------------------------------------------------
    Escribir-Paso 'Arrancando el servicio'

    $archivoLogError  = Join-Path $rutaRegistros 'api-error.log'
    $archivoLogSalida = Join-Path $rutaRegistros 'api-salida.log'

    if ($Simular) {
        Escribir-Simulado "nssm restart $NombreServicio"
        Escribir-Simulado ("esperaria hasta {0} segundos, sondeando cada {1}, a que el puerto {2} escuche en 127.0.0.1" -f $SEGUNDOS_ESPERA_PUERTO, $SEGUNDOS_ENTRE_SONDEOS, $Puerto)
        Escribir-Simulado 'y si no escuchara mostraria el estado del servicio, los PID vistos (para delatar un'
        Escribir-Simulado 'bucle de reinicios) y las ultimas 30 lineas que CADA log recibiera en este intento'
    } else {
        # Se anota el tamano de los log ANTES de arrancar para mostrar
        # despues solo las lineas de este intento: api-error.log es
        # acumulativo y conserva errores de dias anteriores.
        $tamanoLogErrorPrevio  = Obtener-TamanoArchivo -Ruta $archivoLogError
        $tamanoLogSalidaPrevio = Obtener-TamanoArchivo -Ruta $archivoLogSalida
        $instanteArranque = Get-Date

        $estado = (Get-Service -Name $NombreServicio).Status
        if ($estado -eq 'Running') {
            Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('restart', $NombreServicio) -Descripcion 'nssm restart'
        } else {
            Invocar-Comando -Programa $rutaNssmResuelta -Argumentos @('start', $NombreServicio) -Descripcion 'nssm start'
        }

        Escribir-Detalle ("Arranque solicitado a las {0}. Esperando a que el puerto {1} escuche..." -f $instanteArranque.ToString('HH:mm:ss'), $Puerto)

        # El backend tarda en abrir el pool de MySQL y mapear rutas; se
        # espera activamente en vez de con un Start-Sleep fijo.
        $sondeo = Esperar-PuertoEscuchando -Puerto $Puerto -NombreDelServicio $NombreServicio `
            -Segundos $SEGUNDOS_ESPERA_PUERTO -Intervalo $SEGUNDOS_ENTRE_SONDEOS

        # Los valores sensibles del archivo de entorno se pasan al visor
        # del log para que no asomen en la salida ni por accidente.
        $valoresSensibles = @(
            $variables.Keys |
                Where-Object { $VARIABLES_PUBLICAS -notcontains $_ } |
                ForEach-Object { [string] $variables[$_] }
        )

        if (-not $sondeo.Escuchando) {
            Write-Host ''
            Write-Host ("El servicio no empezo a escuchar en el puerto {0} en {1} segundos." -f $Puerto, $SEGUNDOS_ESPERA_PUERTO) -ForegroundColor Red
            Write-Host ("Arranque solicitado a las {0}: todo lo que sigue es posterior a esa hora." -f $instanteArranque.ToString('HH:mm:ss')) -ForegroundColor Red

            $servicioAhora = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
            if ($null -eq $servicioAhora) {
                Write-Host 'El servicio ya no existe.' -ForegroundColor Red
            } else {
                Write-Host ("Estado del servicio: {0}" -f $servicioAhora.Status) -ForegroundColor Red
            }

            $procesosAhora = Obtener-ProcesosDelServicio -Nombre $NombreServicio
            Write-Host ("PID del proceso del servicio (nssm.exe): {0}" -f $procesosAhora.Servicio) -ForegroundColor Red

            if ($sondeo.PidsVistos.Count -gt 1) {
                Write-Host ("BUCLE DE REINICIOS: la aplicacion arranco {0} veces durante la espera (PID {1})." -f $sondeo.PidsVistos.Count, ($sondeo.PidsVistos -join ', ')) -ForegroundColor Red
                Write-Host '       NSSM la relanza cada 5 segundos porque se cae al arrancar. La causa' -ForegroundColor Red
                Write-Host '       esta en las primeras lineas del log, no en las ultimas.' -ForegroundColor Red
            } elseif ($sondeo.PidsVistos.Count -eq 1) {
                Write-Host ("PID de la aplicacion: {0}. No se reinicio, asi que sigue arrancando o esta colgada." -f $sondeo.PidsVistos[0]) -ForegroundColor Red
            } else {
                Write-Host 'La aplicacion no arranco ni una vez: NSSM no llego a tener proceso hijo.' -ForegroundColor Red
                Write-Host '       Compruebe la ruta de node.exe y de dist\main.js en la configuracion del servicio.' -ForegroundColor Red
            }

            Mostrar-ColaRegistro -Ruta $archivoLogError  -DesdeByte $tamanoLogErrorPrevio  -Lineas 30 -ValoresAOcultar $valoresSensibles
            Mostrar-ColaRegistro -Ruta $archivoLogSalida -DesdeByte $tamanoLogSalidaPrevio -Lineas 30 -ValoresAOcultar $valoresSensibles

            throw ("El servicio no quedo escuchando en el puerto {0}." -f $Puerto)
        }

        Escribir-Detalle ("Escuchando en el puerto {0} ({1})." -f $Puerto, ($sondeo.Direcciones -join ', '))

        if (@($sondeo.Direcciones | Where-Object { $_ -eq '127.0.0.1' }).Count -eq 0) {
            Write-Host ''
            Write-Host ("AVISO: el puerto {0} no escucha en 127.0.0.1 sino en {1}." -f $Puerto, ($sondeo.Direcciones -join ', ')) -ForegroundColor Yellow
            Write-Host '       La API responde, pero queda accesible sin pasar por Apache.' -ForegroundColor Yellow
            Write-Host '       Compruebe HOST_ESCUCHA=127.0.0.1 en el archivo de entorno.' -ForegroundColor Yellow
        }

        if ($sondeo.PidsVistos.Count -gt 1) {
            Write-Host ''
            Write-Host ("AVISO: la aplicacion arranco {0} veces antes de quedar escuchando (PID {1})." -f $sondeo.PidsVistos.Count, ($sondeo.PidsVistos -join ', ')) -ForegroundColor Yellow
            Write-Host '       Quedo en pie, pero algo la tumbo en los primeros intentos.' -ForegroundColor Yellow
            Mostrar-ColaRegistro -Ruta $archivoLogError -DesdeByte $tamanoLogErrorPrevio -Lineas 30 -ValoresAOcultar $valoresSensibles
        }
    }

    # --------------------------------------------------------
    # 12. Verificacion
    # --------------------------------------------------------
    $scriptVerificacion = Join-Path $rutaDespliegue 'verificar-despliegue.ps1'

    if ($OmitirVerificacion) {
        Escribir-Paso 'Verificacion omitida por parametro'
    } elseif ($Simular) {
        Escribir-Paso 'Verificacion'
        Escribir-Simulado "ejecutaria $scriptVerificacion"
    } else {
        Escribir-Paso 'Verificacion del despliegue'
        $urlPublica = $variables['FRONTEND_URL'].TrimEnd('/')
        # -RutaDatos para que, si falla el puerto o /salud, pueda mostrar
        # la cola del log del servicio sin tener la ruta fija en el codigo.
        & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $scriptVerificacion -UrlPublica $urlPublica -Puerto $Puerto -NombreServicio $NombreServicio -RutaDatos $RutaDatos
        if ($LASTEXITCODE -ne 0) {
            Write-Host ''
            Write-Host 'El despliegue termino pero la verificacion encontro problemas (ver tabla arriba).' -ForegroundColor Yellow
            exit 1
        }
    }

    Write-Host ''
    if ($Simular) {
        Write-Host 'SIMULACION COMPLETADA. No se modifico nada.' -ForegroundColor Green
    } else {
        Write-Host 'DESPLIEGUE COMPLETADO.' -ForegroundColor Green
        Write-Host ''
        Write-Host 'Siguientes pasos:' -ForegroundColor Green
        Write-Host '  1. Incluir despliegue\apache\munidata.conf en la configuracion de Apache,' -ForegroundColor Green
        Write-Host '     validar con "httpd -t" y reiniciar Apache (ver DESPLIEGUE.md, seccion 4).' -ForegroundColor Green
        Write-Host '  2. Crear el administrador inicial:' -ForegroundColor Green
        Write-Host '     powershell -ExecutionPolicy Bypass -File .\despliegue\crear-administrador.ps1' -ForegroundColor Green
        Write-Host '  3. Programar los respaldos:' -ForegroundColor Green
        Write-Host '     powershell -ExecutionPolicy Bypass -File .\despliegue\respaldar.ps1 -RegistrarTarea' -ForegroundColor Green
    }
    exit 0

} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ''
    Write-Host 'El despliegue se detuvo. Nada quedo a medias en el servicio: si ya habia' -ForegroundColor Red
    Write-Host 'una version funcionando, siga con revertir.ps1 para restaurarla.' -ForegroundColor Red
    exit 1
}
