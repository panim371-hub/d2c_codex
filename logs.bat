@echo off
title D2C Codex Logs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\logs.ps1"
if errorlevel 1 pause
