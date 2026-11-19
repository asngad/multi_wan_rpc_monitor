@echo off
title Multi-WAN Monitoring - Cloudflare Public Tunnel
echo ========================================================
echo Membuka Jalur Publik Cloudflare Tunnel untuk Port 4000...
echo URL Publik HTTPS akan muncul di bawah ini (trycloudflare.com)
echo ========================================================
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:4000
pause
