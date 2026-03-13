# Benchmark 3: Rainbow Connected (8s 7d 6c) - full 3-street solve
# Usage: powershell -ExecutionPolicy Bypass -File bench_3_connected.ps1

$ErrorActionPreference = "Continue"
$solverDir = Join-Path $PSScriptRoot "texassolver"
$solverExe = Join-Path $solverDir "console_solver.exe"
$inputFile = Join-Path $PSScriptRoot "inputs\bench_rainbow_8s7d6c.txt"
$outputFile = Join-Path $solverDir "bench_rainbow_8s7d6c.json"

$content = Get-Content $inputFile -Raw
$absOutput = ($outputFile -replace '\\', '/')
$content = $content -replace 'dump_result .*', "dump_result $absOutput"
$tempInput = Join-Path $solverDir "_bench_input_3.txt"
Set-Content -Path $tempInput -Value $content -NoNewline

Write-Host "============================================"
Write-Host "  BENCHMARK 3: Rainbow Connected (8s 7d 6c)"
Write-Host "  Full flop + turn + river solve"
Write-Host "============================================"
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$proc = Start-Process -FilePath $solverExe -ArgumentList "-i", "_bench_input_3.txt" -WorkingDirectory $solverDir -Wait -NoNewWindow -PassThru
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
