import websocket
import json
import time
from inputs import get_gamepad

WS_URL = "ws://localhost:8080"

print("🚀 Iniciando control...")

AXIS_CODES = ["ABS_X", "ABS_Y"]

CENTER = 128
DEADZONE = 22
MIN_AXIS_CHANGE = 4
AXIS_INTERVAL = 0.025

BUTTON_CODES = ["BTN_TR", "BTN_TL", "BTN_NORTH"]

last_axis_values = {
    "ABS_X": CENTER,
    "ABS_Y": CENTER
}

last_axis_time = 0

def normalize_axis(value):
    if abs(value - CENTER) < DEADZONE:
        return CENTER

    return value

def send_json(ws, data):
    ws.send(json.dumps(data))

while True:
    try:
        print("🔌 Conectando al servidor...")
        ws = websocket.create_connection(WS_URL)
        print("✅ Conectado al WebSocket")

        while True:
            events = get_gamepad()

            for event in events:
                current_time = time.time()

                # ==============================
                # JOYSTICK
                # ==============================
                if event.ev_type == "Absolute" and event.code in AXIS_CODES:
                    value = normalize_axis(event.state)

                    previous = last_axis_values.get(event.code, CENTER)

                    if abs(previous - value) < MIN_AXIS_CHANGE:
                        continue

                    if current_time - last_axis_time < AXIS_INTERVAL:
                        continue

                    last_axis_values[event.code] = value
                    last_axis_time = current_time

                    data = {
                        "code": event.code,
                        "value": value
                    }

                    send_json(ws, data)
                    print("📤", data)

                # ==============================
                # BOTONES
                # ==============================
                elif event.ev_type == "Key":
                    data = {
                        "code": event.code,
                        "value": event.state
                    }

                    if event.code == "BTN_TR":
                        data["action"] = "zoom_in"
                        send_json(ws, data)
                        print("🔍 ZOOM IN (R1)", data)

                    elif event.code == "BTN_TL":
                        data["action"] = "zoom_out"
                        send_json(ws, data)
                        print("🔍 ZOOM OUT (L1)", data)

                    elif event.code == "BTN_NORTH":
                        send_json(ws, data)
                        print("🔘 BRILLO:", data)

                    else:
                        send_json(ws, data)
                        print("🔘 BOTÓN:", data)

    except Exception as e:
        print("❌ Error:", e)
        print("🔄 Reintentando en 2 segundos...")
        time.sleep(2)