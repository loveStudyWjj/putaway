@echo off
rem 一键构建物归处 debug APK（JDK21 + Android SDK 已就绪时）
setlocal
set JAVA_HOME=C:\Program Files\Java\jdk-21
set ANDROID_HOME=C:\Android\Sdk

call npm run build || exit /b 1
call npx cap sync android || exit /b 1
cd android
call gradlew.bat assembleDebug || exit /b 1
echo.
echo ============================================
echo APK: %cd%\app\build\outputs\apk\debug\app-debug.apk
echo ============================================
copy /y app\build\outputs\apk\debug\app-debug.apk ..\wugui.apk >nul
echo 已复制到项目根目录 wugui.apk
