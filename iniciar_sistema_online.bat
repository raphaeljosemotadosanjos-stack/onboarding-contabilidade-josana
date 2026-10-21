@echo off
chcp 65001 > nul
title Josana Mota Contabilidade - Servidor Online (Cloudflare HTTPS)
echo ==========================================================
echo   JOSANA MOTA CONTABILIDADE - SISTEMA ONLINE SEGURO
echo ==========================================================
echo.
echo Iniciando servidor local na porta 3000...
start /b "" node server.js

echo Conectando ao túnel seguro Cloudflare...
start /b "" "%~dp0cloudflared.exe" tunnel --url http://localhost:3000 > "%~dp0tunnel_output.log" 2>&1

echo Aguardando inicializacao (5 segundos)...
timeout /t 5 /nobreak > nul

echo.
echo ==========================================================
echo   SISTEMA ONLINE E PRONTO!
echo   Acesse de qualquer lugar pelo link seguro:
type "%~dp0tunnel_url.txt"
echo.
echo   Acesso local na máquina: http://localhost:3000
echo ==========================================================
echo Para encerrar o sistema a qualquer momento, feche esta janela ou execute 'parar_sistema.bat'.
echo.
pause
