import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  getSession,
  logout,
  hydrateAppStateFromStorage,
  getAppState,
  pickSubtitleAtTime,
} from "./state.js";
import { idbGet } from "./idb.js";
import { saveResult } from "./results.js";

// ─── Guard: solo estudiantes ────────────────────────────────────────────────
const session = getSession();
if (!session || session.role !== "student") {
  window.location.href = "index.html";
  throw new Error("no-student");
}

document.getElementById("btnLogoutExp").addEventListener("click", logout);

const EXP_QR_URL = "https://linktr.ee/sanagustin_experiencia";

function closeExpQrModal() {
  const ov = document.getElementById("expQrOverlay");
  if (ov) {
    ov.hidden = true;
    ov.setAttribute("aria-hidden", "true");
  }
}

function openExpQrModal() {
  const ov = document.getElementById("expQrOverlay");
  const host = document.getElementById("expQrModalHost");
  if (!ov || !host) return;
  host.innerHTML = "";
  try {
    const QRC = globalThis.QRCode;
    if (!QRC) throw new Error("no-qrcode");
    new QRC(host, {
      text: EXP_QR_URL,
      width: 200,
      height: 200,
      colorDark: "#0b1020",
      colorLight: "#e9eeff",
      correctLevel: QRC.CorrectLevel.M,
    });
  } catch {
    host.innerHTML =
      '<img src="assets/qrppt.png" alt="" width="200" height="200" style="object-fit:contain;border-radius:8px;">';
  }
  ov.hidden = false;
  ov.removeAttribute("aria-hidden");
}

document.getElementById("btnHeaderQr")?.addEventListener("click", (e) => {
  e.preventDefault();
  openExpQrModal();
});
document.getElementById("expQrOverlayClose")?.addEventListener("click", closeExpQrModal);
document.getElementById("expQrBackdrop")?.addEventListener("click", closeExpQrModal);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const ov = document.getElementById("expQrOverlay");
  if (ov && !ov.hidden) closeExpQrModal();
});

// ─── Estado de la experiencia ───────────────────────────────────────────────
let expState = "urna";
let simboloActual = null;
let preguntaActual = 0;
let correctas = 0;
let incorrectas = 0;
let opcionSeleccionada = 0;
let simboloSeleccionado = 0;
let sesionSimbolosVistos = [];

// ─── Cronómetro ─────────────────────────────────────────────────────────────
let cronStart = null;
const elCron = document.getElementById("cronometro");

function iniciarCronometro() {
  cronStart = Date.now();
  setInterval(() => {
    const secs = Math.floor((Date.now() - cronStart) / 1000);
    elCron.textContent = fmtTime(secs);
  }, 500);
}

function fmtTime(secs) {
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

function tiempoTotal() {
  if (!cronStart) return "00:00";
  return fmtTime(Math.floor((Date.now() - cronStart) / 1000));
}

// ─── Secciones DOM ──────────────────────────────────────────────────────────
const secciones = {
  urna:     document.getElementById("seccionUrna"),
  simbolos: document.getElementById("seccionSimbolos"),
  pregunta: document.getElementById("seccionPregunta"),
  feedback: document.getElementById("seccionFeedback"),
  qr:       document.getElementById("seccionQr"),
};

function mostrarSeccion(nombre) {
  expState = nombre;
  Object.values(secciones).forEach(el => { if (el) el.style.display = "none"; });
  if (secciones[nombre]) secciones[nombre].style.display = "flex";
}

// ─── HUD ────────────────────────────────────────────────────────────────────
const elContador = document.getElementById("contadorPreguntas");
const elHud = document.getElementById("expHud");

function mostrarContador(num, total) {
  elContador.textContent = `${num}/${total}`;
  elContador.style.visibility = "visible";
}

function ocultarContador() {
  elContador.style.visibility = "hidden";
}

// ─── Three.js — Urna ─────────────────────────────────────────────────────────
const canvas = document.getElementById("urnaCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1000);
camera.position.set(0, 0, 3.2);

// Iluminación mejorada
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.8);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x6aa9ff, 0.8);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffa060, 0.6);
rimLight.position.set(0, -3, -4);
scene.add(rimLight);
scene.add(new THREE.HemisphereLight(0x3a6090, 0x0b1020, 0.6));

let urnaGroup = null;
let autoRotate = true;
let urnaLoaded = false;

function centrarModelo(group) {
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  group.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  // Normalizar: la dimensión mayor = 1 (el encuadre lo hace ajustarCamaraAUrna)
  group.scale.setScalar(1 / maxDim);
  group.position.y -= 0.04;
}

