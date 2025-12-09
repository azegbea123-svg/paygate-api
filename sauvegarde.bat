@echo off
echo ======================================
echo   SAUVEGARDE AUTOMATIQUE PAYGATE-API
echo ======================================

REM Aller dans ton dossier projet
cd /d D:\paygate-api

echo.
echo Ajout des fichiers...
git add .

echo.
set "dateTag=%date% %time%"
git commit -m "Sauvegarde automatique %dateTag%"

echo.
echo Envoi vers GitHub...
git push origin main

echo.
echo Sauvegarde terminee !
pause
