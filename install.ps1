# GitBridge Universal PowerShell Installer for Windows
# Usage:
#   irm https://raw.githubusercontent.com/FuadTesfaye/gitbridge/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "   ____ _ _   ____       _     _            " -ForegroundColor Cyan
Write-Host "  / ___(_) |_| __ ) _ __(_) __| | __ _  ___ " -ForegroundColor Cyan
Write-Host " | |  _| | __|  _ \| '__| |/ _` |/ _` |/ _ \" -ForegroundColor Cyan
Write-Host " | |_| | | |_| |_) | |  | | (_| | (_| |  __/" -ForegroundColor Cyan
Write-Host "  \____|_|\__|____/|_|  |_|\__,_|\__, |\___|" -ForegroundColor Cyan
Write-Host "                                 |___/      " -ForegroundColor Cyan
Write-Host "  Universal Git Identity & Multi-Account Management Layer" -ForegroundColor DarkGray
Write-Host ""

# 1. Detect Environment
Write-Host "1. Detecting Windows Environment:" -ForegroundColor White
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
Write-Host "   • Architecture: $arch" -ForegroundColor Cyan

# 2. Check for Bun or Node/npm
Write-Host "`n2. Checking Runtime Dependencies:" -ForegroundColor White

$hasBun = Get-Command bun -ErrorAction SilentlyContinue
$hasNpm = Get-Command npm -ErrorAction SilentlyContinue

if ($hasBun) {
    Write-Host "   ✔ Found Bun ($(& bun --version))" -ForegroundColor Green
    $installCmd = "bun add -g @fuad24/gitbridge@latest"
} elseif ($hasNpm) {
    Write-Host "   ✔ Found Node.js & npm" -ForegroundColor Green
    $installCmd = "npm install -g @fuad24/gitbridge@latest"
} else {
    Write-Host "   ○ No Bun or Node.js runtime detected." -ForegroundColor Yellow
    Write-Host "   Installing Bun for Windows..." -ForegroundColor Cyan
    irm bun.sh/install.ps1 | iex
    $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
    $installCmd = "bun add -g @fuad24/gitbridge@latest"
}

# 3. Install Package
Write-Host "`n3. Installing GitBridge CLI (@fuad24/gitbridge):" -ForegroundColor White
Invoke-Expression $installCmd

# 4. Success Banner
Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✔ GitBridge is installed and ready to use!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Green

Write-Host "  Dual Binaries Available:" -ForegroundColor White
Write-Host "    • gitbridge  (full command)" -ForegroundColor Cyan
Write-Host "    • gb         (fast shorthand)" -ForegroundColor Cyan

Write-Host "`n  Quick Start Guide:" -ForegroundColor White
Write-Host "    1. gb setup               Interactive onboarding wizard" -ForegroundColor Gray
Write-Host "    2. gb context             Inspect active Git identity & remote routing" -ForegroundColor Gray
Write-Host "    3. gb repo set            Permanently bind current repo to email & provider" -ForegroundColor Gray
Write-Host "    4. gb sec check           Run full security audit & leak checks" -ForegroundColor Gray
Write-Host "    5. gb override enable     Route native 'git' commands automatically" -ForegroundColor Gray
Write-Host ""
