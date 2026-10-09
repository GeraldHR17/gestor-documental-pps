<#
.SINOPSIS
    Prueba de humo no destructiva del despliegue de Muni Data.

.DESCRIPCION
    Comprueba, de dentro hacia fuera, que cada pieza del camino funciona:
    el servicio, el puerto local, la API directa, Apache sirviendo el
    frontend, el proxy de la API y el .htaccess del SPA.

    Ese orden es deliberado: si falla el primer punto no tiene sentido
    mirar los siguientes, y la tabla final indica en cada fallo que
    revisar.

    No escribe nada: solo hace peticiones GET y un POST de inicio de
    sesion con credenciales deliberadamente invalidas, que la API debe
    rechazar.

.PARAMETER UrlPublica
    URL publica del frontend, con la subruta y sin barra final. Debe ser la
    misma que FRONTEND_URL de .env.produccion.
    Ejemplo: https://servidor.ejemplo.go.cr/munipalmares/wp-munidata

.PARAMETER Puerto
    Puerto local del backend.

.PARAMETER NombreServicio
    Nombre del servicio de Windows.

.PARAMETER RutaProfunda
    Ruta interna del SPA que se usa para comprobar el .htaccess.

.PARAMETER Simular
    Imprime lo que haria sin ejecutar nada.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\verificar-despliegue.ps1 -UrlPublica "https://servidor.ejemplo.go.cr/munipalmares/wp-munidata"
#>

[CmdletBinding()]
param(
    [string] $UrlPublica = '',
    [int]    $Puerto = 3000,
    [string] $NombreServicio = 'MuniData-API',
    [string] $RutaProfunda = 'documentos',
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resultados = New-Object System.Collections.ArrayList

function Agregar-Resultado {
    param(
        [Parameter(Mandatory = $true)][string] $Comprobacion,
        [Parameter(Mandatory = $true)][ValidateSet('OK', 'FALLO', 'OMITIDA')][string] $Estado,
        [string] $Detalle = '',
        [string] $QueRevisar = ''
    )
    $null = $resultados.Add([pscustomobject]@{
        Comprobacion = $Comprobacion
        Estado       = $Estado
        Detalle      = $Detalle
        QueRevisar   = $QueRevisar
    })
}

function Permitir-CertificadoNoConfiable {
    <#
        En la VM el certificado es autofirmado o emitido para otro nombre,
        asi que Invoke-WebRequest fallaria antes de llegar a la
        aplicacion. Windows PowerShell 5.1 no tiene
        -SkipCertificateCheck, de modo que se reemplaza la politica de
        validacion del proceso.

        Esto afecta SOLO a este proceso de PowerShell, que termina al
        acabar el script. Se hace aqui, en una herramienta de diagnostico
        ejecutada a mano contra la propia maquina, y en ningun caso en el
        codigo de la aplicacion.
    #>
    if (-not ('PoliticaCertificadoDespliegue' -as [type])) {
        Add-Type -TypeDefinition @'
using System.Net;
using System.Security.Cryptography.X509Certificates;

public class PoliticaCertificadoDespliegue : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) {
        return true;
    }
}
'@
    }
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object PoliticaCertificadoDespliegue

    # TLS 1.2 explicito: .NET Framework 4.x negocia TLS 1.0 por omision y
    # un Apache moderno lo rechaza, lo que se veria como "conexion cerrada
    # de forma inesperada" y despistaria por completo.
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
}

