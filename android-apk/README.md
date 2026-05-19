# SRKR Invoice APK

This Android project wraps the offline invoice web app inside a WebView and bundles all HTML, CSS, JavaScript, and image assets inside the APK.

## Build APK

Install Android Studio, then open this `android-apk` folder and run:

```powershell
.\gradlew.bat assembleDebug
```

The APK will be created at:

```text
app\build\outputs\apk\debug\app-debug.apk
```

Because this machine currently does not have Java, Gradle, or Android SDK installed, the APK cannot be compiled here yet.

Android Studio can also build it from the menu:

```text
Build > Build Bundle(s) / APK(s) > Build APK(s)
```
