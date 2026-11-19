@echo off
rem 一键构建物归处 debug APK
rem JDK/SDK 路径读取顺序：环境变量 > .env（JAVA_HOME / ANDROID_HOME）
setlocal

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%~A"=="JAVA_HOME" if not defined JAVA_HOME set "JAVA_HOME=%%~B"
    if /i "%%~A"=="ANDROID_SDK_ROOT" if not defined ANDROID_HOME set "ANDROID_HOME=%%~B"
    if /i "%%~A"=="ANDROID_HOME" if not defined ANDROID_HOME set "ANDROID_HOME=%%~B"
  )
)

if not defined JAVA_HOME (
  echo [错误] 未配置 JAVA_HOME：请设置环境变量，或在 .env 中写入 JAVA_HOME=...
  exit /b 1
)
if not defined ANDROID_HOME (
  echo [错误] 未配置 ANDROID_HOME：请设置环境变量，或在 .env 中写入 ANDROID_HOME=...
  exit /b 1
)

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
