@echo off
chcp 65001 > nul
title Parar Sistema Josana Mota Contabilidade
echo ==========================================================
echo   ENCERRANDO SISTEMA E DESCONECTANDO TUNEL ONLINE
echo ==========================================================
echo.
echo Finalizando cloudflared...
taskkill /f /im cloudflared.exe > nul 2>&1
echo Finalizando processos node...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a > nul 2>&1

echo.
echo Tudo encerrado com sucesso!
echo O sistema voltou ao estado 100%% offline e local.
echo.
pause