/** Distancia de cámara para que la urna quepa con margen según FOV y aspecto */
function ajustarCamaraAUrna() {
  if (!urnaGroup) return;
  const box = new THREE.Box3().setFromObject(urnaGroup);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.05);
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.25));
  const margin = 1.12;
  const distV = (maxDim * margin) / (2 * Math.tan(vFov / 2));
  const distH = (maxDim * margin) / (2 * Math.tan(hFov / 2));
  const dist = Math.min(Math.max(Math.max(distV, distH), 1.75), 10);
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
}

const gltfLoader = new GLTFLoader();
gltfLoader.load(
  "InteraccionControl/Frontend/model/Urna.glb",
  (gltf) => {
    urnaGroup = gltf.scene;
    centrarModelo(urnaGroup);
    scene.add(urnaGroup);
    urnaLoaded = true;
    forceSizeRenderer();
    ajustarCamaraAUrna();
    scheduleUrnaLayoutRemeasure();
    ocultarCarga();
  },
  undefined,
  () => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.65, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 1.0, 32), mat);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.40, 0.22, 32), mat);
    neck.position.y = 0.61;
    const rim  = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.10, 32), mat);
    rim.position.y = 0.76;
    group.add(body, neck, rim);
    centrarModelo(group);
    urnaGroup = group;
    scene.add(urnaGroup);
    urnaLoaded = true;
    forceSizeRenderer();
    ajustarCamaraAUrna();
    scheduleUrnaLayoutRemeasure();
    ocultarCarga();
  }
);

let _urnaBufW = 0;
let _urnaBufH = 0;

/** Límite seguro: en Firefox los atributos width/height del canvas pueden re-disparar layout; nunca pasar del viewport. */
function capWebGLSize(w, h) {
  const vv = typeof visualViewport !== "undefined" ? visualViewport : null;
  const maxW = Math.min(4096, Math.ceil((vv?.width ?? window.innerWidth) * 1.25));
  const maxH = Math.min(4096, Math.ceil((vv?.height ?? window.innerHeight) * 1.25));
  return {
    w: Math.min(Math.max(2, Math.floor(w)), maxW),
    h: Math.min(Math.max(2, Math.floor(h)), maxH),
  };
}

// Tamaño del wrap sin superar el viewport (evita bucle WebGL + ResizeObserver en Firefox)
function forceSizeRenderer() {
  const wrap = document.getElementById("urnaCanvasWrap");
  if (!wrap) return;
  let w = wrap.clientWidth;
  let h = wrap.clientHeight;
  if (w < 8 || h < 8) {
    w = window.innerWidth;
    h = Math.max(200, window.innerHeight - 56);
  }
  const capped = capWebGLSize(w, h);
  w = capped.w;
  h = capped.h;
  if (w === _urnaBufW && h === _urnaBufH) return;
  _urnaBufW = w;
  _urnaBufH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (urnaLoaded) ajustarCamaraAUrna();
}

function resizeRenderer() {
  if (expState !== "urna") return;
  forceSizeRenderer();
}

/** Tras cambiar display/flex, un frame más tarde el clientWidth del wrap ya es correcto */
function scheduleUrnaLayoutRemeasure() {
  requestAnimationFrame(() => {
    _urnaBufW = 0;
    _urnaBufH = 0;
    if (expState === "urna") forceSizeRenderer();
  });
}

window.addEventListener("resize", resizeRenderer);
if (typeof visualViewport !== "undefined" && visualViewport) {
  visualViewport.addEventListener("resize", resizeRenderer);
}

// ─── Loop de animación ───────────────────────────────────────────────────────
(function loop() {
  requestAnimationFrame(loop);
  if (expState === "urna") {
    if (urnaGroup && autoRotate) urnaGroup.rotation.y += 0.004;
    tickGamepad();
    if (urnaLoaded) renderer.render(scene, camera);
  } else {
    tickGamepadNav();
  }
})();

// ─── Gamepad + teclado (mismo cooldown de navegación) ───────────────────────
const DEADZONE = 0.18;
let lastBtn0 = false;
let navCooldown = 0;

function getGamepad() {
  return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(g => g && g.connected);
}

