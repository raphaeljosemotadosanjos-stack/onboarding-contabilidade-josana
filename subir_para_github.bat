@echo off
chcp 65001 > nul
title Conectar Sistema ao GitHub para Render
echo ==========================================================
echo   ENVIAR SISTEMA PARA O GITHUB (PARA HOSPEDAGEM NO RENDER)
echo ==========================================================
echo.
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

echo.
echo ==========================================================
echo Pronto! Arquivos enviados ao GitHub com sucesso.
echo Agora no Render.com basta selecionar este repositório!
echo ==========================================================
pause
