@echo off
REM ============================================================
REM  Bulk-import Indian packaged foods from Open Food Facts
REM  into your barcode database (~4,150 products).
REM  Double-click this file to run it. Safe to re-run anytime.
REM ============================================================
cd /d "%~dp0"
echo.
echo  Importing Indian packaged foods into your database...
echo  This takes under a minute. Please leave this window open.
echo.
node scripts\import-off-india.mjs --live
echo.
echo  ============================================================
echo   DONE. You can close this window.
echo  ============================================================
pause
