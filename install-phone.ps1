$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw "Android Platform Tools were not found. Install them, add adb to PATH, then reopen PowerShell. See PHONE-SETUP.md."
}

$devices = @(adb devices | Select-String "`tdevice$")
if ($devices.Count -ne 1) {
    throw "Connect exactly one authorized Android phone with Wireless debugging, then run this script again."
}
$deviceId = ($devices[0].Line -split '\s+')[0]
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { throw "Node.js 20 or later was not found. Install Node.js, then reopen PowerShell." }

$previousGradleHome = $env:GRADLE_USER_HOME
$env:GRADLE_USER_HOME = Join-Path $root '.gradle-cache'
Push-Location $root
try {
    & $npm.Source run android:sync
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the Android app.' }

    Push-Location (Join-Path $root 'android')
    try {
        & .\gradlew.bat assembleDebug
        if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    } finally {
        Pop-Location
    }

    $apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
    & adb -s $deviceId install -r $apk
    if ($LASTEXITCODE -ne 0) { throw 'Could not install FieldStamp on the phone.' }
    & adb -s $deviceId shell am force-stop com.fieldstamp.app
    & adb -s $deviceId shell monkey -p com.fieldstamp.app 1
    if ($LASTEXITCODE -ne 0) { throw 'FieldStamp installed, but Android could not launch it.' }
} finally {
    if ($null -eq $previousGradleHome) {
        Remove-Item Env:GRADLE_USER_HOME -ErrorAction SilentlyContinue
    } else {
        $env:GRADLE_USER_HOME = $previousGradleHome
    }
    Pop-Location
}
