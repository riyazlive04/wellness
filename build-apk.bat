@echo off
REM Detached release build. Launched via Task Scheduler so it survives the
REM parent console being closed or signalled.
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
cd /d D:\dev\sirah-mobile\android
call gradlew.bat assembleRelease --no-daemon > D:\dev\sirah-mobile\apk-build.log 2>&1
echo EXITCODE=%ERRORLEVEL% >> D:\dev\sirah-mobile\apk-build.log
