@echo off
rem Compila InteraktikInstaller.exe (instalador de GTA V + Minecraft) con el compilador de C# que trae Windows (.NET Framework 4), sin instalar nada.
rem Incluye dentro:
rem   frontend\downloads\InteraktikGTA.dll   (compilalo antes con gta-mod\build.cmd)
rem   frontend\downloads\InteraktikMod.jar   (minecraft-mod, ver su README)
rem   frontend\downloads\InteraktikCubo.jar  (minecraft-cube-mod, ver su README)
rem El resultado se copia a frontend\downloads para que la plataforma lo ofrezca.
rem   build.cmd           instalador final (pide permisos de administrador)
rem   build.cmd test      igual pero sin pedir administrador (para pruebas con carpetas de prueba)
rem Al terminar (build.cmd normal) genera frontend\downloads\installer.json: asi los instaladores ya repartidos se actualizan solos.
setlocal
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe

set DL=%~dp0..\frontend\downloads
set MOD=%DL%\InteraktikGTA.dll
set MCMOD=%DL%\InteraktikMod.jar
set MCCUBO=%DL%\InteraktikCubo.jar
if not exist "%MOD%" (
  echo Falta %MOD% - compila primero el mod con gta-mod\build.cmd
  exit /b 1
)
if not exist "%MCMOD%" (
  echo Falta %MCMOD% - compila minecraft-mod ^(gradle build^) y copialo a frontend\downloads
  exit /b 1
)
set CUBORES=
if exist "%MCCUBO%" (
  set CUBORES=/resource:"%MCCUBO%",InteraktikCubo.jar
) else (
  echo AVISO: falta %MCCUBO% - el instalador saldra SIN el mod del Cubo Gigante ^(compila minecraft-cube-mod y vuelve a ejecutar esto^)
)

rem Numero de version = fecha y hora de la compilacion (el instalador compara este numero con installer.json)
for /f %%v in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMddHHmm"') do set BUILDVER=%%v
> "%~dp0BuildInfo.generated.cs" echo namespace InteraktikGtaInstaller { static class BuildInfo { public const long Version = %BUILDVER%L; } }

set MANIFEST=/win32manifest:"%~dp0app.manifest"
set OUT=%DL%\InteraktikInstaller.exe
if /i "%~1"=="test" (
  set MANIFEST=
  set OUT=%~dp0InteraktikInstaller.test.exe
)

"%CSC%" /nologo /target:winexe /optimize+ /out:"%OUT%" %MANIFEST% /win32icon:"%~dp0interaktik.ico" ^
  /resource:"%MOD%",InteraktikGTA.dll /resource:"%MCMOD%",InteraktikMod.jar %CUBORES% ^
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ^
  /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll ^
  "%~dp0InstalarInteraktikGTA.cs" "%~dp0MinecraftInstaller.cs" "%~dp0MainForm.Minecraft.cs" "%~dp0Updater.cs" "%~dp0AssemblyInfo.cs" "%~dp0BuildInfo.generated.cs"
if errorlevel 1 exit /b 1
echo Listo: %OUT% ^(version %BUILDVER%^)
if /i not "%~1"=="test" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-manifest.ps1"