function Invocar-Web {
    <#
        Envoltorio de Invoke-WebRequest que devuelve siempre un objeto con
        el codigo de estado, incluso cuando la respuesta es un error HTTP.
        Hace falta porque con -ErrorAction Stop un 401 lanza excepcion, y
        aqui un 401 es justamente el resultado esperado de una prueba.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Url,
        [string] $Metodo = 'GET',
        [string] $Cuerpo = '',
        [int]    $TiempoLimite = 20
    )

    $parametros = @{
        Uri             = $Url
        Method          = $Metodo
        TimeoutSec      = $TiempoLimite
        UseBasicParsing = $true
        ErrorAction     = 'Stop'
    }
    if ($Cuerpo -ne '') {
        $parametros['Body'] = $Cuerpo
        $parametros['ContentType'] = 'application/json'
    }

    try {
        $respuesta = Invoke-WebRequest @parametros
        $cookies = ''
        if ($respuesta.Headers.ContainsKey('Set-Cookie')) {
            $cookies = ($respuesta.Headers['Set-Cookie'] -join ' | ')
        }
        return [pscustomobject]@{
            Codigo    = [int]$respuesta.StatusCode
            Contenido = $respuesta.Content
            SetCookie = $cookies
            Error     = ''
        }
    } catch [System.Net.WebException] {
        $excepcion = $_.Exception
        if ($null -ne $excepcion.Response) {
            $respuestaError = $excepcion.Response
            $codigo = [int]$respuestaError.StatusCode
            $contenido = ''
            try {
                $lector = New-Object System.IO.StreamReader($respuestaError.GetResponseStream())
                $contenido = $lector.ReadToEnd()
                $lector.Close()
            } catch {
                $contenido = ''
            }
            $cookies = ''
            try {
                $valor = $respuestaError.Headers['Set-Cookie']
                if ($null -ne $valor) { $cookies = $valor }
            } catch {
                $cookies = ''
            }
            return [pscustomobject]@{
                Codigo    = $codigo
                Contenido = $contenido
                SetCookie = $cookies
                Error     = ''
            }
        }
        return [pscustomobject]@{ Codigo = 0; Contenido = ''; SetCookie = ''; Error = $excepcion.Message }
    } catch {
        return [pscustomobject]@{ Codigo = 0; Contenido = ''; SetCookie = ''; Error = $_.Exception.Message }
    }
}

# ------------------------------------------------------------
# Inicio
# ------------------------------------------------------------
Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - verificacion del despliegue'
Write-Host '============================================================'
Write-Host ("Servicio    : {0}" -f $NombreServicio)
Write-Host ("Puerto local: {0}" -f $Puerto)
if ($UrlPublica -eq '') {
    Write-Host 'URL publica : (no indicada; se omitiran las pruebas a traves de Apache)'
} else {
    Write-Host ("URL publica : {0}" -f $UrlPublica)
}

if ($Simular) {
    Write-Host ''
    Write-Host '[SIMULACION] Comprobaciones que haria, en este orden:' -ForegroundColor Yellow
    Write-Host ("[SIMULACION]   1. Servicio {0} en estado Running." -f $NombreServicio) -ForegroundColor Yellow
    Write-Host ("[SIMULACION]   2. Puerto {0} escuchando SOLO en 127.0.0.1." -f $Puerto) -ForegroundColor Yellow
    Write-Host ("[SIMULACION]   3. GET http://127.0.0.1:{0}/salud devuelve estado ok." -f $Puerto) -ForegroundColor Yellow
    Write-Host '[SIMULACION]   4. GET de la URL publica devuelve 200 y contiene el index del SPA.' -ForegroundColor Yellow
    Write-Host '[SIMULACION]   5. GET <URL publica>/api/salud devuelve ok (valida el proxy de Apache).' -ForegroundColor Yellow
    Write-Host ("[SIMULACION]   6. GET <URL publica>/{0} devuelve 200 (valida el .htaccess)." -f $RutaProfunda) -ForegroundColor Yellow
    Write-Host '[SIMULACION]   7. POST <URL publica>/api/auth/login con credenciales invalidas devuelve 401,' -ForegroundColor Yellow
    Write-Host '[SIMULACION]      y NO 404 ni 502, que indicarian proxy mal cableado.' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '[SIMULACION] Ninguna comprobacion escribe datos. Terminado sin cambios.' -ForegroundColor Green
    exit 0
}

