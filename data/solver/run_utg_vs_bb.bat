@echo off
echo ══════════════════════════════════════════════════
echo  UTG vs BB Solver Batch (193 boards)
echo  Smallest ranges: 43 IP x 32 OOP
echo  Estimated: ~1-2 hours
echo  Output: D:\HoldemVision\solver_data\outputs_utg_vs_bb\
echo ══════════════════════════════════════════════════
echo.
cd /d "%~dp0"
python batch_solve.py run --scenario utg_vs_bb
echo.
echo UTG vs BB COMPLETE
pause
