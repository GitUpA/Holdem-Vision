@echo off
echo ══════════════════════════════════════════════════
echo  BvB (SB vs BB) Solver Batch (193 boards)
echo  Wide ranges: 88 IP x 109 OOP
echo  Estimated: ~3-4 hours
echo  Output: D:\HoldemVision\solver_data\outputs_bvb\
echo ══════════════════════════════════════════════════
echo.
cd /d "%~dp0"
python batch_solve.py run --scenario bvb
echo.
echo BvB COMPLETE
pause
