#Requires -Version 7
<#
.SYNOPSIS
  把 dsh-workspace-pin 装进 DSH 的 desktop profile。
.DESCRIPTION
  做三件事，任何一步失败都立刻停，改过的文件都有带时间戳的备份：
    1. 在 %DSH_HOME%/profiles/<Profile>/node_modules/@ggxx/ 建指向本目录的 Junction；
    2. 在 profile 的 package.json 里补 dependencies 与 dsh.profile.bundles；
    3. 提示重启 App。
  不跑 pnpm：Junction + bundle 条目就够 loader 解析；下次插件管理器跑 install 时会按
  package.json 里的 link: 依赖自己补齐 lockfile。
#>
[CmdletBinding()]
param(
  [string]$Profile = "desktop",
  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" })
)

$ErrorActionPreference = "Stop"
$bundle = "@ggxx/dsh-workspace-pin"
$pluginDir = $PSScriptRoot
$profileDir = Join-Path $DshHome (Join-Path "profiles" $Profile)
$scopeDir = Join-Path $profileDir "node_modules/@ggxx"
$linkPath = Join-Path $scopeDir "dsh-workspace-pin"
$pkgPath = Join-Path $profileDir "package.json"

if (-not (Test-Path $pkgPath)) { throw "找不到 profile 的 package.json：$pkgPath" }
if (-not (Test-Path (Join-Path $pluginDir "client.js"))) { throw "请把本脚本放在插件目录里运行（缺少 client.js）" }

$stamp = Get-Date -Format "yyyyMMddHHmmss"
Copy-Item $pkgPath "$pkgPath.bak-workspace-pin-$stamp" -Force
Write-Host "已备份：$pkgPath.bak-workspace-pin-$stamp"

# 1) Junction（rmdir 只摘链接本体，不会跟进目录里删文件）
New-Item -ItemType Directory -Force -Path $scopeDir | Out-Null
if (Test-Path $linkPath) { cmd /c rmdir "$linkPath" | Out-Null }
cmd /c mklink /J "$linkPath" "$pluginDir" | Out-Null
if (-not (Test-Path $linkPath)) { throw "建链接失败：$linkPath" }
Write-Host "已链接：$linkPath -> $pluginDir"

# 2) package.json：dependencies + bundles
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($null -eq $pkg.dependencies) { $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) }
if (-not $pkg.dependencies.PSObject.Properties[$bundle]) {
  $pkg.dependencies | Add-Member -NotePropertyName $bundle -NotePropertyValue ("link:" + ($pluginDir -replace "\\", "/"))
}
$bundles = @($pkg.dsh.profile.bundles)
if ($bundles -notcontains $bundle) {
  $pkg.dsh.profile.bundles = @($bundles + $bundle)
}
$pkg | ConvertTo-Json -Depth 30 | Set-Content $pkgPath -Encoding UTF8
Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
Write-Host "已登记：$bundle（bundles + dependencies）"

Write-Host ""
Write-Host "装好了。现在【退出并重启 DSH NEXT】，侧栏工作区行才会多出 📌。" -ForegroundColor Yellow
Write-Host "回滚：pwsh -File $(Join-Path $pluginDir "uninstall.ps1")"
