import websocket
import json
import time
from inputs import get_gamepad

WS_URL = "ws://localhost:8080"

print("🚀 Iniciando control...")

# Guardar últimos valores para evitar spam
last_values = {}

while True:
    try:
        print("🔌 Conectando al servidor...")
        ws = websocket.create_connection(WS_URL)
        print("✅ Conectado al WebSocket")

        last_time = 0

        while True:
            events = get_gamepad()

            for event in events:
                if event.ev_type in ["Absolute", "Key"]:

                    # ⏱️ Control de frecuencia (máx ~50 FPS)
                    current_time = time.time()
                    if current_time - last_time < 0.02:
                        continue

                    # 🔍 Filtro de cambios (deadzone básica)
                    prev = last_values.get(event.code)

                    if event.ev_type == "Absolute":
                        # 🎮 Joystick (sí usamos filtro)
                        prev = last_values.get(event.code)

                        if prev is None or abs(prev - event.state) > 2:
                            last_values[event.code] = event.state

                            data = {
                                "code": event.code,
                                "value": event.state
                            }

                            ws.send(json.dumps(data))

                            if event.code in ["ABS_X", "ABS_Y"]:
                                print("📤", data)

                            last_time = current_time


                    elif event.ev_type == "Key":
                        # 🔘 BOTONES (sin filtro)
                        data = {
                            "code": event.code,
                            "value": event.state
                        }

                        ws.send(json.dumps(data))

                        print("🔘 BOTÓN:", data)

                        last_time = current_time

    except Exception as e:
        print("❌ Error:", e)
        print("🔄 Reintentando en 2 segundos...")
        time.sleep(2)