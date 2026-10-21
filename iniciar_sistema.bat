@echo off
title Sistema Interno de Onboarding Contabil
echo ========================================================
echo  INICIANDO SISTEMA DE ONBOARDING CONTABIL (USO INTERNO)
echo ========================================================
echo.
echo Verificando Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado neste computador!
    pause
    exit /b
)

echo Iniciando servidor local na porta 3000...
start http://localhost:3000
node server.js
pause
