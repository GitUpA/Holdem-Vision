@echo off
echo ══════════════════════════════════════════════════
echo  BvB REVERSE — solving from board 192 backward
echo  Runs alongside run_bvb.bat (forward) safely
echo  Output: D:\HoldemVision\solver_data\outputs_bvb\
echo ══════════════════════════════════════════════════
echo.
cd /d "%~dp0"
python batch_solve.py run --scenario bvb --reverse
echo.
echo BvB REVERSE COMPLETE
pause
