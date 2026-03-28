@echo off
echo ══════════════════════════════════════════════════
echo  CO vs BB Solver Batch (193 boards)
echo  Medium ranges: 68 IP x 56 OOP
echo  Estimated: ~2-3 hours
echo  Output: D:\HoldemVision\solver_data\outputs_co_vs_bb\
echo ══════════════════════════════════════════════════
echo.
cd /d "%~dp0"
python batch_solve.py run --scenario co_vs_bb
echo.
echo CO vs BB COMPLETE
pause
