@echo off
rem Compila InteraktikRampa.dll (mod de ScriptHookVDotNet v3) con el compilador de C# que trae Windows.
rem Necesita ScriptHookVDotNet3.dll solo como referencia (esta en la carpeta de GTA V una vez instalado) y se pasa como primer argumento:
rem   build.cmd "C:\Program Files\Epic Games\GTAV\ScriptHookVDotNet3.dll"
rem El resultado se copia a frontend\downloads para que la plataforma y el instalador lo ofrezcan.
setlocal
if "%~1"=="" (
  echo Falta la ruta de ScriptHookVDotNet3.dll
  exit /b 1
)
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe

"%CSC%" /nologo /target:library /optimize+ /out:"%~dp0..\frontend\downloads\InteraktikRampa.dll" ^
  /reference:"%~1" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ^
  "%~dp0InteraktikRampa.cs"
if errorlevel 1 exit /b 1
echo Listo: frontend\downloads\InteraktikRampa.dll