Permitir-CertificadoNoConfiable

# ------------------------------------------------------------
# 1. Servicio
# ------------------------------------------------------------
$servicio = Get-Service -Name $NombreServicio -ErrorAction SilentlyContinue
if ($null -eq $servicio) {
    Agregar-Resultado "Servicio $NombreServicio" 'FALLO' 'No existe.' 'Ejecute desplegar.ps1; es el paso que registra el servicio con NSSM.'
} elseif ($servicio.Status -eq 'Running') {
    Agregar-Resultado "Servicio $NombreServicio" 'OK' 'Running.'
} else {
    Agregar-Resultado "Servicio $NombreServicio" 'FALLO' "Estado: $($servicio.Status)." 'Arranquelo con "nssm start MuniData-API" y lea C:\munidata\registros\api-error.log'
}

# ------------------------------------------------------------
# 2. Puerto, y solo en loopback
# ------------------------------------------------------------
$conexiones = @(Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue)
if ($conexiones.Count -eq 0) {
    Agregar-Resultado "Puerto $Puerto" 'FALLO' 'Nadie escucha.' 'El servicio no arranco. Lea C:\munidata\registros\api-error.log'
} else {
    $direcciones = @($conexiones | ForEach-Object { $_.LocalAddress } | Sort-Object -Unique)
    $expuestas = @($direcciones | Where-Object { $_ -ne '127.0.0.1' -and $_ -ne '::1' })
    if ($expuestas.Count -eq 0) {
        Agregar-Resultado "Puerto $Puerto solo en loopback" 'OK' ("Escucha en: " + ($direcciones -join ', '))
    } else {
        $mensaje = 'Tambien escucha en ' + ($expuestas -join ', ') + ', con lo que la API queda accesible sin pasar por Apache.'
        Agregar-Resultado "Puerto $Puerto solo en loopback" 'FALLO' $mensaje 'Compruebe HOST_ESCUCHA=127.0.0.1 en .env.produccion y reinicie el servicio.'
    }
}

# ------------------------------------------------------------
# 3. API directa
# ------------------------------------------------------------
$respuesta = Invocar-Web -Url ("http://127.0.0.1:{0}/salud" -f $Puerto)
if ($respuesta.Codigo -eq 200 -and $respuesta.Contenido -match '"estado"\s*:\s*"ok"') {
    Agregar-Resultado 'GET /salud (directo)' 'OK' 'estado ok, base de datos ok.'
} elseif ($respuesta.Codigo -eq 503) {
    Agregar-Resultado 'GET /salud (directo)' 'FALLO' '503: la API responde pero no alcanza la base de datos.' 'Revise BD_* en .env.produccion y que el servicio de MySQL este corriendo.'
} elseif ($respuesta.Codigo -eq 0) {
    Agregar-Resultado 'GET /salud (directo)' 'FALLO' ("Sin respuesta: " + $respuesta.Error) 'El proceso no esta atendiendo. Lea C:\munidata\registros\api-error.log'
} else {
    Agregar-Resultado 'GET /salud (directo)' 'FALLO' ("Codigo " + $respuesta.Codigo) 'Respuesta inesperada; revise el log del servicio.'
}

