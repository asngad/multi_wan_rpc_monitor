@echo off
title Multi-WAN RPC Monitoring Engine - UNUGHA NOC
echo ================================================================
echo    MEMULAI SISTEM MONITORING MULTI-WAN DAN 16 LINKSYS EA7500
echo    Integrasi RPC (Remote Procedure Call) - Proposal Skripsi UNUGHA
echo ================================================================
echo.
cd /d "%~dp0"
node src/server.js
pause
