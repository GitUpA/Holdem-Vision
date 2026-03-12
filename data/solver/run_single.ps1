param(
    [string]$InputFile
)

$solverDir = Join-Path $PSScriptRoot "texassolver"
$solverExe = Join-Path $solverDir "console_solver.exe"

Set-Location $solverDir
& $solverExe -i $InputFile 2>&1 | Out-Null
