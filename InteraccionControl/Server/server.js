const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', ws => {
    console.log('🟢 Cliente conectado');

    ws.on('message', message => {
        console.log("📥 RECIBIDO:", message.toString());

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });

    ws.on('close', () => {
        console.log('🔴 Cliente desconectado');
    });

    ws.on('error', (err) => {
        console.log('⚠️ Error en conexión:', err.message);
    });
});

console.log("🚀 Servidor en ws://localhost:8080");