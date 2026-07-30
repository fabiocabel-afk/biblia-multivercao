@echo off
title Biblia - servidor local
cd /d "%~dp0"

echo.
echo  ================================
echo   Biblia - abrindo o aplicativo
echo  ================================
echo.

rem --- confere se este atalho esta na pasta certa ---
if not exist "index.html" (
    echo  PROBLEMA: nao achei o index.html nesta pasta.
    echo.
    echo  Este atalho precisa ficar na MESMA pasta do index.html.
    echo  Mova o arquivo para la e abra de novo.
    echo.
    pause
    exit /b
)

rem --- confere se os dados estao ao lado, e nao um nivel acima ---
if not exist "data\meta\versoes.json" (
    echo  PROBLEMA: a pasta "data" nao esta aqui.
    echo.
    echo  Esta pasta precisa ter os cinco itens juntos:
    echo.
    echo     index.html
    echo     manifest.json
    echo     sw.js
    echo     assets\
    echo     data\
    echo.
    echo  Se o "data" estiver numa pasta acima, recorte e cole aqui dentro.
    echo.
    pause
    exit /b
)

rem --- procura o Python ---
where python >nul 2>nul && goto :comPython
where py     >nul 2>nul && goto :comPy

echo  PROBLEMA: o Python nao esta instalado.
echo.
echo  Baixe em https://www.python.org/downloads/
echo  Na instalacao, marque a caixa "Add Python to PATH".
echo.
pause
exit /b

:comPython
echo  Servidor no ar. O navegador vai abrir sozinho.
echo  Para encerrar, feche esta janela.
echo.
start "" http://localhost:8000
python -m http.server 8000
exit /b

:comPy
echo  Servidor no ar. O navegador vai abrir sozinho.
echo  Para encerrar, feche esta janela.
echo.
start "" http://localhost:8000
py -m http.server 8000
exit /b