# ------------------------------------------------------------
# Pruebas a traves de Apache
# ------------------------------------------------------------
if ($UrlPublica -eq '') {
    foreach ($pendiente in @('Frontend publico', 'GET /api/salud (por Apache)', 'Ruta profunda del SPA', 'POST /api/auth/login invalido')) {
        Agregar-Resultado $pendiente 'OMITIDA' 'No se indico -UrlPublica.' 'Vuelva a ejecutar pasando -UrlPublica con la direccion real.'
    }
} else {
    $base = $UrlPublica.TrimEnd('/')

    # 4. Frontend
    $respuesta = Invocar-Web -Url ($base + '/')
    if ($respuesta.Codigo -eq 200 -and $respuesta.Contenido -match '<div id="app"') {
        Agregar-Resultado 'Frontend publico' 'OK' '200 y contiene el contenedor del SPA.'
    } elseif ($respuesta.Codigo -eq 200) {
        Agregar-Resultado 'Frontend publico' 'FALLO' '200 pero el contenido no parece el index del sistema.' 'Puede estar sirviendose otra carpeta. Revise el <Directory> de munidata.conf y que desplegar.ps1 publicara en la ruta correcta.'
    } elseif ($respuesta.Codigo -eq 403) {
        Agregar-Resultado 'Frontend publico' 'FALLO' '403 Forbidden.' 'Falta "Require all granted" en el <Directory> de la carpeta, o Apache no tiene permiso de lectura sobre ella.'
    } elseif ($respuesta.Codigo -eq 404) {
        Agregar-Resultado 'Frontend publico' 'FALLO' '404.' 'La carpeta publicada no esta donde Apache la busca. Compare -RutaHtdocs de desplegar.ps1 con el DocumentRoot de httpd.conf.'
    } else {
        $detalle = "Codigo " + $respuesta.Codigo
        if ($respuesta.Error -ne '') { $detalle = $respuesta.Error }
        Agregar-Resultado 'Frontend publico' 'FALLO' $detalle 'Compruebe que Apache esta corriendo y que la URL publica es correcta.'
    }

    # 5. Proxy de la API
    $respuesta = Invocar-Web -Url ($base + '/api/salud')
    if ($respuesta.Codigo -eq 200 -and $respuesta.Contenido -match '"estado"\s*:\s*"ok"') {
        Agregar-Resultado 'GET /api/salud (por Apache)' 'OK' 'El proxy llega al backend.'
    } elseif ($respuesta.Codigo -eq 502 -or $respuesta.Codigo -eq 503) {
        Agregar-Resultado 'GET /api/salud (por Apache)' 'FALLO' ("Codigo " + $respuesta.Codigo + ": Apache no pudo hablar con el backend.") 'El servicio no esta escuchando en el puerto del ProxyPass, o falta mod_proxy_http. Compruebe "httpd -M".'
    } elseif ($respuesta.Codigo -eq 404) {
        Agregar-Resultado 'GET /api/salud (por Apache)' 'FALLO' '404: Apache no esta proxeando esta ruta.' 'Falta el Include de munidata.conf, o el ProxyPass no coincide con la ruta publica. Valide con "httpd -t" y reinicie Apache.'
    } elseif ($respuesta.Codigo -eq 200) {
        Agregar-Resultado 'GET /api/salud (por Apache)' 'FALLO' '200 pero el cuerpo no es el del endpoint de salud.' 'Probablemente el .htaccess esta desviando /api hacia index.html. Compruebe la regla "RewriteRule ^api(/|$) - [L]".'
    } else {
        $detalle = "Codigo " + $respuesta.Codigo
        if ($respuesta.Error -ne '') { $detalle = $respuesta.Error }
        Agregar-Resultado 'GET /api/salud (por Apache)' 'FALLO' $detalle 'Revise el error_log de Apache.'
    }

    # 6. Ruta profunda del SPA
    $respuesta = Invocar-Web -Url ($base + '/' + $RutaProfunda.TrimStart('/'))
    if ($respuesta.Codigo -eq 200 -and $respuesta.Contenido -match '<div id="app"') {
        Agregar-Resultado 'Ruta profunda del SPA' 'OK' ("/{0} devuelve el index; el .htaccess funciona." -f $RutaProfunda)
    } elseif ($respuesta.Codigo -eq 404) {
        $mensaje = 'Apache no aplica el fallback a index.html.'
        $revisar = 'Falta AllowOverride All en el <Directory>, o mod_rewrite no esta cargado, o el RewriteBase del .htaccess no coincide con la ruta publica.'
        Agregar-Resultado 'Ruta profunda del SPA' 'FALLO' $mensaje $revisar
    } else {
        $detalle = "Codigo " + $respuesta.Codigo
        if ($respuesta.Error -ne '') { $detalle = $respuesta.Error }
        Agregar-Resultado 'Ruta profunda del SPA' 'FALLO' $detalle 'Revise el .htaccess publicado y el error_log de Apache.'
    }

    # 7. Login con credenciales invalidas
    # Es la prueba que demuestra que el cableado completo funciona: la
    # peticion atraviesa Apache, llega a Nest, pasa por el ValidationPipe
    # y la logica de autenticacion, y vuelve con el error de negocio
    # correcto. Un 404 o un 502 aqui serian problema de proxy, no de
    # credenciales.
    $cuerpo = '{"correo":"verificacion.despliegue@ejemplo.invalid","contrasena":"ContrasenaDeliberadamenteIncorrecta#1"}'
    $respuesta = Invocar-Web -Url ($base + '/api/auth/login') -Metodo 'POST' -Cuerpo $cuerpo

    if ($respuesta.Codigo -eq 401) {
        $detalle = '401, que es lo correcto: la API rechazo las credenciales.'
        if ($respuesta.SetCookie -ne '') {
            $detalle += ' La respuesta trae Set-Cookie.'
        } else {
            $detalle += ' Sin Set-Cookie, como corresponde a un login fallido.'
        }
        Agregar-Resultado 'POST /api/auth/login invalido' 'OK' $detalle
    } elseif ($respuesta.Codigo -eq 404) {
        Agregar-Resultado 'POST /api/auth/login invalido' 'FALLO' '404: la peticion no llego al backend.' 'El ProxyPass no cubre esta ruta, o el .htaccess la desvio. Compruebe el Include de munidata.conf.'
    } elseif ($respuesta.Codigo -eq 502) {
        Agregar-Resultado 'POST /api/auth/login invalido' 'FALLO' '502: Apache no alcanzo al backend.' 'El servicio esta caido o escucha en otro puerto que el del ProxyPass.'
    } elseif ($respuesta.Codigo -eq 429) {
        Agregar-Resultado 'POST /api/auth/login invalido' 'FALLO' '429: limitacion de tasa.' 'Espere un minuto y repita; el endpoint de login admite 10 intentos por minuto.'
    } else {
        Agregar-Resultado 'POST /api/auth/login invalido' 'FALLO' ("Codigo inesperado " + $respuesta.Codigo) 'Se esperaba 401. Revise el log del servicio.'
    }
}