function tickGamepad() {
  const gp = getGamepad();
  if (!gp || !urnaGroup) return;

  const ax = gp.axes[0] ?? 0;
  const ay = gp.axes[1] ?? 0;
  const moving = Math.abs(ax) > DEADZONE || Math.abs(ay) > DEADZONE;

  if (Math.abs(ax) > DEADZONE) { urnaGroup.rotation.y += ax * 0.035; autoRotate = false; }
  if (Math.abs(ay) > DEADZONE) { urnaGroup.rotation.x += ay * 0.035; autoRotate = false; }
  if (!moving) autoRotate = true;

  if (gp.buttons[5]?.pressed) camera.position.z = Math.max(1.6, camera.position.z - 0.05);
  if (gp.buttons[4]?.pressed) camera.position.z = Math.min(11, camera.position.z + 0.05);
}

function tickGamepadNav() {
  const gp = getGamepad();
  if (!gp) return;
  const now = performance.now();

  const dL = gp.buttons[14]?.pressed || (gp.axes[2] ?? 0) < -DEADZONE;
  const dR = gp.buttons[15]?.pressed || (gp.axes[2] ?? 0) > DEADZONE;
  const dU = gp.buttons[12]?.pressed || (gp.axes[3] ?? 0) < -DEADZONE;
  const dD = gp.buttons[13]?.pressed || (gp.axes[3] ?? 0) > DEADZONE;

  if (now > navCooldown) {
    if (expState === "simbolos") {
      const total = SIMBOLOS_DATA.length;
      if (dL) { simboloSeleccionado = (simboloSeleccionado - 1 + total) % total; resaltarSimbolo(simboloSeleccionado); navCooldown = now + 220; }
      if (dR) { simboloSeleccionado = (simboloSeleccionado + 1) % total; resaltarSimbolo(simboloSeleccionado); navCooldown = now + 220; }
    }
    if (expState === "pregunta") {
      const tot = SIMBOLOS_DATA[simboloActual]?.preguntas[preguntaActual]?.opciones.length ?? 4;
      if (dU) { opcionSeleccionada = (opcionSeleccionada - 1 + tot) % tot; resaltarOpcion(opcionSeleccionada); navCooldown = now + 220; }
      if (dD) { opcionSeleccionada = (opcionSeleccionada + 1) % tot; resaltarOpcion(opcionSeleccionada); navCooldown = now + 220; }
    }
  }

  const pressed = gp.buttons[0]?.pressed ?? false;
  if (pressed && !lastBtn0) {
    if (expState === "simbolos") seleccionarSimbolo(simboloSeleccionado);
    else if (expState === "pregunta") confirmarOpcion(opcionSeleccionada);
    else if (expState === "feedback") document.getElementById("btnSiguiente")?.click();
    else if (expState === "qr") document.getElementById("btnSeguir")?.click();
  }
  lastBtn0 = pressed;
}

function isFormFieldTarget(el) {
  if (!el || el === document.body) return false;
  const t = el.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
  return !!(el.isContentEditable && el.isContentEditable !== "false");
}

function expQrOverlayIsOpen() {
  const ov = document.getElementById("expQrOverlay");
  return !!(ov && !ov.hidden);
}

