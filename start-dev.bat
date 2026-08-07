@echo off
echo Starting mechanic chatbot...
start "Mechanic Backend" cmd /k "cd /d %~dp0backend && npm.cmd run dev"
timeout /t 2 /nobreak >nul
start "Mechanic Frontend" cmd /k "cd /d %~dp0frontend && npm.cmd run dev"
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Two terminal windows were opened. Close them to stop the app.
