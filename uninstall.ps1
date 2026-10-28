#Requires -Version 7
<# .SYNOPSIS 把 dsh-workspace-pin 从 desktop profile 里摘掉（不动插件目录本身）。 #>
[CmdletBinding()]
param(
  [string]$Profile = "desktop",
  [string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" })
)
$ErrorActionPreference = "Stop"
$bundle = "@ggxx/dsh-workspace-pin"
$profileDir = Join-Path $DshHome (Join-Path "profiles" $Profile)
$linkPath = Join-Path $profileDir "node_modules/@ggxx/dsh-workspace-pin"
$pkgPath = Join-Path $profileDir "package.json"

if (Test-Path $linkPath) { cmd /c rmdir "$linkPath" | Out-Null; Write-Host "已摘链接：$linkPath" }
if (Test-Path $pkgPath) {
  $stamp = Get-Date -Format "yyyyMMddHHmmss"
  Copy-Item $pkgPath "$pkgPath.bak-workspace-pin-rm-$stamp" -Force
  $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($pkg.dependencies -and $pkg.dependencies.PSObject.Properties[$bundle]) {
    $pkg.dependencies.PSObject.Properties.Remove($bundle)
  }
  $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) | Where-Object { $_ -ne $bundle }
  $pkg | ConvertTo-Json -Depth 30 | Set-Content $pkgPath -Encoding UTF8
  Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
  Write-Host "已除名：$bundle。重启 App 后按钮消失。"
}
