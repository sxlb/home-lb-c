# ============================================================
# home-lb 一键部署 / 升级脚本（Windows / PowerShell）
# 用法：.\deploy.ps1
# 功能：自动生成密钥 -> 构建并启动 -> 等待健康检查 -> 输出状态
# 升级流程：git pull 后再次运行本脚本即可
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = ".env.deploy"
$container = "home-lb"

# ---------- 1. 自动准备环境变量（无需手动配置） ----------
# 首次运行自动生成 .env.deploy 并填入随机密钥；密钥已自定义时不会覆盖
if (-not (Test-Path $envFile)) {
    Copy-Item ".env.deploy.example" $envFile
}

$secretLine = Select-String -Path $envFile -Pattern 'NEXTAUTH_SECRET=change-me' -Quiet
if ($secretLine) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $content = Get-Content $envFile -Raw
    $content = $content -replace 'NEXTAUTH_SECRET=.*', "NEXTAUTH_SECRET=$secret"
    Set-Content -Path $envFile -Value $content -NoNewline -Encoding UTF8
    Write-Host "==> 已自动生成随机 NEXTAUTH_SECRET" -ForegroundColor Green
}

# ---------- 2. 构建并启动 ----------
Write-Host "==> 构建并启动服务..." -ForegroundColor Cyan
docker compose --env-file $envFile up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# ---------- 3. 等待健康检查 ----------
Write-Host "==> 等待服务就绪（最长 120s）..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Seconds 5
    $running = docker ps --format "{{.Names}}" | Select-String -Pattern "^$container$" -Quiet
    if (-not $running) { continue }
    $health = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" $container 2>$null
    if ($health -eq "healthy") {
        Write-Host "服务已就绪（healthy）" -ForegroundColor Green
        docker compose --env-file $envFile ps
        $ready = $true
        break
    }
    if ($health -eq "unhealthy") {
        Write-Host "健康检查失败，请查看日志：docker compose --env-file $envFile logs -f" -ForegroundColor Red
        exit 1
    }
}

if (-not $ready) {
    Write-Host "等待超时，请查看日志：docker compose --env-file $envFile logs -f" -ForegroundColor Red
    exit 1
}
