@echo off
title Kashi Rivaz — Website Server
color 0A
echo.
echo  ================================================
echo   KASHI RIVAZ — Starting Website Server
echo  ================================================
echo.

:: Use local Node.js (portable, no install needed)
set NODE_EXE=%~dp0nodejs\node.exe

:: Check if system Node.js exists first, else fall back to local
where node >nul 2>&1
if %errorlevel% == 0 (
    set NODE_EXE=node
    echo  [OK] Using system Node.js
) else if exist "%NODE_EXE%" (
    echo  [OK] Using local Node.js (nodejs folder)
) else (
    echo  ERROR: Node.js not found.
    echo  A "nodejs" folder should be in this project directory.
    pause
    exit
)

echo  [OK] Starting Kashi Rivaz server...
echo.
echo  ================================================
echo   Website:  http://localhost:3000
echo   Orders:   http://localhost:3000/all-orders.html
echo   Admin:    http://localhost:3000/adminaccess
echo   Login:    admin / KashiRivaz@Admin2024!
echo  ================================================
echo.
echo  Press Ctrl+C to stop the server.
echo.

"%NODE_EXE%" server.js

echo.
echo  Server stopped.
pause
