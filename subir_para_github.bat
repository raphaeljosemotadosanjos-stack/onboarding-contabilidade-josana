@echo off
chcp 65001 > nul
title Conectar Sistema ao GitHub para Render
echo ==========================================================
echo   ENVIAR SISTEMA PARA O GITHUB (PARA HOSPEDAGEM NO RENDER)
echo ==========================================================
echo.

"%~dp0mingit\cmd\git.exe" remote get-url origin > nul 2>&1
if %errorlevel% == 0 (
    echo Repositório remoto já configurado!
    echo Enviando atualizações mais recentes para o GitHub...
    "%~dp0mingit\cmd\git.exe" push origin main
    goto FIM
)

set /p REPO_URL="Cole a URL do seu repositório no GitHub (ex: https://github.com/seu-usuario/onboarding-contabilidade-josana.git): "

if "%REPO_URL%"=="" (
    echo Nenhuma URL informada. Operacao cancelada.
    pause
    exit /b
)

echo.
echo Conectando repositório remoto...
"%~dp0mingit\cmd\git.exe" remote remove origin > nul 2>&1
"%~dp0mingit\cmd\git.exe" remote add origin %REPO_URL%

echo Enviando arquivos para a branch main...
"%~dp0mingit\cmd\git.exe" push -u origin main

:FIM
echo.
echo ==========================================================
echo Pronto! Arquivos enviados ao GitHub com sucesso.
echo O Render detectará e fará o deploy automático!
echo ==========================================================
pause
