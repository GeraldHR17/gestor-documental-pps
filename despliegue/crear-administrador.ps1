<#
.SINOPSIS
    Crea el usuario administrador inicial del sistema en produccion.

.DESCRIPCION
    Pide correo, nombre y contrasena, y ejecuta
    dist/scripts/crear-administrador.js del backend publicado.

    La contrasena se pide con Read-Host -AsSecureString (no se ve al
    escribirla) y se entrega al proceso hijo UNICAMENTE como variable de
    entorno de ese proceso. No va por la linea de comandos, que seria
    visible para cualquier usuario del sistema en la lista de procesos, ni
    se escribe en ningun archivo.

    Hace falta porque el script SQL 06-usuario-superadministrador.sql crea
    una cuenta con la contrasena publicada en el script 06. En produccion
    ese script no se aplica y la primera cuenta se crea con este.

    Es idempotente: si ya existe un usuario con ese correo, no modifica
    nada.

.PARAMETER RutaBackend
    Carpeta del backend publicado en la VM.

.PARAMETER RutaEntorno
    Archivo .env.produccion con las variables de conexion a la base.

.PARAMETER Rol
    Rol que se asignara.

.PARAMETER Identificacion
    Numero de identificacion del usuario.

.PARAMETER Simular
    Imprime lo que haria sin pedir nada ni tocar la base de datos.

.EJEMPLO
    powershell -ExecutionPolicy Bypass -File .\despliegue\crear-administrador.ps1
#>

