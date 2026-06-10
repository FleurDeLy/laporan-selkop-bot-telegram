@echo off
setlocal enabledelayedexpansion
color 0A

echo ===================================================
echo 🚀 SELKOP BOT V1.2.0 - AUTOMATED INSTALLER 🚀
echo ===================================================

:: 1. CHECK DEPENDENCIES
echo Checking dependencies...

where supabase >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Supabase CLI is not installed or not in PATH.
    echo Please install it from: https://supabase.com/docs/guides/cli
    pause
    exit /b 1
)
echo [OK] Supabase CLI found.

where deno >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Deno is not installed or not in PATH.
    echo Please install it from: https://deno.land/#installation
    pause
    exit /b 1
)
echo [OK] Deno found.

echo.
echo Step 0: Authentication
echo We need to ensure you are logged into the Supabase CLI.
call supabase login
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Supabase login failed. Please authenticate to continue.
    pause
    exit /b 1
)

echo.
echo Step 1: Link your Supabase Cloud
set /p SUPABASE_REF="> Please paste your Supabase Project Reference ID: "
if "%SUPABASE_REF%"=="" (
    color 0C
    echo [ERROR] Project Reference ID cannot be empty.
    pause
    exit /b 1
)

call supabase link --project-ref %SUPABASE_REF%
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to link Supabase project. Please check your Reference ID and permissions.
    pause
    exit /b 1
)

echo.
echo Step 2: Configure Telegram
set /p TELEGRAM_TOKEN="> Please paste your new Telegram Bot Token: "
set /p ADMIN_ID="> Please paste the Admin Chat ID: "

if "%TELEGRAM_TOKEN%"=="" (
    color 0C
    echo [ERROR] Telegram Bot Token cannot be empty.
    pause
    exit /b 1
)
if "%ADMIN_ID%"=="" (
    color 0C
    echo [ERROR] Admin Chat ID cannot be empty.
    pause
    exit /b 1
)

echo.
echo ⚙️ Installing Database Schema...
call supabase db push
if %errorlevel% neq 0 (
    color 0E
    echo [WARNING] 'supabase db push' encountered an issue or there are no migrations to push.
    echo Please verify that the database schema is properly configured.
    color 0A
) else (
    echo (Done!)
)

echo.
echo 🔒 Uploading Cloud Secrets...
call supabase secrets set TELEGRAM_BOT_TOKEN="%TELEGRAM_TOKEN%" ADMIN_CHAT_ID="%ADMIN_ID%"
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to set cloud secrets.
    pause
    exit /b 1
)
echo (Done!)

echo.
echo ☁️ Deploying Edge Functions...
call supabase functions deploy
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to deploy Edge Functions.
    pause
    exit /b 1
)
echo (Done!)

echo.
color 0A
echo ===================================================
echo ✅ INSTALLATION COMPLETE!
echo Your bot is now live.
echo ===================================================
pause
exit /b 0
