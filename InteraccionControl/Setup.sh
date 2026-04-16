#!/bin/bash

echo "Iniciando sistema..."

echo "Instalando python"
sudo apt install python3 python3-pip -y

sudo apt install python3-venv -y

echo "Instalando Node.js"
# Descarga e instala nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# en lugar de reiniciar la shell
\. "$HOME/.nvm/nvm.sh"

# Descarga e instala Node.js:
nvm install 18

# Verifica la versión de Node.js:
node -v # Debería mostrar "v24.14.1".

# Verifica versión de npm:
npm -v # Debería mostrar "11.11.0".

sudo ufw allow 3000
sudo ufw allow 8080