@echo off
chcp 65001 > nul
title Enviar Sistema para o GitHub (Render)
echo ==========================================================
echo   JOSANA MOTA CONTABILIDADE - ATUALIZAR GITHUB
echo ==========================================================
echo.
echo Repositório configurado:
echo https://github.com/raphaeljosemotadosanjos-stack/onboarding-contabilidade-josana.git
echo.
echo Enviando arquivos e correções para o GitHub...
echo (Se o GitHub solicitar login no navegador, basta confirmar com 1 clique)
echo.
"%~dp0mingit\cmd\git.exe" push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ==========================================================
    echo [SUCESSO] Arquivos enviados para o GitHub com sucesso!
    echo O Render detectou a atualizacao e ja comecou a carregar.
    echo ==========================================================
) else (
    echo.
    echo ==========================================================
    echo Caso o envio nao tenha sido concluido, veja a mensagem acima.
    echo ==========================================================
)
echo.
pause
