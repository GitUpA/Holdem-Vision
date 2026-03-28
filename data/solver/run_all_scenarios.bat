@echo off
echo ══════════════════════════════════════════════════════════
echo  ALL SCENARIOS — Run in parallel for fastest completion
echo ══════════════════════════════════════════════════════════
echo.
echo  To run in PARALLEL (recommended — GPU has overhead):
echo    Open 3 separate terminals, run one in each:
echo.
echo    Terminal 1: run_utg_vs_bb.bat   (~1-2 hours, smallest)
echo    Terminal 2: run_co_vs_bb.bat    (~2-3 hours, medium)
echo    Terminal 3: run_bvb.bat         (~3-4 hours, largest)
echo.
echo  To run SEQUENTIALLY (this script):
echo    Total time: ~6-9 hours
echo ══════════════════════════════════════════════════════════
echo.
set /p CONFIRM="Run all 3 scenarios sequentially? (y/n): "
if /i not "%CONFIRM%"=="y" exit /b

echo.
echo [1/3] UTG vs BB...
call run_utg_vs_bb.bat

echo.
echo [2/3] CO vs BB...
call run_co_vs_bb.bat

echo.
echo [3/3] BvB...
call run_bvb.bat

echo.
echo ══════════════════════════════════════════════════════════
echo  ALL SCENARIOS COMPLETE
echo  Next: parse the outputs
echo    node parseFacingBet.mjs manifest_utg_vs_bb.json D:/HoldemVision/solver_data/outputs_utg_vs_bb
echo    node parseFacingBet.mjs manifest_co_vs_bb.json D:/HoldemVision/solver_data/outputs_co_vs_bb
echo    node parseFacingBet.mjs manifest_bvb.json D:/HoldemVision/solver_data/outputs_bvb
echo ══════════════════════════════════════════════════════════
pause
