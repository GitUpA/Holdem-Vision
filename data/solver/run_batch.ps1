# Batch GTO Solver Runner
# Usage: powershell -ExecutionPolicy Bypass -File run_batch.ps1
# Run from the data/solver/ directory

$ErrorActionPreference = "Continue"
$solverDir = Join-Path $PSScriptRoot "texassolver"
$solverExe = Join-Path $solverDir "console_solver.exe"
$outputDir = Join-Path $PSScriptRoot "outputs"
$manifest = Get-Content (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$total = 0
$completed = 0
$failed = 0
$startTime = Get-Date

foreach ($archetype in $manifest.PSObject.Properties) {
    $total += $archetype.Value.Count
}

Write-Host "Total boards to solve: $total"
Write-Host ""

foreach ($archetype in $manifest.PSObject.Properties) {
    $archName = $archetype.Name
    $entries = $archetype.Value
    Write-Host "============================================================"
    Write-Host "  $archName ($($entries.Count) boards)"
    Write-Host "============================================================"

    foreach ($entry in $entries) {
        $name = $entry.name
        $outputFile = Join-Path $outputDir "$name.json"

        # Skip if already solved
        if ((Test-Path $outputFile) -and ((Get-Item $outputFile).Length -gt 100)) {
            Write-Host "  [SKIP] $name (already solved)"
            $completed++
            continue
        }

        $board = $entry.board -join ","
        Write-Host "  [SOLVE] $name -- $board ..." -NoNewline

        # Read input and fix output path to absolute
        $content = Get-Content $entry.input -Raw
        $absOutputFile = (Join-Path (Resolve-Path $outputDir).Path "$name.json") -replace '\\', '/'
        $content = $content -replace 'dump_result .*', "dump_result $absOutputFile"

        # Write temp input in solver dir
        $tempInput = Join-Path $solverDir "_batch_input.txt"
        Set-Content -Path $tempInput -Value $content -NoNewline

        $solveStart = Get-Date
        try {
            # Run solver WITHOUT redirecting stdout/stderr (GPU process needs direct console)
            $proc = Start-Process -FilePath $solverExe -ArgumentList "-i", "_batch_input.txt" -WorkingDirectory $solverDir -Wait -NoNewWindow -PassThru
            $solveTime = [math]::Round(((Get-Date) - $solveStart).TotalSeconds)

            if ((Test-Path $outputFile) -and ((Get-Item $outputFile).Length -gt 100)) {
                $sizeKB = [math]::Round((Get-Item $outputFile).Length / 1024)
                Write-Host " OK (${solveTime}s, ${sizeKB}KB)"
                $completed++
            } else {
                Write-Host " FAIL (${solveTime}s)"
                $failed++
            }
        } catch {
            Write-Host " ERROR: $_"
            $failed++
        }

        $done = $completed + $failed
        $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds)
        if ($elapsed -gt 0) {
            $rate = $done / $elapsed
            if ($rate -gt 0) {
                $remaining = [math]::Round(($total - $done) / $rate)
                Write-Host "         Progress: $done/$total (${elapsed}s elapsed, ~${remaining}s remaining)"
            }
        }
    }
}

Write-Host ""
Write-Host "============================================================"
Write-Host "DONE: $completed completed, $failed failed, $total total"
$totalTime = [math]::Round(((Get-Date) - $startTime).TotalSeconds)
Write-Host "Total time: ${totalTime}s"
