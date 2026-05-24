// ==============================
// VARIABLES DEL JOYSTICK
// ==============================
let joyX = 0;
let joyY = 0;

let smoothX = 0;
let smoothY = 0;

// GLOBAL
const modelClones = [];
let modelLoaded = false;

// MODO BRILLO
let brightnessMode = false;
let brightness = 0.8;
let brightnessButtonPressed = false;

let modelScale = 1.2;

let zoomInActivate = false;
let zoomOutActivate = false;

// ==============================
// WEBSOCKET
// ==============================
const socket = new WebSocket("ws://192.168.0.46:8080");

socket.onopen = () => {
    console.log("Conectado al WebSocket");
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.code === "ABS_X") {
        joyX = (data.value - 128) / 128;
    }

    if (data.code === "ABS_Y") {
        joyY = (data.value - 128) / 128;
    }

    // Botón para activar/desactivar modo brillo
    // Usa bloqueo para evitar doble activación al mantener presionado
    if (data.code === "BTN_NORTH") {
        if (data.value > 0 && !brightnessButtonPressed) {
            brightnessButtonPressed = true;

            brightnessMode = !brightnessMode;

            console.log("Modo brillo:", brightnessMode ? "ON" : "OFF");
        }

        if (data.value === 0) {
            brightnessButtonPressed = false;
        }
    }

    // Botones de zoom
    // data.value > 0 es más estable que data.value === 1
    if (data.code === "BTN_TR") {
        zoomInActivate = data.value > 0;
    }

    if (data.code === "BTN_TL") {
        zoomOutActivate = data.value > 0;
    }
};

socket.onerror = (err) => {
    console.log("Error WebSocket:", err);
};

socket.onclose = () => {
    console.log("WebSocket cerrado");
};

// ==============================
// FUNCIONES
// ==============================
function applyDeadzone(v, threshold = 0.1) {
    return Math.abs(v) < threshold ? 0 : v;
}

function prepareModelMaterials(object) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.material = child.material.clone();

            child.material.metalness = 0;
            child.material.roughness = 1;

            child.material.emissive = new THREE.Color(0x444444);
            child.material.emissiveIntensity = brightness;

            child.material.transparent = false;
            child.material.opacity = 1;
        }
    });
}

// function createCloneFromModel(source, position, rotationZ) {
//     const clone = source.clone(true);
//     prepareModelMaterials(clone);

//     const wrapper = new THREE.Group();

//     wrapper.position.copy(position);
//     wrapper.rotation.z = rotationZ;

//     const pivot = new THREE.Group();
//     pivot.add(clone);

//     wrapper.add(pivot);
//     wrapper.userData.pivot = pivot;

//     return wrapper;
// }

function createCloneFromModel(source, position, rotationZ, modelRotationY) {
    const clone = source.clone(true);
    prepareModelMaterials(clone);

    const wrapper = new THREE.Group();

    wrapper.position.copy(position);
    wrapper.rotation.z = rotationZ;

    const pivot = new THREE.Group();
    pivot.rotation.y = modelRotationY;
    pivot.add(clone);

    wrapper.add(pivot);
    wrapper.userData.pivot = pivot;

    return wrapper;
}

// ==============================
// THREE.JS
// ==============================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(0, 0, 14);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);

// ==============================
// LUCES
// ==============================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
directionalLight.position.set(4, 6, 8);
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xff8844, 0.9);
fillLight.position.set(-6, -3, 5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x66ccff, 1.4);
rimLight.position.set(-5, 5, -6);
scene.add(rimLight);

// ==============================
// GRUPO HOLOGRAMA
// ==============================
const hologramGroup = new THREE.Group();
scene.add(hologramGroup);

// ==============================
// CARGAR MODELO
// ==============================
const loader = new THREE.GLTFLoader();

loader.load(
    "../model/Urna.glb",

    (gltf) => {
        const baseModel = gltf.scene;

        baseModel.scale.set(1, 1, 1);

        const box = new THREE.Box3().setFromObject(baseModel);
        const center = box.getCenter(new THREE.Vector3());

        baseModel.position.sub(center);

        prepareModelMaterials(baseModel);

        const distance = 5;

        // const cloneConfigs = [
        //     {
        //         position: new THREE.Vector3(0, distance, 0),
        //         rotationZ: 0

        //     },
        //     {
        //         position: new THREE.Vector3(0, -distance, 0),
        //         rotationZ: Math.PI
        //     },
        //     {
        //         position: new THREE.Vector3(-distance, 0, 0),
        //         rotationZ: Math.PI / 2
        //     },
        //     {
        //         position: new THREE.Vector3(distance, 0, 0),
        //         rotationZ: -Math.PI / 2
        //     }

        const cloneConfigs = [
            // ARRIBA - vista trasera
            {
                position: new THREE.Vector3(0, distance, 0),
                rotationZ: 0,
                modelRotationY: Math.PI
            },

            // ABAJO - vista frontal
            {
                position: new THREE.Vector3(0, -distance, 0),
                rotationZ: Math.PI,
                modelRotationY: 0
            },

            // IZQUIERDA - lateral izquierdo
            {
                position: new THREE.Vector3(-distance, 0, 0),
                rotationZ: Math.PI / 2,
                modelRotationY: Math.PI / 2
            },

            // DERECHA - lateral derecho
            {
                position: new THREE.Vector3(distance, 0, 0),
                rotationZ: -Math.PI / 2,
                modelRotationY: -Math.PI / 2
            }
        ];

        cloneConfigs.forEach((config) => {
            const cloneGroup = createCloneFromModel(
                baseModel,
                config.position,
                config.rotationZ,
                config.modelRotationY
            );

            hologramGroup.add(cloneGroup);
            modelClones.push(cloneGroup);
        });

        modelLoaded = true;

        console.log("Modelo cargado en modo holograma");
    },

    undefined,

    (error) => {
        console.error("Error cargando modelo:", error);
    }
);

// ==============================
// LOOP
// ==============================
function animate() {
    requestAnimationFrame(animate);

    const targetX = applyDeadzone(joyX);
    const targetY = applyDeadzone(joyY);

    smoothX += (targetX - smoothX) * 0.1;
    smoothY += (targetY - smoothY) * 0.1;

    if (modelLoaded) {
        if (brightnessMode) {
            brightness += smoothY * 0.02;
            brightness = Math.max(0.2, Math.min(3, brightness));

            modelClones.forEach((cloneGroup) => {
                cloneGroup.traverse((child) => {
                    if (child.isMesh) {
                        child.material.emissiveIntensity = brightness;
                    }
                });
            });
        } else {
            modelClones.forEach((cloneGroup) => {
                const pivot = cloneGroup.userData.pivot;

                pivot.rotation.y += smoothX * 0.03;
                // pivot.rotation.x += smoothY * 0.01;
            });
        }

        if (zoomInActivate) {
            modelScale += 0.01;
        }

        if (zoomOutActivate) {
            modelScale -= 0.01;
        }

        modelScale = Math.max(0.5, Math.min(2.5, modelScale));

        modelClones.forEach((cloneGroup) => {
            const pivot = cloneGroup.userData.pivot;
            pivot.scale.set(modelScale, modelScale, modelScale);
        });
    }

    renderer.render(scene, camera);
}

animate();

// ==============================
// RESPONSIVE
// ==============================
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});