#!/bin/bash

echo "Iniciando sistema..."

# Activar entorno Python
source python/venv/bin/activate

# 🚀 Iniciar Node
echo "Iniciando servidor Node..."
node Server/server.js &
NODE_PID=$!

# 🐍 Python control
echo "Iniciando control Python..."
python python/control_ws.py &
PYTHON_PID=$!

# 🖥️ Frontend
echo "Iniciando servidor web..."
cd Frontend
python3 -m http.server 3000 &
WEB_PID=$!

cd ..

echo "Todo iniciado"
echo "Abre en: http://localhost:3000"

# Abrir navegador
xdg-open http://localhost:3000 2>/dev/null

# 🧠 Manejo correcto de CTRL + C
trap "echo 'Deteniendo sistema...'; kill $NODE_PID $PYTHON_PID $WEB_PID; exit" SIGINT SIGTERM

# Mantener script vivo
wait
