@echo off
rem Logo yardimcisini .NET Framework 4.x'in kendi derleyicisiyle x86 derler (paket yok). Cikti: cikti\logo-yardimcisi.exe ve cikti\testler.exe
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo .NET Framework 4.x derleyicisi bulunamadi: %CSC%
  exit /b 1
)
if not exist cikti mkdir cikti
set REFS=/r:System.Data.dll /r:System.Web.Extensions.dll /r:Microsoft.CSharp.dll /r:System.Core.dll /r:System.Xml.dll
"%CSC%" /nologo /platform:x86 /target:exe /warnaserror+ %REFS% /out:cikti\logo-yardimcisi.exe Temel.cs Arayuzler.cs Ayar.cs LogoXml.cs Islemler.cs HttpSunucu.cs ComLogo.cs SqlOkuma.cs Deneme.cs Program.cs || exit /b 1
"%CSC%" /nologo /platform:x86 /target:exe /warnaserror+ %REFS% /main:LogoYardimcisi.Testler /out:cikti\testler.exe *.cs || exit /b 1
echo Derlendi: cikti\logo-yardimcisi.exe
if "%1"=="test" (cikti\testler.exe || exit /b 1)