function setupUrnaPointerControls() {
  const wrap = document.getElementById("urnaCanvasWrap");
  if (!wrap) return;
  const drag = { active: false, id: -1, lx: 0, ly: 0 };

  wrap.addEventListener("pointerdown", (e) => {
    if (expState !== "urna" || expQrOverlayIsOpen()) return;
    if (e.button !== 0) return;
    const t = e.target;
    if (t.closest?.(".urna-media-bar") || t.closest?.("#loadingScreen") || t.closest?.("#urnaCountdown")) return;
    drag.active = true;
    drag.id = e.pointerId;
    drag.lx = e.clientX;
    drag.ly = e.clientY;
    try {
      wrap.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.lx;
    const dy = e.clientY - drag.ly;
    drag.lx = e.clientX;
    drag.ly = e.clientY;
    if (urnaGroup) {
      urnaGroup.rotation.y += dx * 0.005;
      urnaGroup.rotation.x += dy * 0.005;
      autoRotate = false;
    }
  });

  function endDrag(e) {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    drag.id = -1;
    try {
      wrap.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  wrap.addEventListener("pointerup", endDrag);
  wrap.addEventListener("pointercancel", endDrag);

  wrap.addEventListener(
    "wheel",
    (e) => {
      if (expState !== "urna" || expQrOverlayIsOpen()) return;
      if (e.target.closest?.(".urna-media-bar")) return;
      e.preventDefault();
      const step = Math.min(0.35, Math.abs(e.deltaY) * 0.008);
      const dz = e.deltaY > 0 ? step : -step;
      camera.position.z = Math.min(11, Math.max(1.6, camera.position.z + dz));
    },
    { passive: false }
  );
}

function setupPreviewKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    if (isFormFieldTarget(e.target)) return;

    if (expState === "urna" && !expQrOverlayIsOpen()) {
      if (e.target.closest?.(".urna-media-bar")) return;
      const step = e.repeat ? 0.035 : 0.07;
      if (e.key === "ArrowLeft") {
        if (urnaGroup) urnaGroup.rotation.y -= step;
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowRight") {
        if (urnaGroup) urnaGroup.rotation.y += step;
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        if (urnaGroup) urnaGroup.rotation.x -= step;
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        if (urnaGroup) urnaGroup.rotation.x += step;
        e.preventDefault();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        camera.position.z = Math.max(1.6, camera.position.z - 0.18);
        e.preventDefault();
        return;
      }
      if (e.key === "-" || e.key === "_") {
        camera.position.z = Math.min(11, camera.position.z + 0.18);
        e.preventDefault();
        return;
      }
    }

    const now = performance.now();
    const isArrowNav =
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown";
    if (isArrowNav && now <= navCooldown) return;

    if (expState === "simbolos") {
      const total = SIMBOLOS_DATA.length;
      if (e.key === "ArrowLeft") {
        simboloSeleccionado = (simboloSeleccionado - 1 + total) % total;
        resaltarSimbolo(simboloSeleccionado);
        navCooldown = now + 220;
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowRight") {
        simboloSeleccionado = (simboloSeleccionado + 1) % total;
        resaltarSimbolo(simboloSeleccionado);
        navCooldown = now + 220;
        e.preventDefault();
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
        seleccionarSimbolo(simboloSeleccionado);
        e.preventDefault();
      }
      return;
    }

    if (expState === "pregunta") {
      const tot = SIMBOLOS_DATA[simboloActual]?.preguntas[preguntaActual]?.opciones.length ?? 4;
      if (e.key === "ArrowUp") {
        opcionSeleccionada = (opcionSeleccionada - 1 + tot) % tot;
        resaltarOpcion(opcionSeleccionada);
        navCooldown = now + 220;
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        opcionSeleccionada = (opcionSeleccionada + 1) % tot;
        resaltarOpcion(opcionSeleccionada);
        navCooldown = now + 220;
        e.preventDefault();
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
        confirmarOpcion(opcionSeleccionada);
        e.preventDefault();
      }
      return;
    }

    if (expState === "feedback" && (e.key === "Enter" || e.key === " ") && !e.repeat) {
      if (e.target.id === "btnSiguiente") return;
      e.preventDefault();
      document.getElementById("btnSiguiente")?.click();
      return;
    }
    if (expState === "qr" && (e.key === "Enter" || e.key === " ") && !e.repeat) {
      if (e.target.id === "btnSeguir") return;
      e.preventDefault();
      document.getElementById("btnSeguir")?.click();
    }
  });
}

setupUrnaPointerControls();
setupPreviewKeyboardNav();

// ─── WebSocket (solo si ?ws=1 o servidor de interacción activo; evita errores en consola) ──
(function tryWS() {
  const want = new URLSearchParams(window.location.search).get("ws") === "1";
  if (!want) return;
  let ws;
  try {
    ws = new WebSocket("ws://localhost:8080");
  } catch {
    return;
  }
  ws.addEventListener("message", (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (!urnaGroup || expState !== "urna") return;
      if (d.type === "joystick") {
        urnaGroup.rotation.y += (d.x ?? 0) * 0.035;
        urnaGroup.rotation.x += (d.y ?? 0) * 0.035;
        autoRotate = false;
      }
    } catch {}
  });
})();

// ─── Pantalla de carga ────────────────────────────────────────────────────────
function ocultarCarga() {
  const ls = document.getElementById("loadingScreen");
  if (!ls) return;
  ls.classList.add("fade-out");
  setTimeout(() => { ls.style.display = "none"; }, 500);
  if (elHud) elHud.style.opacity = "1";
}

// ─── ESTADO: URNA ────────────────────────────────────────────────────────────
let countdownSecs = 60;
let countdownTimer = null;

