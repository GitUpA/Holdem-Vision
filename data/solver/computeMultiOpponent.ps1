# Compute preflop equity tables for 1-9 opponents using runEquity.mjs (standalone, no tsx).
#
# Run from project root:
#   powershell -File data/solver/computeMultiOpponent.ps1           # 100K trials (default)
#   powershell -File data/solver/computeMultiOpponent.ps1 10000     # 10K trials (quick test)
#
# Outputs: data/solver/preflopEquity_{N}opp.json for N=1..9
# Time estimate at 100K trials: ~25 min per opponent count = ~4 hours total

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/../..

$trials = if ($args[0]) { [int]$args[0] } else { 100000 }
$startAll = Get-Date

foreach ($opp in 1..9) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  [$opp/9] Computing $opp-opponent equity ($trials trials)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    $outFile = "data/solver/preflopEquity_${opp}opp.json"
    $startOne = Get-Date

    # runEquity.mjs: stdout = JSON, stderr = progress
    # Capture stdout as string, suppress stderr, write as UTF-8
    $jsonText = cmd /c "node data/solver/runEquity.mjs 169 $trials $opp 2>NUL"
    $fullPath = Join-Path $PWD $outFile
    [System.IO.File]::WriteAllLines($fullPath, $jsonText, (New-Object System.Text.UTF8Encoding $false))

    $elapsed = [math]::Round(((Get-Date) - $startOne).TotalMinutes, 1)

    # Validate the JSON
    try {
        $parsed = Get-Content $outFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $count = ($parsed.PSObject.Properties | Measure-Object).Count
        Write-Host "  Saved: $outFile ($count hands, ${elapsed} min)" -ForegroundColor Green
    } catch {
        Write-Host "  ERROR: Invalid JSON in $outFile" -ForegroundColor Red
    }
}

$totalMin = [math]::Round(((Get-Date) - $startAll).TotalMinutes, 1)
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  All done in $totalMin minutes!" -ForegroundColor Green
Write-Host "  Files: data/solver/preflopEquity_{1..9}opp.json" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
