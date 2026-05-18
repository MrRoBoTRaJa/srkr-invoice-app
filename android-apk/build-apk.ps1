$ErrorActionPreference = "Stop"

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
  throw "Java/JDK is not installed. Install Android Studio or JDK first."
}

if (-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
  throw "Gradle is not installed. Open this folder in Android Studio, or install Gradle."
}

if (-not ($env:ANDROID_HOME -or $env:ANDROID_SDK_ROOT)) {
  throw "Android SDK path is not set. Install Android Studio and SDK, then set ANDROID_HOME or ANDROID_SDK_ROOT."
}

gradle assembleDebug

Write-Host "APK: app\build\outputs\apk\debug\app-debug.apk"
