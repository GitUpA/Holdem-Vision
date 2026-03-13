# Benchmark: Turn-only solve (As 8h 2d 5s) - 2-street tree (turn + river)
# Usage: powershell -ExecutionPolicy Bypass -File bench_turn_only.ps1

$ErrorActionPreference = "Continue"
$solverDir = Join-Path $PSScriptRoot "texassolver"
$solverExe = Join-Path $solverDir "console_solver.exe"
$inputFile = Join-Path $PSScriptRoot "inputs\bench_turn_only.txt"
$outputFile = Join-Path $solverDir "bench_turn_only_output.json"

$content = Get-Content $inputFile -Raw
$absOutput = ($outputFile -replace '\\', '/')
$content = $content -replace 'dump_result .*', "dump_result $absOutput"
$tempInput = Join-Path $solverDir "_bench_turn_input.txt"
Set-Content -Path $tempInput -Value $content -NoNewline

Write-Host "============================================"
Write-Host "  TURN-ONLY SOLVE: As 8h 2d 5s"
Write-Host "  2-street tree (turn + river only)"
Write-Host "  Pot: 12bb  Stack: 94bb"
Write-Host "============================================"
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$proc = Start-Process -FilePath $solverExe -ArgumentList "-i", "_bench_turn_input.txt" -WorkingDirectory $solverDir -Wait -NoNewWindow -PassThru
$sw.Stop()

$seconds = [math]::Round($sw.Elapsed.TotalSeconds)
$minutes = [math]::Round($sw.Elapsed.TotalMinutes, 1)

Write-Host ""
Write-Host "============================================"
Write-Host "  RESULTS"
Write-Host "============================================"
Write-Host "  Exit code: $($proc.ExitCode)"
Write-Host "  Time: ${seconds}s (${minutes} min)"

if (Test-Path $outputFile) {
    $sizeMB = [math]::Round((Get-Item $outputFile).Length / 1024 / 1024, 1)
    $sizeKB = [math]::Round((Get-Item $outputFile).Length / 1024)
    Write-Host "  Output: ${sizeKB}KB (${sizeMB}MB)"
    Write-Host "  File: $outputFile"
} else {
    Write-Host "  OUTPUT FILE NOT FOUND - solve may have failed"
}