function iniciarUrna() {
  mostrarSeccion("urna");
  ocultarContador();
  iniciarCronometro();

  // Nombre del usuario en la pantalla
  const welcomeEl = document.getElementById("urnaWelcomeUser");
  if (welcomeEl && session.nombre) {
    welcomeEl.textContent = `Bienvenid@, ${session.nombre}`;
  }

  resizeRenderer();
  scheduleUrnaLayoutRemeasure();
  if (urnaLoaded) ajustarCamaraAUrna();
  countdownSecs = 60;
  actualizarCountdown();

  countdownTimer = setInterval(() => {
    countdownSecs--;
    actualizarCountdown();
    if (countdownSecs <= 0) {
      clearInterval(countdownTimer);
      transicionASimbolos();
    }
  }, 1000);
}

function actualizarCountdown() {
  const el = document.getElementById("urnaCountdown");
  if (!el) return;
  if (countdownSecs > 0) {
    el.innerHTML = `<span class="countdown-icon">⏳</span> Símbolos en <strong>${countdownSecs}s</strong>`;
    el.style.display = "flex";
  } else {
    el.style.display = "none";
  }
}

function transicionASimbolos() {
  pauseUrnaMedia();
  // Pequeña animación de salida antes de cambiar
  if (secciones.urna) {
    secciones.urna.style.transition = "opacity 0.4s";
    secciones.urna.style.opacity = "0";
    setTimeout(() => {
      secciones.urna.style.opacity = "";
      secciones.urna.style.transition = "";
      iniciarSimbolos();
    }, 400);
  } else {
    iniciarSimbolos();
  }
}

// ─── ESTADO: SÍMBOLOS ────────────────────────────────────────────────────────
function iniciarSimbolos() {
  simboloSeleccionado = 0;
  mostrarSeccion("simbolos");
  ocultarContador();
  renderizarSimbolos();
}

function renderizarSimbolos() {
  const grid = document.getElementById("simbolosGrid");
  if (!grid) return;
  grid.innerHTML = "";
  SIMBOLOS_DATA.forEach((s, i) => {
    const visto = sesionSimbolosVistos.includes(s.id);
    const card = document.createElement("div");
    card.className = "simbolo-card" + (visto ? " simbolo-visto" : "");
    card.dataset.index = i;
    card.innerHTML = `
      <div class="simbolo-img-wrap">
        <img src="${s.imagen}" alt="${s.nombre}" class="simbolo-img"
             onerror="this.src='assets/qrppt.png'">
        ${visto ? '<div class="simbolo-visto-overlay"><span>✓</span></div>' : ""}
      </div>
      <span class="simbolo-nombre">${s.nombre}</span>
      ${visto ? '<span class="simbolo-badge">Explorado</span>' : '<span class="simbolo-badge-pending">Nuevo</span>'}
    `;
    card.addEventListener("click", () => seleccionarSimbolo(i));
    grid.appendChild(card);
    // Entrada con stagger
    setTimeout(() => card.classList.add("simbolo-card--visible"), i * 120);
  });
  resaltarSimbolo(0);
}

function resaltarSimbolo(idx) {
  simboloSeleccionado = idx;
  document.querySelectorAll(".simbolo-card").forEach((c, i) => {
    c.classList.toggle("simbolo-activo", i === idx);
  });
}

function seleccionarSimbolo(idx) {
  simboloActual = idx;
  preguntaActual = 0;
  correctas = 0;
  incorrectas = 0;
  mostrarPregunta();
}

// ─── ESTADO: PREGUNTA ────────────────────────────────────────────────────────
function mostrarPregunta() {
  mostrarSeccion("pregunta");
  opcionSeleccionada = 0;
  const sim   = SIMBOLOS_DATA[simboloActual];
  const preg  = sim.preguntas[preguntaActual];
  const total = sim.preguntas.length;

  mostrarContador(preguntaActual + 1, total);

  const tagEl = document.getElementById("preguntaSimboloNombre");
  if (tagEl) tagEl.textContent = sim.nombre;

  document.getElementById("preguntaContador").textContent = `${preguntaActual + 1} / ${total}`;
  document.getElementById("preguntaTexto").textContent = preg.texto;

  const wrap = document.getElementById("opcionesWrap");
  wrap.innerHTML = "";
  const letras = ["A", "B", "C", "D"];
  preg.opciones.forEach((op, i) => {
    const btn = document.createElement("button");
    btn.className = "opcion-btn";
    btn.dataset.index = i;
    btn.innerHTML = `<span class="opcion-letra">${letras[i]}</span><span class="opcion-text">${op}</span>`;
    btn.addEventListener("click", () => confirmarOpcion(i));
    wrap.appendChild(btn);
    setTimeout(() => btn.classList.add("opcion-btn--visible"), i * 80);
  });
  resaltarOpcion(0);
}

