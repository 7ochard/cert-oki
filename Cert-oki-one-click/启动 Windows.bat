@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel% neq 0 (
  echo This computer does not have Python launcher installed.
  echo Please install Python 3 first, then run this file again.
  pause
  exit /b 1
)

for /f %%p in ('py -3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1', 0)); print(s.getsockname()[1]); s.close()"') do set PORT=%%p
set URL=http://127.0.0.1:%PORT%/

echo Cert-oki is starting...
echo URL: %URL%
echo Close this window to stop the app.

start "" "%URL%"
cd app
py -3 -m http.server %PORT% --bind 127.0.0.1
