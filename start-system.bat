@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "BACKEND=%ROOT%Backend"
set "FRONTEND=%ROOT%Frontend"
set "BACKEND_ENV=%BACKEND%\.env"
set "BACKEND_ENV_EXAMPLE=%BACKEND%\.env.example"

if not exist "%BACKEND%\package.json" (
  echo Backend folder was not found.
  pause
  exit /b 1
)

if not exist "%FRONTEND%\package.json" (
  echo Frontend folder was not found.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js LTS first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js LTS first.
  pause
  exit /b 1
)

if not exist "%BACKEND_ENV%" (
  if exist "%BACKEND_ENV_EXAMPLE%" (
    copy "%BACKEND_ENV_EXAMPLE%" "%BACKEND_ENV%" >nul
    echo Created Backend\.env from Backend\.env.example
  ) else (
    echo Backend\.env was not found.
    pause
    exit /b 1
  )
)

if not exist "%ROOT%Backup" mkdir "%ROOT%Backup"
if not exist "%BACKEND%\api-server\uploads" mkdir "%BACKEND%\api-server\uploads"

if not exist "%BACKEND%\node_modules" (
  echo Backend dependencies were not found.
  echo Run install-portable.bat once, then run this file again.
  pause
  exit /b 1
)

if not exist "%FRONTEND%\node_modules" (
  echo Frontend dependencies were not found.
  echo Run install-portable.bat once, then run this file again.
  pause
  exit /b 1
)

if not exist "%BACKEND%\api-server\dist\index.mjs" (
  echo Backend build was not found. Building backend now...
  pushd "%BACKEND%\api-server"
  call npm run build
  if errorlevel 1 (
    popd
    echo Backend build failed.
    pause
    exit /b 1
  )
  popd
)

if not exist "%FRONTEND%\dist\index.html" (
  echo Frontend build was not found. Building frontend now...
  pushd "%FRONTEND%"
  call npm run build
  if errorlevel 1 (
    popd
    echo Frontend build failed.
    pause
    exit /b 1
  )
  popd
)

start "Arabian D Backend" /D "%BACKEND%" cmd /k "npm run dev"
start "Arabian D Frontend" /D "%FRONTEND%" cmd /k "npm run dev"

echo.
echo Backend and Frontend windows were started.
echo Open the login link printed in the Frontend window.
echo Preferred login link: http://localhost:5000/login
echo If port 5000 is busy, Frontend will print another link, for example http://localhost:5001/login
echo Backend API: http://localhost:17879/api/healthz
echo.
timeout /t 3 >nul