function resaltarOpcion(idx) {
  opcionSeleccionada = idx;
  document.querySelectorAll(".opcion-btn").forEach((b, i) => {
    b.classList.toggle("opcion-activa", i === idx);
  });
}

function confirmarOpcion(idx) {
  const preg = SIMBOLOS_DATA[simboloActual].preguntas[preguntaActual];
  const ok   = idx === preg.correcta;
  if (ok) correctas++; else incorrectas++;
  mostrarFeedback(ok, preg, idx);
}

// ─── ESTADO: FEEDBACK ────────────────────────────────────────────────────────
function mostrarFeedback(ok, preg, idxSel) {
  mostrarSeccion("feedback");

  const iconEl = document.getElementById("feedbackIcon");
  const msgEl  = document.getElementById("feedbackMensaje");
  const justEl = document.getElementById("feedbackJustificacion");
  const wrapEl = document.getElementById("feedbackIconWrap");

  iconEl.textContent = ok ? "✅" : "❌";
  iconEl.className   = "feedback-icon " + (ok ? "feedback-ok" : "feedback-fail");
  if (wrapEl) wrapEl.className = "feedback-icon-wrap " + (ok ? "feedback-ok-bg" : "feedback-fail-bg");
  msgEl.textContent  = ok ? "¡Correcto!" : "Incorrecto";
  msgEl.className    = "feedback-mensaje " + (ok ? "feedback-ok" : "feedback-fail");

  justEl.innerHTML = `
    <div class="just-correcta">
      <strong>Respuesta correcta:</strong> ${preg.opciones[preg.correcta]}
    </div>
    <div class="just-texto">${preg.justificacion}</div>
  `;

  reproducirSonido(ok);

  const sim     = SIMBOLOS_DATA[simboloActual];
  const esUltima = preguntaActual >= sim.preguntas.length - 1;
  const btnSig  = document.getElementById("btnSiguiente");
  btnSig.textContent = esUltima ? "Ver resultados 🏆" : "Siguiente ▶";
  btnSig.onclick = () => {
    if (esUltima) finalizarSimbolo();
    else { preguntaActual++; mostrarPregunta(); }
  };
}

// ─── Sonido Web Audio ────────────────────────────────────────────────────────
function reproducirSonido(ok) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.type = ok ? "triangle" : "sawtooth";
    if (ok) {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
    } else {
      osc.frequency.setValueAtTime(294, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.25);
    }
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.75);
  } catch {}
}

// ─── FINALIZAR SÍMBOLO ────────────────────────────────────────────────────────
function finalizarSimbolo() {
  const sim = SIMBOLOS_DATA[simboloActual];
  if (!sesionSimbolosVistos.includes(sim.id)) sesionSimbolosVistos.push(sim.id);

  saveResult({
    usuario: `${session.nombre || ""} ${session.apellido || ""}`.trim() || "Estudiante",
    simbolo: sim.nombre,
    tiempoTotal: tiempoTotal(),
    correctas,
    incorrectas,
    total: sim.preguntas.length
  });

  mostrarQR(sim.nombre, correctas, sim.preguntas.length);
}