[CmdletBinding()]
param(
    [string] $RutaBackend = 'C:\munidata\backend',
    [string] $RutaEntorno = 'C:\munidata\config\.env.produccion',
    [string] $Rol = 'Superadministrador',
    [string] $Identificacion = '',
    [switch] $Simular
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptNode = Join-Path $RutaBackend 'dist\scripts\crear-administrador.js'

function Convertir-ASecreto {
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

function Leer-LineasDeArchivo {
    <#
        Devuelve las lineas de un archivo de texto decodificado segun su
        marca de orden de bytes, sin el BOM y sin el \r del final de
        linea.

        No se usa Get-Content -Encoding UTF8 porque fija la codificacion:
        el .env.produccion se edita a mano en la VM y el Bloc de notas de
        Windows Server 2016 puede guardarlo como UTF-8 con BOM, como
        "Unicode" (UTF-16) o como ANSI. Leido con la codificacion
        equivocada, un archivo correcto parece no tener ninguna variable
        y este script se detendria diciendo que falta BD_HOST.

        Es la misma funcion que usa desplegar.ps1: cada script del
        despliegue se ejecuta por separado y no comparte modulo.
    #>
    param([Parameter(Mandatory = $true)][string] $Ruta)

    $bytes = [System.IO.File]::ReadAllBytes($Ruta)
    if ($bytes.Length -eq 0) { return [string[]] @('') }

    $texto = ''
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        $texto = [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
        $texto = [System.Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2)
    } elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $texto = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    } else {
        try {
            $utf8Estricto = New-Object System.Text.UTF8Encoding($false, $true)
            $texto = $utf8Estricto.GetString($bytes)
        } catch {
            $texto = [System.Text.Encoding]::Default.GetString($bytes)
        }
    }

    return [string[]] @($texto -split "`r?`n")
}

Write-Host ''
Write-Host '============================================================'
Write-Host ' Muni Data - creacion del administrador inicial'
Write-Host '============================================================'
Write-Host ("Backend : {0}" -f $RutaBackend)
Write-Host ("Entorno : {0}" -f $RutaEntorno)
Write-Host ("Rol     : {0}" -f $Rol)
Write-Host ''
Write-Host 'NOTA: el rol se llama "Superadministrador". El modelo no tiene un rol'
Write-Host '      "Administrador TI"; Superadministrador es el equivalente, y el'
Write-Host '      unico con permiso para crear las demas cuentas.'

if ($Simular) {
    Write-Host ''
    Write-Host '[SIMULACION] En una ejecucion real este script:' -ForegroundColor Yellow
    Write-Host '[SIMULACION]   1. Pediria el correo y el nombre completo.' -ForegroundColor Yellow
    Write-Host '[SIMULACION]   2. Pediria la contrasena dos veces, sin mostrarla.' -ForegroundColor Yellow
    Write-Host ('[SIMULACION]   3. Leeria las variables BD_* de {0}.' -f $RutaEntorno) -ForegroundColor Yellow
    Write-Host ('[SIMULACION]   4. Ejecutaria node "{0}"' -f $scriptNode) -ForegroundColor Yellow
    Write-Host '[SIMULACION]      pasando ADMIN_CORREO, ADMIN_NOMBRE y ADMIN_CONTRASENA' -ForegroundColor Yellow
    Write-Host '[SIMULACION]      como variables de entorno SOLO de ese proceso hijo.' -ForegroundColor Yellow
    Write-Host '[SIMULACION]   5. No imprimiria la contrasena en ningun momento.' -ForegroundColor Yellow
    Write-Host ''
    if (Test-Path -LiteralPath $scriptNode) {
        Write-Host '[SIMULACION] El script de Node existe en la ruta esperada.' -ForegroundColor Green
    } else {
        Write-Host ('[SIMULACION] Todavia no existe {0}:' -f $scriptNode) -ForegroundColor Yellow
        Write-Host '[SIMULACION] es normal antes de ejecutar desplegar.ps1.' -ForegroundColor Yellow
    }
    Write-Host ''
    Write-Host '[SIMULACION] Terminado sin cambios.' -ForegroundColor Green
    exit 0
}

try {
    if ($null -eq (Get-Command -Name 'node.exe' -ErrorAction SilentlyContinue)) {
        throw 'No se encontro node.exe en el PATH.'
    }
    if (-not (Test-Path -LiteralPath $scriptNode)) {
        throw "No existe $scriptNode. Ejecute primero desplegar.ps1."
    }
    if (-not (Test-Path -LiteralPath $RutaEntorno)) {
        throw "No existe $RutaEntorno. Ejecute primero desplegar.ps1."
    }

    # ----------------------------------------------------------
    # Datos del usuario
    # ----------------------------------------------------------
    Write-Host ''
    $correo = (Read-Host -Prompt 'Correo del administrador').Trim()
    if ($correo -eq '' -or $correo -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        throw 'El correo no tiene un formato valido.'
    }

    $nombre = (Read-Host -Prompt 'Nombre completo').Trim()
    if ($nombre -eq '') {
        throw 'El nombre completo no puede estar vacio.'
    }

    Write-Host ''
    Write-Host 'La contrasena no se mostrara mientras la escribe.'
    $contrasena = Read-Host -Prompt 'Contrasena' -AsSecureString
    $confirmacion = Read-Host -Prompt 'Repitala para confirmar' -AsSecureString

    $texto = Convertir-ASecreto -Segura $contrasena
    $textoConfirmado = Convertir-ASecreto -Segura $confirmacion

    if ($texto -ne $textoConfirmado) {
        throw 'Las dos contrasenas no coinciden.'
    }
    # Mismas exigencias que el DTO de la aplicacion, para que la cuenta
    # creada aqui cumpla la misma politica que las creadas desde la
    # interfaz.
    if ($texto.Length -lt 12) {
        throw 'La contrasena debe tener al menos 12 caracteres.'
    }
    if ($texto -notmatch '[A-Z]' -or $texto -notmatch '[a-z]' -or $texto -notmatch '[0-9]') {
        throw 'La contrasena debe incluir al menos una mayuscula, una minuscula y un numero.'
    }

    # ----------------------------------------------------------
    # Variables de conexion
    # ----------------------------------------------------------
    # El script de Node las necesita para conectarse a la base. Se leen
    # del .env.produccion y se pasan al proceso hijo, igual que hace el
    # servicio.
    $variablesEntorno = @{}
    foreach ($linea in (Leer-LineasDeArchivo -Ruta $RutaEntorno)) {
        # TrimStart del BOM antes del Trim: U+FEFF no cuenta como espacio
        # en blanco, asi que Trim() no lo quita, y delante del nombre de
        # la primera variable la vuelve irreconocible.
        $textoLinea = $linea.TrimStart([char]0xFEFF).Trim()
        if ($textoLinea -eq '' -or $textoLinea.StartsWith('#')) { continue }
        $posicion = $textoLinea.IndexOf('=')
        if ($posicion -lt 1) { continue }
        $variablesEntorno[$textoLinea.Substring(0, $posicion).Trim()] = $textoLinea.Substring($posicion + 1)
    }

    foreach ($requerida in @('BD_HOST', 'BD_PUERTO', 'BD_NOMBRE', 'BD_USUARIO', 'BD_CONTRASENA', 'BCRYPT_SALT_ROUNDS')) {
        if (-not $variablesEntorno.ContainsKey($requerida)) {
            throw "Falta la variable $requerida en $RutaEntorno"
        }
    }

    Write-Host ''
    Write-Host 'Creando el usuario...'

    # ----------------------------------------------------------
    # Ejecucion
    # ----------------------------------------------------------
    # Las variables se definen en el entorno de ESTE proceso justo antes
    # de lanzar el hijo, que las hereda, y se borran despues. Es la unica
    # forma en Windows PowerShell de pasar un secreto a un proceso hijo
    # sin que aparezca en la linea de comandos.
    $previas = @{}
    # Se restauran TODAS las variables que se definan, no solo las
    # ADMIN_*: en el entorno del proceso tambien entran BD_CONTRASENA,
    # SMTP_PASS y los secretos JWT del archivo de produccion, y antes se
    # quedaban ahi al terminar, de modo que cualquier cosa que se lanzara
    # despues desde esa misma consola los heredaba.
    $definidas = @('ADMIN_CORREO', 'ADMIN_NOMBRE', 'ADMIN_CONTRASENA', 'ADMIN_ROL', 'ADMIN_IDENTIFICACION')
    $definidas += @($variablesEntorno.Keys | Where-Object { $definidas -notcontains $_ })

    try {
        foreach ($clave in $definidas) {
            $previas[$clave] = [Environment]::GetEnvironmentVariable($clave, 'Process')
        }
        foreach ($clave in $variablesEntorno.Keys) {
            [Environment]::SetEnvironmentVariable($clave, $variablesEntorno[$clave], 'Process')
        }

        [Environment]::SetEnvironmentVariable('ADMIN_CORREO', $correo, 'Process')
        [Environment]::SetEnvironmentVariable('ADMIN_NOMBRE', $nombre, 'Process')
        [Environment]::SetEnvironmentVariable('ADMIN_CONTRASENA', $texto, 'Process')
        [Environment]::SetEnvironmentVariable('ADMIN_ROL', $Rol, 'Process')
        if ($Identificacion -ne '') {
            [Environment]::SetEnvironmentVariable('ADMIN_IDENTIFICACION', $Identificacion, 'Process')
        }

        $anterior = (Get-Location).Path
        try {
            Set-Location -LiteralPath $RutaBackend
            & node.exe $scriptNode
            $codigo = $LASTEXITCODE
        } finally {
            Set-Location -LiteralPath $anterior
        }

        if ($codigo -ne 0) {
            throw "El script de creacion termino con codigo $codigo (ver el mensaje anterior)."
        }
    } finally {
        # Se limpian siempre, tambien si fallo: la contrasena no debe
        # quedar en el entorno de la sesion de PowerShell.
        foreach ($clave in $definidas) {
            [Environment]::SetEnvironmentVariable($clave, $previas[$clave], 'Process')
        }
    }

    Write-Host ''
    Write-Host 'Listo. Inicie sesion en el sistema con ese correo y esa contrasena.' -ForegroundColor Green
    Write-Host 'Desde esa cuenta ya puede crear las demas desde Gestion de usuarios.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Recuerde: crear un usuario desde la aplicacion NO envia ningun correo.' -ForegroundColor Yellow
    Write-Host 'La contrasena temporal se la debe entregar a cada persona por otro medio.' -ForegroundColor Yellow
    exit 0

} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
