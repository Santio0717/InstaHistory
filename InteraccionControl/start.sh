#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Verificando dependencias..."

if ! command -v python3 >/dev/null 2>&1; then
  echo "Instalando Python..."
  sudo apt update
  sudo apt install -y python3 python3-pip python3-venv
fi

if [ ! -d "python/venv" ]; then
  echo "Creando entorno virtual..."
  python3 -m venv python/venv
fi

source python/venv/bin/activate
python3 -m pip install --upgrade pip

if [ -f "python/requirements.txt" ]; then
  echo "Instalando dependencias Python..."
  python3 -m pip install -r python/requirements.txt
fi

export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "Instalando NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi

# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

echo "Asegurando Node.js 18..."
nvm install 18
nvm use 18

cd "$ROOT_DIR/Server"
if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias Node..."
  npm install
fi
cd "$ROOT_DIR"

if command -v ufw >/dev/null 2>&1; then
  echo "Abriendo puertos 3000 y 8080 en ufw..."
  sudo ufw allow 3000
  sudo ufw allow 8080
fi

echo "Iniciando servicios..."
node Server/server.js &
NODE_PID=$!

python python/control_ws.py &
PYTHON_PID=$!

cd Frontend
python3 -m http.server 3000 &
WEB_PID=$!
cd "$ROOT_DIR"

trap 'echo "Deteniendo sistema..."; kill "$NODE_PID" "$PYTHON_PID" "$WEB_PID" 2>/dev/null; exit' SIGINT SIGTERM

xdg-open http://localhost:3000 >/dev/null 2>&1 || true
echo "Todo iniciado. Abre en: http://localhost:3000"
wait