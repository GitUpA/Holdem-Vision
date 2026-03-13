# Turn + River Batch Solver
# =========================
# Runs all 570 turn/river solves sequentially.
# Estimated time: ~1.6 hours (96 turn x 20s + 474 river x 8s)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File run_turn_river_batch.ps1
#
# The script is resumable - it skips already-solved boards.
# Safe to interrupt and restart.

$ErrorActionPreference = "Continue"
$scriptDir = $PSScriptRoot
$solverDir = Join-Path $scriptDir "texassolver"
$solverExe = Join-Path $solverDir "console_solver.exe"

Write-Host "============================================"
Write-Host "  TURN + RIVER BATCH SOLVER"
Write-Host "  Estimated: ~1.6 hours (570 solves)"
Write-Host "============================================"
Write-Host ""

# Step 1: Generate inputs (fast, idempotent)
Write-Host "[1/3] Generating input files..."
$genResult = & python "$scriptDir\batch_turn_river.py" generate 2>&1
Write-Host $genResult
Write-Host ""

# Step 2: Run all solves
Write-Host "[2/3] Running solver..."
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& python "$scriptDir\batch_turn_river.py" run 2>&1
$sw.Stop()

$totalMin = [math]::Round($sw.Elapsed.TotalMinutes, 1)
Write-Host ""
Write-Host "Solve phase complete in ${totalMin} minutes"
Write-Host ""

# Step 3: Parse outputs into frequency tables
Write-Host "[3/3] Parsing outputs into frequency tables..."
& python "$scriptDir\batch_turn_river.py" parse 2>&1

Write-Host ""
Write-Host "============================================"
Write-Host "  ALL DONE"
Write-Host "  Total time: ${totalMin} minutes"
Write-Host "============================================"
Write-Host ""
Write-Host "Frequency tables written to: data/frequency_tables/"
Write-Host "Next: load these tables in the TypeScript runtime"
