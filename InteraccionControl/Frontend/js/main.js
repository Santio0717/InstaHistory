// ==============================
// 🎮 VARIABLES DEL JOYSTICK
// ==============================
let joyX = 0;
let joyY = 0;

let smoothX = 0;
let smoothY = 0;

// 🔥 GLOBAL
let model = null;

// 🎯 MODO BRILLO
let brightnessMode = false;
let brightness = 0.2;

let zoom = 8;

let zoomInActivate = false;
let zoomOutActivate = false;

// ==============================
// 🌐 WEBSOCKET
// ==============================
const socket = new WebSocket("ws://localhost:8080");

socket.onopen = () => {
    console.log("🟢 Conectado al WebSocket");
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // 🎮 JOYSTICK
    if (data.code === "ABS_X") {
        joyX = (data.value - 128) / 128;
    }

    if (data.code === "ABS_Y") {
        joyY = (data.value - 128) / 128;
    }

    // 🔘 TRIÁNGULO
    if (data.code === "BTN_NORTH" && data.value === 1) {
        brightnessMode = !brightnessMode;
        console.log("✨ Modo brillo:", brightnessMode ? "ON" : "OFF");
    }

    // 🔍 ZOOM IN (R1)
    if (data.code === "BTN_TR") {
        zoomInActivate = data.value === 1;
        console.log("🔍 Zoom IN:", zoomInActivate);
    }

    // 🔍 ZOOM OUT (L1)
    if (data.code === "BTN_TL") {
        zoomOutActivate = data.value === 1;
        console.log("🔍 Zoom OUT:", zoomOutActivate);
    }
};

socket.onerror = (err) => {
    console.log("❌ Error WebSocket:", err);
};

socket.onclose = () => {
    console.log("🔴 WebSocket cerrado");
};

// ==============================
// 🧠 FUNCIONES
// ==============================
function applyDeadzone(v, threshold = 0.1) {
    return Math.abs(v) < threshold ? 0 : v;
}

// ==============================
// 🧊 THREE.JS
// ==============================
const scene = new THREE.Scene();

// Fondo claro
scene.background = new THREE.Color(0xeeeeee);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.z = zoom;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ==============================
// 💡 LUCES
// ==============================

// Luz ambiental
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

// Luz direccional
const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// Luz frontal
const frontLight = new THREE.DirectionalLight(0xffffff, 1.5);
frontLight.position.set(0, 0, 5);
scene.add(frontLight);

// ==============================
// 🧊 CARGAR MODELO
// ==============================
const loader = new THREE.GLTFLoader();

loader.load('../model/Urna.glb', (gltf) => {

    model = gltf.scene;

    // 🔥 MATERIAL MEJORADO + BRILLO
    model.traverse((child) => {
        if (child.isMesh) {
            child.material.metalness = 0;
            child.material.roughness = 1;

            // CLAVE para brillo dinámico
            child.material.emissive = new THREE.Color(0x222222);
            child.material.emissiveIntensity = 0.5;
        }
    });

    // Escala
    model.scale.set(3, 3, 3);

    // Centrar modelo
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    scene.add(model);

    console.log("✅ Modelo cargado");

}, undefined, (error) => {
    console.error("❌ Error cargando modelo:", error);
});

// ==============================
// 🔄 LOOP
// ==============================
function animate() {
    requestAnimationFrame(animate);

    let targetX = applyDeadzone(joyX);
    let targetY = applyDeadzone(joyY);

    // Suavizado
    smoothX += (targetX - smoothX) * 0.1;
    smoothY += (targetY - smoothY) * 0.1;

    if (model) {

        if (brightnessMode) {
            // 🎚️ CONTROL DE BRILLO
            brightness += smoothY * 0.02;

            // límites
            brightness = Math.max(0.2, Math.min(3, brightness));

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material.emissiveIntensity = brightness;
                }
            });

        } else {
            // 🔄 ROTACIÓN NORMAL
            model.rotation.y += smoothX * 0.05;
            model.rotation.x += smoothY * 0.05;
        }
    }

    if (zoomInActivate) {
        zoom -= 0.05;
    }

    if (zoomOutActivate) {
        zoom += 0.05;
    }

    // límites seguros
    zoom = Math.max(3, Math.min(20, zoom));

    // suavizado
    camera.position.z += (zoom - camera.position.z) * 0.1;

    if (!model) return;

    renderer.render(scene, camera);
}

animate();

// ==============================
// 📱 RESPONSIVE
// ==============================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});