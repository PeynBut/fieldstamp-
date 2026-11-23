$ErrorActionPreference = 'Stop'
$port = 8000
$root = $PSScriptRoot

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw "Android Platform Tools were not found. Install them, add adb to PATH, then reopen PowerShell. See PHONE-SETUP.md."
}

$devices = @(adb devices | Select-String "`tdevice$")
if ($devices.Count -eq 0) {
    throw "No authorized Android phone is connected to adb. Pair it with Wireless debugging first. See PHONE-SETUP.md."
}
if ($devices.Count -gt 1) {
    throw "More than one Android device is connected to adb. Disconnect the extras, then run this script again."
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\express'))) {
    throw "App dependencies are not installed. Open PowerShell in this folder and run: npm.cmd install"
}

adb reverse "tcp:$port" "tcp:$port"
if ($LASTEXITCODE -ne 0) { throw "Could not forward port $port to your phone." }

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { throw "Node.js and npm were not found. Install Node.js 20 or later, then reopen PowerShell." }

Push-Location $root
try { & $npm.Source start }
finally { Pop-Location }
