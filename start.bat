@echo off
title projectEL Dev Server Launcher
cls
echo ====================================================================
echo           projectEL - AI Learning Agent Launcher
echo ====================================================================
echo.
echo Scanning API keys from environment and local config...
echo.

:: ===== DeepSeek =====
if defined DEEPSEEK_API_KEY (
    echo %DEEPSEEK_API_KEY%| findstr /B "sk-ant-router" >nul 2>&1
    if errorlevel 1 (
        echo   [OK] DeepSeek       - found in system environment
        goto ds_end
    )
    echo   [skip] DeepSeek     - env var is a proxy key, checking local config
    set "DEEPSEEK_API_KEY="
)
for /f "usebackq delims=" %%k in (`node -e "try{const j=JSON.parse(require('fs').readFileSync('%~dp0.pi/auth.json','utf8'));if(j.deepseek&&j.deepseek.key)console.log(j.deepseek.key);}catch{}"`) do set "DEEPSEEK_API_KEY=%%k"
if defined DEEPSEEK_API_KEY (
    echo   [OK] DeepSeek       - found in .pi/auth.json
) else (
    echo   [--] DeepSeek       - not configured
)
:ds_end

:: ===== Anthropic =====
if defined ANTHROPIC_API_KEY (
    echo %ANTHROPIC_API_KEY%| findstr /B "sk-ant-router" >nul 2>&1
    if errorlevel 1 (
        echo   [OK] Anthropic      - found in system environment
        goto an_end
    )
    echo   [skip] Anthropic    - env var is Antigravity proxy key, not usable
    set "ANTHROPIC_API_KEY="
)
for /f "usebackq delims=" %%k in (`node -e "try{const j=JSON.parse(require('fs').readFileSync('%~dp0.pi/auth.json','utf8'));if(j.anthropic&&j.anthropic.key)console.log(j.anthropic.key);}catch{}"`) do set "ANTHROPIC_API_KEY=%%k"
if defined ANTHROPIC_API_KEY (
    echo   [OK] Anthropic      - found in .pi/auth.json
) else (
    echo   [--] Anthropic      - not configured
)
:an_end

:: ===== OpenAI =====
if defined OPENAI_API_KEY (
    echo   [OK] OpenAI         - found in system environment
    goto oa_end
)
for /f "usebackq delims=" %%k in (`node -e "try{const j=JSON.parse(require('fs').readFileSync('%~dp0.pi/auth.json','utf8'));if(j.openai&&j.openai.key)console.log(j.openai.key);}catch{}"`) do set "OPENAI_API_KEY=%%k"
if defined OPENAI_API_KEY (
    echo   [OK] OpenAI         - found in .pi/auth.json
) else (
    echo   [--] OpenAI         - not configured
)
:oa_end

:: ===== Google Gemini =====
if defined GEMINI_API_KEY (
    echo   [OK] Google Gemini  - found in system environment
    goto go_end
)
for /f "usebackq delims=" %%k in (`node -e "try{const j=JSON.parse(require('fs').readFileSync('%~dp0.pi/auth.json','utf8'));if(j.google&&j.google.key)console.log(j.google.key);}catch{}"`) do set "GEMINI_API_KEY=%%k"
if defined GEMINI_API_KEY (
    echo   [OK] Google Gemini  - found in .pi/auth.json
) else (
    echo   [--] Google Gemini  - not configured
)
:go_end

:: ===== Qwen (Alibaba DashScope) =====
if defined DASHSCOPE_API_KEY (
    echo   [OK] Qwen/DashScope  - found in system environment
    goto qw_end
)
for /f "usebackq delims=" %%k in (`node -e "try{const j=JSON.parse(require('fs').readFileSync('%~dp0.pi/auth.json','utf8'));if(j.qwen&&j.qwen.key)console.log(j.qwen.key);}catch{}"`) do set "DASHSCOPE_API_KEY=%%k"
if defined DASHSCOPE_API_KEY (
    echo   [OK] Qwen/DashScope  - found in .pi/auth.json
) else (
    echo   [--] Qwen/DashScope  - not configured
)
:qw_end

:: ===== OpenRouter =====
if defined OPENROUTER_API_KEY (
    echo   [OK] OpenRouter      - found in system environment
    goto or_end
)
for /f "usebackq delims=" %%k in (`node -e "try{const j=JSON.parse(require('fs').readFileSync('%~dp0.pi/auth.json','utf8'));if(j.openrouter&&j.openrouter.key)console.log(j.openrouter.key);}catch{}"`) do set "OPENROUTER_API_KEY=%%k"
if defined OPENROUTER_API_KEY (
    echo   [OK] OpenRouter      - found in .pi/auth.json
) else (
    echo   [--] OpenRouter      - not configured
)
:or_end

echo.
echo --------------------------------------------------------------------
echo  Tip: Configure missing keys via the Settings panel (gear icon)
echo  or set env vars: DEEPSEEK_API_KEY, DASHSCOPE_API_KEY, etc.
echo --------------------------------------------------------------------

echo.
echo Starting Backend Express Server (Port 3000)...
start "projectEL Backend" /D "%~dp0backend" cmd /k "title projectEL Backend Server && npx tsx src/server.ts"

echo Starting Frontend Vite Server (Port 5173)...
start "projectEL Frontend" /D "%~dp0frontend" cmd /k "title projectEL Frontend Page && npm run dev"

echo.
echo ====================================================================
echo  [SUCCESS] Both services launched!
echo  - Frontend Web UI:  http://localhost:5173
echo  - Backend API:      http://localhost:3000
echo ====================================================================
pause