// ─── ESTADO: QR ──────────────────────────────────────────────────────────────
function mostrarQR(nombre, corr, total) {
  mostrarSeccion("qr");
  ocultarContador();

  document.getElementById("qrResumen").innerHTML =
    `<strong>${nombre}</strong> · <span style="color:#22c55e;">${corr}✓</span> / ${total} preguntas · ⏱ ${tiempoTotal()}`;

  const container = document.getElementById("qrCanvas");
  container.innerHTML = "";
  try {
    new QRCode(container, {
      text: "https://linktr.ee/sanagustin_experiencia",
      width: 180,
      height: 180,
      colorDark: "#0b1020",
      colorLight: "#e9eeff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch {
    container.innerHTML = `<img src="assets/qrppt.png" style="width:180px;height:180px;object-fit:contain;">`;
  }

  const audioQr = document.getElementById("audioQr");
  if (audioQr) { audioQr.volume = 0.25; audioQr.play().catch(() => {}); }

  document.getElementById("btnSeguir").onclick = () => {
    if (audioQr) { audioQr.pause(); audioQr.currentTime = 0; }
    iniciarSimbolos();
  };
}

// ─── Audio / subtítulos (misma configuración que el panel Audios del admin) ──
let _urnaObjUrlMain = null;
let _urnaObjUrlAd = null;
let urnaAdActive = false;
let urnaSubsVisible = true;

function revokeUrnaMainUrl() {
  if (_urnaObjUrlMain) {
    URL.revokeObjectURL(_urnaObjUrlMain);
    _urnaObjUrlMain = null;
  }
}
function revokeUrnaAdUrl() {
  if (_urnaObjUrlAd) {
    URL.revokeObjectURL(_urnaObjUrlAd);
    _urnaObjUrlAd = null;
  }
}

function urnaAudioMainEl() {
  return document.getElementById("urnaAudioMain");
}
function urnaAudioAdEl() {
  return document.getElementById("urnaAudioAD");
}

async function wireUrnaAudioFromState(st) {
  const audioMain = urnaAudioMainEl();
  const audioAD = urnaAudioAdEl();
  if (!audioMain || !audioAD) return;

  if (st.audio?.mainUrlPath) {
    revokeUrnaMainUrl();
    audioMain.src = st.audio.mainUrlPath;
  } else if (st.audio?.mainBlobKey) {
    revokeUrnaMainUrl();
    const b = await idbGet(st.audio.mainBlobKey);
    if (b instanceof Blob) {
      _urnaObjUrlMain = URL.createObjectURL(b);
      audioMain.src = _urnaObjUrlMain;
    } else {
      audioMain.removeAttribute("src");
    }
  } else if (st.audio?.mainDataUrl) {
    revokeUrnaMainUrl();
    audioMain.src = st.audio.mainDataUrl;
  } else {
    revokeUrnaMainUrl();
    audioMain.removeAttribute("src");
  }

  if (st.audio?.adUrlPath) {
    revokeUrnaAdUrl();
    audioAD.src = st.audio.adUrlPath;
  } else if (st.audio?.adBlobKey) {
    revokeUrnaAdUrl();
    const b = await idbGet(st.audio.adBlobKey);
    if (b instanceof Blob) {
      _urnaObjUrlAd = URL.createObjectURL(b);
      audioAD.src = _urnaObjUrlAd;
    } else {
      audioAD.removeAttribute("src");
    }
  } else if (st.audio?.adDataUrl) {
    revokeUrnaAdUrl();
    audioAD.src = st.audio.adDataUrl;
  } else {
    revokeUrnaAdUrl();
    audioAD.removeAttribute("src");
  }

  if (audioMain.src) {
    try {
      audioMain.load();
    } catch {
      /* ignore */
    }
  }
  if (audioAD.src) {
    try {
      audioAD.load();
    } catch {
      /* ignore */
    }
  }
}

function playWhenReadyUrna(media) {
  if (!media?.src) return Promise.reject(new Error("sin audio"));
  const run = () => media.play();
  if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return run();
  return new Promise((resolve, reject) => {
    const onErr = () => {
      media.removeEventListener("canplay", onOk);
      reject(media.error || new Error("error de audio"));
    };
    const onOk = () => {
      media.removeEventListener("error", onErr);
      run().then(resolve).catch(reject);
    };
    media.addEventListener("canplay", onOk, { once: true });
    media.addEventListener("error", onErr, { once: true });
  });
}

function currentUrnaSubtitles() {
  const st = getAppState();
  if (urnaAdActive) {
    if (Array.isArray(st.subtitlesAD) && st.subtitlesAD.length) return st.subtitlesAD;
    if (Array.isArray(st.subtitlesMain) && st.subtitlesMain.length) return st.subtitlesMain;
    return [];
  }
  return st.subtitlesMain || [];
}

function updateUrnaSubtitle() {
  const el = document.getElementById("urnaSubtitle");
  if (!el) return;
  const st = getAppState();
  const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
  if (!hasAd && !urnaSubsVisible) {
    el.textContent = "";
    el.hidden = true;
    return;
  }
  const a = urnaAdActive ? urnaAudioAdEl() : urnaAudioMainEl();
  if (!a) return;
  const t = a.currentTime;
  const subs = currentUrnaSubtitles();
  const text = pickSubtitleAtTime(subs, t);
  const line = text || (a.paused ? "" : "");
  if (!urnaSubsVisible) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.textContent = line;
  el.hidden = !line;
}

function syncUrnaPlayPauseLabel() {
  const btn = document.getElementById("urnaBtnPlayPause");
  const main = urnaAudioMainEl();
  const ad = urnaAudioAdEl();
  if (!btn || !main) return;
  const st = getAppState();
  const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
  const use = urnaAdActive && hasAd ? ad : main;
  const btnRestart = document.getElementById("urnaBtnRestart");
  if (!main.src) {
    btn.disabled = true;
    btn.textContent = "Sin audio";
    if (btnRestart) btnRestart.disabled = true;
    return;
  }
  btn.disabled = false;
  if (btnRestart) btnRestart.disabled = false;
  const playing = use && !use.paused;
  btn.textContent = playing ? "Pausar" : "Reproducir";
}

function bindUrnaAudioSubtitleSync() {
  const main = urnaAudioMainEl();
  const ad = urnaAudioAdEl();
  if (!main || !ad) return;
  ["timeupdate", "play", "pause", "seeked", "loadedmetadata"].forEach((ev) => {
    main.addEventListener(ev, () => {
      updateUrnaSubtitle();
      syncUrnaPlayPauseLabel();
    });
    ad.addEventListener(ev, () => {
      updateUrnaSubtitle();
      syncUrnaPlayPauseLabel();
    });
  });
}

function setupUrnaMediaControls() {
  const btnPlay = document.getElementById("urnaBtnPlayPause");
  const btnSubs = document.getElementById("urnaBtnSubs");
  const btnAD = document.getElementById("urnaBtnAD");
  const st = getAppState();
  const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);

  if (btnAD) {
    btnAD.hidden = !hasAd;
    btnAD.classList.toggle("btn-active", urnaAdActive);
  }

  btnPlay?.addEventListener("click", () => {
    const main = urnaAudioMainEl();
    const ad = urnaAudioAdEl();
    if (!main?.src) return;
    const useHasAd = !!(getAppState().audio?.adDataUrl || getAppState().audio?.adUrlPath || getAppState().audio?.adBlobKey);
    const use = urnaAdActive && useHasAd ? ad : main;
    const other = urnaAdActive && useHasAd ? main : ad;
    if (use.paused) {
      other.pause();
      playWhenReadyUrna(use).catch(() => {});
    } else {
      use.pause();
    }
    updateUrnaSubtitle();
    syncUrnaPlayPauseLabel();
  });

  document.getElementById("urnaBtnRestart")?.addEventListener("click", () => {
    const main = urnaAudioMainEl();
    const ad = urnaAudioAdEl();
    if (!main?.src) return;
    const useHasAd = !!(getAppState().audio?.adDataUrl || getAppState().audio?.adUrlPath || getAppState().audio?.adBlobKey);
    const use = urnaAdActive && useHasAd ? ad : main;
    const other = urnaAdActive && useHasAd ? main : ad;
    main.currentTime = 0;
    ad.currentTime = 0;
    other.pause();
    playWhenReadyUrna(use).catch(() => {});
    updateUrnaSubtitle();
    syncUrnaPlayPauseLabel();
  });

  btnSubs?.addEventListener("click", () => {
    urnaSubsVisible = !urnaSubsVisible;
    btnSubs.classList.toggle("btn-active", urnaSubsVisible);
    updateUrnaSubtitle();
  });

  btnAD?.addEventListener("click", () => {
    if (!hasAd) return;
    const main = urnaAudioMainEl();
    const ad = urnaAudioAdEl();
    if (!main || !ad) return;
    const t = urnaAdActive ? ad.currentTime : main.currentTime;
    main.pause();
    ad.pause();
    urnaAdActive = !urnaAdActive;
    if (urnaAdActive) {
      if (!ad.src) {
        urnaAdActive = false;
        return;
      }
      ad.currentTime = t;
      playWhenReadyUrna(ad).catch(() => {});
    } else {
      main.currentTime = t;
      if (main.src) playWhenReadyUrna(main).catch(() => {});
    }
    btnAD.classList.toggle("btn-active", urnaAdActive);
    updateUrnaSubtitle();
    syncUrnaPlayPauseLabel();
  });

  syncUrnaPlayPauseLabel();
  updateUrnaSubtitle();
}

function pauseUrnaMedia() {
  urnaAudioMainEl()?.pause();
  urnaAudioAdEl()?.pause();
  syncUrnaPlayPauseLabel();
}

async function initUrnaMediaFromProject() {
  try {
    await hydrateAppStateFromStorage();
    await wireUrnaAudioFromState(getAppState());
    bindUrnaAudioSubtitleSync();
    setupUrnaMediaControls();
  } catch (e) {
    console.warn("initUrnaMediaFromProject", e);
  }
}

// ─── ARRANCAR ────────────────────────────────────────────────────────────────
initUrnaMediaFromProject().finally(() => {
  iniciarUrna();
});
