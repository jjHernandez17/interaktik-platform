@echo off
rem Compila InteraktikGTA.dll (mod de ScriptHookVDotNet v3) con el compilador de C# que trae Windows.
rem Necesita ScriptHookVDotNet3.dll solo como referencia: bajalo de
rem https://github.com/scripthookvdotnet/scripthookvdotnet/releases y pasa su ruta como primer argumento.
rem   build.cmd C:\ruta\a\ScriptHookVDotNet3.dll
rem El resultado se copia a frontend\downloads para que la plataforma lo ofrezca.
setlocal
if "%~1"=="" (
  echo Falta la ruta de ScriptHookVDotNet3.dll
  exit /b 1
)
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe

"%CSC%" /nologo /target:library /optimize+ /out:"%~dp0..\frontend\downloads\InteraktikGTA.dll" ^
  /reference:"%~1" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ^
  "%~dp0InteraktikGTA.cs"
if errorlevel 1 exit /b 1
echo Listo: frontend\downloads\InteraktikGTA.dll
