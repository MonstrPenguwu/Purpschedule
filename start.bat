@echo off
echo Starting Stream Schedule Builder...
cd /d "%~dp0"
npx --yes serve -p 5173 -s .
