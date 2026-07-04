@echo off
REM ============================================================
REM  Bulk-import ALL Indian packaged foods from Open Food Facts
REM  into your barcode database (~18,000 products).
REM  Double-click this file to run it. Safe to re-run anytime.
REM ============================================================
cd /d "%~dp0"
echo.
echo  Importing all Indian packaged foods into your database...
echo  This takes about 5-6 minutes. Please leave this window open.
echo.
node scripts\import-off-india.mjs --live
echo.
echo  ============================================================
echo   DONE. You can close this window.
echo  ============================================================
pause
