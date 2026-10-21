#!/bin/sh
# Deneme sayfasını üretir: cikti/planlama-modulu.html (tek dosya, tarayıcıda doğrudan açılır)
set -e
cd "$(dirname "$0")"
python3 birlestir.py
python3 build.py
node --check cikti/app.js
