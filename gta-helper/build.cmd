@echo off
rem Compila InteraktikGTA.exe con el compilador de C# que ya trae Windows (.NET Framework 4), sin instalar nada.
rem El resultado se copia a frontend\downloads para que la plataforma lo ofrezca.
setlocal
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe

"%CSC%" /nologo /target:winexe /optimize+ /out:"%~dp0..\frontend\downloads\InteraktikGTA.exe" ^
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ^
  "%~dp0InteraktikGTA.cs"
if errorlevel 1 exit /b 1
echo Listo: frontend\downloads\InteraktikGTA.exe
