#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(realpath "$0")")"
echo "======================================================"
echo "  OLHA-A-MENSAGEM // RETROWAVE WEB CONTROL"
echo "======================================================"
if ! command -v python3 >/dev/null 2>&1; then echo "Python 3 não encontrado."; exit 1; fi
if ! command -v firefox >/dev/null 2>&1 && ! command -v firefox-esr >/dev/null 2>&1; then
  echo "AVISO: Firefox não encontrado no PATH. Instale o Firefox para usar o WhatsApp Web."
fi
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
echo
echo "Painel local: http://127.0.0.1:8765"
echo "Mantenha este terminal aberto. Ctrl+C encerra o painel."
exec python app.py
