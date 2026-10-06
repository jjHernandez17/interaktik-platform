@echo off
rem Compila InstalarInteraktikGTA.exe con el compilador de C# que trae Windows (.NET Framework 4), sin instalar nada.
rem Incluye dentro frontend\downloads\InteraktikGTA.dll (compilalo antes con gta-mod\build.cmd).
rem El resultado se copia a frontend\downloads para que la plataforma lo ofrezca.
rem   build.cmd           instalador final (pide permisos de administrador)
rem   build.cmd test      igual pero sin pedir administrador (para pruebas con carpetas de prueba)
setlocal
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe

set MOD=%~dp0..\frontend\downloads\InteraktikGTA.dll
if not exist "%MOD%" (
  echo Falta %MOD% - compila primero el mod con gta-mod\build.cmd
  exit /b 1
)

set MANIFEST=/win32manifest:"%~dp0app.manifest"
set OUT=%~dp0..\frontend\downloads\InstalarInteraktikGTA.exe
if /i "%~1"=="test" (
  set MANIFEST=
  set OUT=%~dp0InstalarInteraktikGTA.test.exe
)

"%CSC%" /nologo /target:winexe /optimize+ /out:"%OUT%" %MANIFEST% /resource:"%MOD%",InteraktikGTA.dll ^
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ^
  /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ^
  "%~dp0InstalarInteraktikGTA.cs"
if errorlevel 1 exit /b 1
echo Listo: %OUT%