# ------------------------------------------------------------
# Informe
# ------------------------------------------------------------
Write-Host ''
$resultados | Format-Table -AutoSize -Property Estado, Comprobacion, Detalle | Out-String -Width 220 | Write-Host

$fallos = @($resultados | Where-Object { $_.Estado -eq 'FALLO' })
$omitidas = @($resultados | Where-Object { $_.Estado -eq 'OMITIDA' })

Write-Host '------------------------------------------------------------'
Write-Host ("Comprobaciones: {0} total, {1} con fallo, {2} omitidas." -f $resultados.Count, $fallos.Count, $omitidas.Count)

if ($fallos.Count -gt 0) {
    Write-Host ''
    Write-Host 'Que revisar en cada fallo:' -ForegroundColor Red
    foreach ($fallo in $fallos) {
        Write-Host ''
        Write-Host (" {0}" -f $fallo.Comprobacion) -ForegroundColor Red
        Write-Host ("   Sintoma : {0}" -f $fallo.Detalle) -ForegroundColor Red
        Write-Host ("   Revisar : {0}" -f $fallo.QueRevisar) -ForegroundColor Red
    }
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host 'Todas las comprobaciones automaticas pasaron.' -ForegroundColor Green
Write-Host 'Haga ahora la prueba de humo manual de DESPLIEGUE.md, seccion 8.' -ForegroundColor Green
exit 0
