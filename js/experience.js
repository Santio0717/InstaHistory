import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  getSession,
  getAppState,
  mergeAppState,
  fileToDataUrl,
  logout,
  SYNC_CHANNEL,
  pullAppStateFromIdbOnly,
  defaultSubtitlesMain,
  pickSubtitleAtTime,
  BLOB_AUDIO_MAIN,
  BLOB_AUDIO_AD,
  BLOB_AUDIO_IMAGE,
  BLOB_MODEL,
} from "./state.js";
import { idbGet, idbPut, idbDelete } from "./idb.js";
import {
  parseObjFromDataUrl,
  parseGltfFromDataUrl,
  parseGltfFromDataUrlAuto,
} from "./modelLoaders.js";
import { PROJECT_AUDIO_FILES, PROJECT_MODEL_FILES } from "./projectAssets.js";

function filterModelNames(names) {
  return names.filter((f) => /\.(obj|glb|gltf)$/i.test(f));
}

function filterAudioNames(names) {
  return names.filter((f) => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f));
}

async function resolveAssetFileList(manifestUrl, indexUrl, filterFn, fallbackList) {
  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j.files) && j.files.length) {
        const names = j.files.map((x) =>
          decodeURIComponent(String(x).replace(/^.*\//, "").split("?")[0])
        );
        const ok = filterFn(names);
        if (ok.length) return ok;
      }
    }
  } catch {}
  try {
    const res = await fetch(indexUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const raw = [...doc.querySelectorAll("a")]
      .map((a) => a.getAttribute("href"))
      .filter(Boolean);
    const names = raw.map((href) => decodeURIComponent(href.split("/").pop() || href));
    const ok = filterFn(names);
    if (ok.length) return ok;
  } catch {}
  return filterFn(fallbackList || []);
}

if (getSession()?.role !== "admin") {
  window.location.replace("index.html");
} else {

const menuButtons = document.querySelectorAll(".menu-btn");
const panels = document.querySelectorAll(".content-panel");

const canvas = document.getElementById("threeCanvas");
const previewStackEl = document.getElementById("previewStack");
let _lastRendererW = 0;
let _lastRendererH = 0;

function updateRendererSize() {
  if (!previewStackEl || !canvas) return;
  const r = previewStackEl.getBoundingClientRect();
  let w = Math.floor(r.width);
  let h = Math.floor(r.height);
  if (w < 32) w = 520;
  if (h < 32) h = 400;
  if (w === _lastRendererW && h === _lastRendererH) return;
  _lastRendererW = w;
  _lastRendererH = h;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

const previewAudioImg = document.getElementById("previewAudioImg");
const previewAnimVideo = document.getElementById("previewAnimVideo");
const previewAnimGif = document.getElementById("previewAnimGif");
const previewBadge = document.getElementById("previewBadge");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.z = 4;

scene.add(new THREE.AmbientLight(0xffffff, 1.15));
scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1.8);
dir.position.set(3, 5, 2);
scene.add(dir);
const fill = new THREE.DirectionalLight(0xcfdfff, 1.1);
fill.position.set(-3, 2.5, 2.2);
scene.add(fill);

const modelGroup = new THREE.Group();
const animRoot = new THREE.Group();
scene.add(modelGroup);
scene.add(animRoot);

const clock = new THREE.Clock();
let mixer = null;
let gltfAnim = null;
let sanAgustinAnimNode = null;

const statusText = document.getElementById("statusText");
const modelFileName = document.getElementById("modelFileName");
const modelOpacity = document.getElementById("modelOpacity");

const audioMain = document.getElementById("audioMain");
const audioAD = document.getElementById("audioAD");
const subtitleEl = document.getElementById("subtitle");
const previewSubtitleEl = document.getElementById("previewSubtitle");
const previewAnimSubtitlePublic = document.getElementById("previewAnimSubtitlePublic");

let _objUrlAudioMain = null;
let _objUrlAudioAD = null;
let _objUrlImage = null;
let _objUrlModel = null;
let _objUrlAnimModel = null;
const _originalMaterialProps = new WeakMap();

function revokeAudioMainObjUrl() {
  if (_objUrlAudioMain) {
    URL.revokeObjectURL(_objUrlAudioMain);
    _objUrlAudioMain = null;
  }
}
function revokeAudioADObjUrl() {
  if (_objUrlAudioAD) {
    URL.revokeObjectURL(_objUrlAudioAD);
    _objUrlAudioAD = null;
  }
}
function revokeImageObjUrl() {
  if (_objUrlImage) {
    URL.revokeObjectURL(_objUrlImage);
    _objUrlImage = null;
  }
}
function revokeModelObjUrl() {
  if (_objUrlModel) {
    URL.revokeObjectURL(_objUrlModel);
    _objUrlModel = null;
  }
}
function revokeAnimModelObjUrl() {
  if (_objUrlAnimModel) {
    URL.revokeObjectURL(_objUrlAnimModel);
    _objUrlAnimModel = null;
  }
}

const audioAnim = document.getElementById("audioAnim");
const audioAnimAD = document.getElementById("audioAnimAD");
const animSubtitleEl = document.getElementById("animSubtitle");

let adActive = false;
let subsVisible = true;
let animAdActive = false;

function reflectPanelUI(panelId) {
  menuButtons.forEach((b) => {
    b.classList.toggle("active", b.dataset.panel === panelId);
  });
  panels.forEach((p) => {
    p.classList.toggle("active-panel", p.id === `panel-${panelId}`);
  });
  applyPreviewLayout(panelId);
}

function setPanel(panelId) {
  mergeAppState({ lastPanel: panelId });
  reflectPanelUI(panelId);
  if (panelId === "juego") renderJuegoPanel();
  if (panelId === "reportes") renderReportesPanel();
  if (panelId === "testimonios") renderTestimoniosPanel();
}

async function loadModelsFromServer() {
  const modelsList = document.getElementById("modelsList");
  if (!modelsList) return;
  try {
    const files = await resolveAssetFileList(
      "./assets/modelos/manifest.json",
      "./assets/modelos/",
      filterModelNames,
      PROJECT_MODEL_FILES
    );
    modelsList.innerHTML = "";
    if (!files.length) {
      modelsList.innerHTML =
        "<p class=\"muted\">No hay modelos listados. Edita <code>assets/modelos/manifest.json</code> o <code>js/projectAssets.js</code> (export <code>PROJECT_MODEL_FILES</code>).</p>";
      return;
    }
    files.forEach((f) => {
      const lower = f.toLowerCase();
      let kind = "obj";
      if (lower.endsWith(".glb")) kind = "glb";
      else if (lower.endsWith(".gltf")) kind = "gltf";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary modelItem";
      btn.textContent = f;
      btn.onclick = async () => {
        const path = `./assets/modelos/${encodeURIComponent(f)}`;
        revokeModelObjUrl();
        await idbDelete(BLOB_MODEL);
        const next = mergeAppState({
          model: { kind, urlPath: path, name: f, dataUrl: null, blobKey: null },
        });
        await loadModelFromState(next);
        reflectPanelUI("modelos");
      };
      modelsList.appendChild(btn);
    });
  } catch {
    modelsList.innerHTML =
      "<p class=\"muted\">Error al cargar la lista de modelos. Revisa la consola o el manifiesto.</p>";
  }
}

async function loadProjectAudios() {
  const el = document.getElementById("projectAudiosList");
  if (!el) return;
  try {
    const files = await resolveAssetFileList(
      "./assets/audio/manifest.json",
      "./assets/audio/",
      filterAudioNames,
      PROJECT_AUDIO_FILES
    );
    el.innerHTML = "";
    if (!files.length) {
      return;
    }
    files.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary modelItem";
      btn.textContent = f;
      btn.onclick = async () => {
        const path = `./assets/audio/${encodeURIComponent(f)}`;
        mergeAppState({
          audio: {
            ...getAppState().audio,
            mainUrlPath: path,
            mainDataUrl: null,
            mainBlobKey: null,
            mainName: f,
          },
        });
        await wireAudioFromState(getAppState());
        applyPreviewLayout("audios");
      };
      el.appendChild(btn);
    });
  } catch {
    el.innerHTML =
      "<p class=\"muted\">No se pudo cargar la lista de audios. Comprueba <code>manifest.json</code> o la consola del navegador.</p>";
  }
}

menuButtons.forEach((btn) => {
  btn.onclick = () => setPanel(btn.dataset.panel);
});

document.getElementById("btnLogout").onclick = () => logout();

function animateLoop() {
  requestAnimationFrame(animateLoop);
  updateRendererSize();
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  if (sanAgustinAnimNode && animRoot.visible) {
    sanAgustinAnimNode.rotation.y += dt * 0.7;
  }
  renderer.render(scene, camera);
}
animateLoop();
window.addEventListener("resize", updateRendererSize);
if (typeof ResizeObserver !== "undefined" && previewStackEl) {
  new ResizeObserver(() => updateRendererSize()).observe(previewStackEl);
}
requestAnimationFrame(updateRendererSize);

function applyPreviewLayout(panel) {
  const st = getAppState();
  const p = panel || st.lastPanel || "modelos";
  const hasAudioImage = !!(st.audio?.imageDataUrl || st.audio?.imageBlobKey);
  const hasModel = !!(st.model?.urlPath || st.model?.dataUrl || st.model?.blobKey);

  const hideCanvasForAnim =
    p === "animaciones" &&
    st.animation &&
    (st.animation.kind === "video" || st.animation.kind === "gif");
  const showCanvasInAudio = p === "audios" && !hasAudioImage && hasModel;
  canvas.style.display = showCanvasInAudio || (p !== "audios" && !hideCanvasForAnim) ? "block" : "none";
  previewAudioImg.hidden = p !== "audios" || !hasAudioImage;
  previewAnimVideo.hidden = p !== "animaciones" || !st.animation || st.animation.kind !== "video";
  previewAnimGif.hidden = p !== "animaciones" || !st.animation || st.animation.kind !== "gif";

  if (p === "modelos") {
    if (previewBadge) previewBadge.textContent = "Modelo 3D";
    modelGroup.visible = true;
    animRoot.visible = false;
  } else if (p === "audios") {
    if (previewBadge) previewBadge.textContent = "Audio + imagen";
    modelGroup.visible = showCanvasInAudio;
    animRoot.visible = false;
  } else if (p === "juego" || p === "reportes" || p === "testimonios") {
    if (previewBadge) {
      previewBadge.textContent =
        p === "juego" ? "Juego" : p === "reportes" ? "Reportes" : "Testimonios";
    }
    modelGroup.visible = false;
    animRoot.visible = false;
    canvas.style.display = "none";
  } else {
    if (previewBadge) previewBadge.textContent = "Animación";
    modelGroup.visible = false;
    animRoot.visible = !!(st.animation && st.animation.enabled !== false);
  }

  if (previewSubtitleEl) {
    previewSubtitleEl.hidden = p !== "audios";
    if (p === "audios") updateSubtitleFromAudio();
  }
  if (previewAnimSubtitlePublic) {
    previewAnimSubtitlePublic.hidden = p !== "animaciones";
    if (p === "animaciones") updateAnimSubtitle();
  }

  const idle = document.getElementById("previewIdlePanel");
  if (idle) {
    const showIdle = p === "reportes" || p === "juego" || p === "testimonios";
    idle.hidden = !showIdle;
    idle.setAttribute("aria-hidden", showIdle ? "false" : "true");
  }
}

function applyOpacityToObject3D(root, pct) {
  const pctClamped = Math.max(0, Math.min(100, Number(pct)));
  const v = pctClamped / 100;
  const restoreOriginal = pctClamped >= 99;
  root.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m || typeof m.opacity !== "number") return;

      if (!_originalMaterialProps.has(m)) {
        _originalMaterialProps.set(m, {
          opacity: m.opacity,
          transparent: m.transparent,
          depthWrite: m.depthWrite,
          blending: m.blending,
        });
      }
      const original = _originalMaterialProps.get(m);

      if (restoreOriginal) {
        m.opacity = original.opacity;
        m.transparent = original.transparent;
        m.depthWrite = original.depthWrite;
        m.blending = original.blending;
        m.needsUpdate = true;
        return;
      }

      m.transparent = true;
      m.opacity = Math.max(0.01, original.opacity * v);
      m.depthWrite = false;
      m.needsUpdate = true;
      if (m.premultipliedAlpha) m.blending = THREE.NormalBlending;
    });
  });
}

modelOpacity.addEventListener("input", () => {
  applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
});
modelOpacity.addEventListener("change", () => {
  applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
});

document.getElementById("resetView").onclick = () => {
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  modelGroup.rotation.set(0, 0, 0);
  animRoot.rotation.set(0, 0, 0);
};

document.getElementById("clearModel").onclick = async () => {
  while (modelGroup.children.length) modelGroup.remove(modelGroup.children[0]);
  revokeModelObjUrl();
  try {
    await idbDelete(BLOB_MODEL);
  } catch {}
  mergeAppState({ model: null });
  modelFileName.textContent = "Ninguno";
  statusText.textContent = "Modelo eliminado.";
};

const objLoader = new OBJLoader();
const gltfLoader = new GLTFLoader();

async function loadModelFromState(st) {
  while (modelGroup.children.length) modelGroup.remove(modelGroup.children[0]);
  if (!st.model?.dataUrl && !st.model?.urlPath && !st.model?.blobKey) {
    modelFileName.textContent = "Ninguno";
    return;
  }
  modelFileName.textContent = st.model.name || "Modelo";
  const kind = st.model.kind || "obj";

  try {
    if (st.model.urlPath && !st.model.dataUrl && !st.model.blobKey) {
      const path = st.model.urlPath;
      if (kind === "glb" || kind === "gltf") {
        await new Promise((resolve, reject) => {
          gltfLoader.load(
            path,
            (gltf) => {
              modelGroup.add(gltf.scene);
              fitCameraToObject(gltf.scene);
              applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
              statusText.textContent = "Modelo del proyecto cargado.";
              updateRendererSize();
              resolve();
            },
            undefined,
            reject
          );
        });
      } else {
        await new Promise((resolve, reject) => {
          objLoader.load(
            path,
            (obj) => {
              modelGroup.add(obj);
              fitCameraToObject(obj);
              applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
              statusText.textContent = "Modelo OBJ del proyecto cargado.";
              updateRendererSize();
              resolve();
            },
            undefined,
            reject
          );
        });
      }
      return;
    }

    if (st.model.blobKey && !st.model.dataUrl) {
      const b = await idbGet(st.model.blobKey);
      if (!(b instanceof Blob)) {
        modelFileName.textContent = "Ninguno";
        statusText.textContent = "No se encontró el archivo del modelo en IndexedDB.";
        return;
      }
      revokeModelObjUrl();
      _objUrlModel = URL.createObjectURL(b);
      const path = _objUrlModel;
      if (kind === "glb" || kind === "gltf") {
        await new Promise((resolve, reject) => {
          gltfLoader.load(
            path,
            (gltf) => {
              modelGroup.add(gltf.scene);
              fitCameraToObject(gltf.scene);
              applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
              statusText.textContent = "Modelo cargado desde archivo.";
              updateRendererSize();
              resolve();
            },
            undefined,
            reject
          );
        });
      } else {
        await new Promise((resolve, reject) => {
          objLoader.load(
            path,
            (obj) => {
              modelGroup.add(obj);
              fitCameraToObject(obj);
              applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
              statusText.textContent = "Modelo OBJ cargado desde archivo.";
              updateRendererSize();
              resolve();
            },
            undefined,
            reject
          );
        });
      }
      return;
    }

    const url = st.model.dataUrl;
    if (kind === "glb" || kind === "gltf") {
      const gltf = await parseGltfFromDataUrl(gltfLoader, url, kind);
      modelGroup.add(gltf.scene);
      fitCameraToObject(gltf.scene);
      applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
      statusText.textContent = kind === "glb" ? "Modelo GLB cargado." : "Modelo GLTF cargado.";
      updateRendererSize();
    } else {
      const obj = await parseObjFromDataUrl(objLoader, url);
      modelGroup.add(obj);
      fitCameraToObject(obj);
      applyOpacityToObject3D(modelGroup, Number(modelOpacity.value));
      statusText.textContent = "Modelo OBJ cargado.";
      updateRendererSize();
    }
  } catch (e) {
    console.error(e);
    statusText.textContent =
      e?.message || "Error al cargar el modelo. Prueba otro archivo o exporta a GLB.";
  }
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const dist = maxDim * 2.2;
  camera.position.set(center.x, center.y, center.z + dist);
  camera.lookAt(center);
}

document.getElementById("fileModel").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  let kind = "obj";
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".glb")) kind = "glb";
  else if (lower.endsWith(".gltf")) kind = "gltf";

  try {
    await idbPut(BLOB_MODEL, file);
    revokeModelObjUrl();
    const next = mergeAppState({
      model: {
        kind,
        blobKey: BLOB_MODEL,
        name: file.name,
        dataUrl: null,
        urlPath: null,
      },
    });
    await loadModelFromState(next);
    applyPreviewLayout("modelos");
  } catch (err) {
    console.error(err);
    statusText.textContent = "No se pudo guardar el modelo en IndexedDB.";
  }
});

const _largeDataUrlWarnOnce = new Set();
function warnLargeDataUrl(label, dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length <= 1_800_000) return;
  if (_largeDataUrlWarnOnce.has(label)) return;
  _largeDataUrlWarnOnce.add(label);
  console.warn(
    `${label}: el archivo en base64 es muy grande (~${Math.round(dataUrl.length / 1e6)} MB texto). ` +
      "Si la segunda pista falla, usa MP3 más liviano, menor bitrate o un archivo en assets/audio (ruta en lugar de base64)."
  );
}

async function wireAudioFromState(st) {
  if (st.audio?.mainUrlPath) {
    revokeAudioMainObjUrl();
    audioMain.src = st.audio.mainUrlPath;
  } else if (st.audio?.mainBlobKey) {
    revokeAudioMainObjUrl();
    const b = await idbGet(st.audio.mainBlobKey);
    if (b instanceof Blob) {
      _objUrlAudioMain = URL.createObjectURL(b);
      audioMain.src = _objUrlAudioMain;
    } else {
      audioMain.removeAttribute("src");
    }
  } else if (st.audio?.mainDataUrl) {
    revokeAudioMainObjUrl();
    warnLargeDataUrl("Audio principal", st.audio.mainDataUrl);
    audioMain.src = st.audio.mainDataUrl;
  } else {
    revokeAudioMainObjUrl();
    audioMain.removeAttribute("src");
  }

  if (st.audio?.adUrlPath) {
    revokeAudioADObjUrl();
    audioAD.src = st.audio.adUrlPath;
  } else if (st.audio?.adBlobKey) {
    revokeAudioADObjUrl();
    const b = await idbGet(st.audio.adBlobKey);
    if (b instanceof Blob) {
      _objUrlAudioAD = URL.createObjectURL(b);
      audioAD.src = _objUrlAudioAD;
    } else {
      audioAD.removeAttribute("src");
    }
  } else if (st.audio?.adDataUrl) {
    revokeAudioADObjUrl();
    warnLargeDataUrl("Audiodescripción", st.audio.adDataUrl);
    audioAD.src = st.audio.adDataUrl;
  } else {
    revokeAudioADObjUrl();
    audioAD.removeAttribute("src");
  }

  if (st.audio?.imageBlobKey) {
    revokeImageObjUrl();
    const b = await idbGet(st.audio.imageBlobKey);
    if (b instanceof Blob) {
      _objUrlImage = URL.createObjectURL(b);
      previewAudioImg.src = _objUrlImage;
      previewAudioImg.hidden = false;
    } else {
      previewAudioImg.removeAttribute("src");
      previewAudioImg.hidden = true;
    }
  } else if (st.audio?.imageDataUrl) {
    revokeImageObjUrl();
    previewAudioImg.src = st.audio.imageDataUrl;
    previewAudioImg.hidden = false;
  } else {
    revokeImageObjUrl();
    previewAudioImg.removeAttribute("src");
    previewAudioImg.hidden = true;
  }

  if (audioMain.src) {
    try {
      audioMain.load();
    } catch (e) {
      console.warn("audioMain.load", e);
    }
  }
  if (audioAD.src) {
    try {
      audioAD.load();
    } catch (e) {
      console.warn("audioAD.load", e);
    }
  }
  applyPreviewLayout(getAppState().lastPanel || "modelos");
  updateSubtitleFromAudio();
}

function playWhenReady(media) {
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

function bindAudioSubtitleSync(media, fn) {
  ["timeupdate", "play", "pause", "seeked", "loadedmetadata"].forEach((ev) =>
    media.addEventListener(ev, fn)
  );
}

function currentSubtitles() {
  const st = getAppState();
  if (adActive) {
    if (Array.isArray(st.subtitlesAD) && st.subtitlesAD.length) return st.subtitlesAD;
    if (Array.isArray(st.subtitlesMain) && st.subtitlesMain.length) return st.subtitlesMain;
    return [];
  }
  return st.subtitlesMain || [];
}

function updateSubtitleFromAudio() {
  const st = getAppState();
  const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
  if (!hasAd && !subsVisible) {
    subtitleEl.textContent = "";
    if (previewSubtitleEl) {
      previewSubtitleEl.textContent = "";
      previewSubtitleEl.hidden = true;
    }
    return;
  }
  const a = adActive ? audioAD : audioMain;
  const t = a.currentTime;
  const subs = currentSubtitles();
  const text = pickSubtitleAtTime(subs, t);
  const line = text || (a.paused ? "Pausado" : "");
  subtitleEl.textContent = line;
  if (previewSubtitleEl) {
    const p = st.lastPanel || "modelos";
    previewSubtitleEl.hidden = p !== "audios";
    if (p === "audios") previewSubtitleEl.textContent = line;
  }
}

document.getElementById("playAudio").onclick = () => {
  const st = getAppState();
  const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
  const use = adActive && hasAd ? audioAD : audioMain;
  const other = adActive && hasAd ? audioMain : audioAD;
  other.pause();
  playWhenReady(use).catch(() => {
    subtitleEl.textContent = "Carga un audio principal o revisa formato (p. ej. MP3).";
  });
};

document.getElementById("pauseAudio").onclick = () => {
  audioMain.pause();
  audioAD.pause();
};

document.getElementById("restartUrnaAudio").onclick = () => {
  const st = getAppState();
  const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
  const use = adActive && hasAd ? audioAD : audioMain;
  const other = adActive && hasAd ? audioMain : audioAD;
  audioMain.currentTime = 0;
  audioAD.currentTime = 0;
  other.pause();
  if (!use.src) {
    subtitleEl.textContent = "Carga un audio principal o revisa formato (p. ej. MP3).";
    updateSubtitleFromAudio();
    return;
  }
  playWhenReady(use).catch(() => {
    subtitleEl.textContent = "Carga un audio principal o revisa formato (p. ej. MP3).";
  });
  updateSubtitleFromAudio();
};

document.getElementById("toggleAD").onclick = () => {
  const st = getAppState();
  const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
  const btn = document.getElementById("toggleAD");
  if (!hasAd) {
    subsVisible = !subsVisible;
    btn.classList.toggle("btn-active", !subsVisible);
    updateSubtitleFromAudio();
    return;
  }
  const t = adActive ? audioAD.currentTime : audioMain.currentTime;
  audioMain.pause();
  audioAD.pause();
  adActive = !adActive;
  if (adActive) {
    if (!audioAD.src) {
      adActive = false;
      subtitleEl.textContent = "La pista de audiodescripción no se pudo cargar.";
      return;
    }
    audioAD.currentTime = t;
    playWhenReady(audioAD).catch(() => {
      subtitleEl.textContent = "No se pudo cargar la audiodescripción (archivo o tamaño).";
    });
  } else {
    audioMain.currentTime = t;
    if (audioMain.src) {
      playWhenReady(audioMain).catch(() => {});
    }
  }
  btn.classList.toggle("btn-active", adActive);
};

bindAudioSubtitleSync(audioMain, updateSubtitleFromAudio);
bindAudioSubtitleSync(audioAD, updateSubtitleFromAudio);

document.getElementById("fileAudioMain").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  try {
    await idbPut(BLOB_AUDIO_MAIN, f);
    mergeAppState({
      audio: {
        ...getAppState().audio,
        mainBlobKey: BLOB_AUDIO_MAIN,
        mainDataUrl: null,
        mainUrlPath: null,
        mainName: f.name,
      },
    });
    await wireAudioFromState(getAppState());
  } catch (err) {
    console.error(err);
    subtitleEl.textContent = "No se pudo guardar el audio en IndexedDB.";
  }
});

document.getElementById("fileAudioAD").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  const isMp3 = f.type === "audio/mpeg" || /\.mp3$/i.test(f.name || "");
  if (!isMp3) {
    subtitleEl.textContent = "La audiodescripción debe ser MP3.";
    return;
  }
  try {
    await idbPut(BLOB_AUDIO_AD, f);
    const cur = getAppState();
    const mainSubs =
      cur.subtitlesMain?.length > 0 ? cur.subtitlesMain : defaultSubtitlesMain();
    mergeAppState({
      audio: {
        ...cur.audio,
        adBlobKey: BLOB_AUDIO_AD,
        adDataUrl: null,
        adUrlPath: null,
        adName: f.name,
      },
      subtitlesAD: JSON.parse(JSON.stringify(mainSubs)),
    });
    await wireAudioFromState(getAppState());
  } catch (err) {
    console.error(err);
    subtitleEl.textContent = "No se pudo guardar la audiodescripción.";
  }
});

document.getElementById("fileAudioImg").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  try {
    await idbPut(BLOB_AUDIO_IMAGE, f);
    mergeAppState({
      audio: {
        ...getAppState().audio,
        imageBlobKey: BLOB_AUDIO_IMAGE,
        imageDataUrl: null,
        imageName: f.name,
      },
    });
    await wireAudioFromState(getAppState());
    applyPreviewLayout("audios");
  } catch (err) {
    console.error(err);
    subtitleEl.textContent = "No se pudo guardar la imagen.";
  }
});

document.getElementById("clearAudioMain").onclick = async () => {
  audioMain.pause();
  audioAD.pause();
  try {
    await idbDelete(BLOB_AUDIO_MAIN);
  } catch {}
  mergeAppState({
    audio: {
      ...getAppState().audio,
      mainDataUrl: null,
      mainBlobKey: null,
      mainUrlPath: null,
      mainName: "",
    },
  });
  adActive = false;
  subsVisible = true;
  document.getElementById("toggleAD")?.classList.remove("btn-active");
  await wireAudioFromState(getAppState());
  applyPreviewLayout("audios");
};

document.getElementById("clearAudioAD").onclick = async () => {
  audioMain.pause();
  audioAD.pause();
  try {
    await idbDelete(BLOB_AUDIO_AD);
  } catch {}
  mergeAppState({
    audio: {
      ...getAppState().audio,
      adDataUrl: null,
      adBlobKey: null,
      adUrlPath: null,
      adName: "",
    },
  });
  adActive = false;
  subsVisible = true;
  document.getElementById("toggleAD")?.classList.remove("btn-active");
  await wireAudioFromState(getAppState());
};

document.getElementById("clearAudioImg")?.addEventListener("click", async () => {
  try {
    await idbDelete(BLOB_AUDIO_IMAGE);
  } catch {}
  mergeAppState({
    audio: {
      ...getAppState().audio,
      imageDataUrl: null,
      imageBlobKey: null,
      imageName: "",
    },
  });
  await wireAudioFromState(getAppState());
  applyPreviewLayout("audios");
});

const animFileName = document.getElementById("animFileName");

function clearAnimScene() {
  mixer = null;
  gltfAnim = null;
  sanAgustinAnimNode = null;
  revokeAnimModelObjUrl();
  while (animRoot.children.length) animRoot.remove(animRoot.children[0]);
  previewAnimVideo.removeAttribute("src");
  previewAnimVideo.hidden = true;
  previewAnimGif.removeAttribute("src");
  previewAnimGif.hidden = true;
}

async function loadSanAgustinAnimatedModel(st) {
  const src = st.model;
  if (!src) throw new Error("Primero carga un modelo en la sección Modelos.");
  const kind = src.kind || "obj";

  if (src.urlPath && !src.dataUrl && !src.blobKey) {
    if (kind === "glb" || kind === "gltf") {
      return new Promise((resolve, reject) => {
        gltfLoader.load(
          src.urlPath,
          (gltf) => resolve(gltf.scene),
          undefined,
          reject
        );
      });
    }
    return new Promise((resolve, reject) => {
      objLoader.load(
        src.urlPath,
        (obj) => resolve(obj),
        undefined,
        reject
      );
    });
  }

  if (src.blobKey && !src.dataUrl) {
    const blob = await idbGet(src.blobKey);
    if (!(blob instanceof Blob)) {
      throw new Error("No se encontró el blob del modelo para animación.");
    }
    revokeAnimModelObjUrl();
    _objUrlAnimModel = URL.createObjectURL(blob);
    if (kind === "glb" || kind === "gltf") {
      return new Promise((resolve, reject) => {
        gltfLoader.load(
          _objUrlAnimModel,
          (gltf) => resolve(gltf.scene),
          undefined,
          reject
        );
      });
    }
    return new Promise((resolve, reject) => {
      objLoader.load(
        _objUrlAnimModel,
        (obj) => resolve(obj),
        undefined,
        reject
      );
    });
  }

  if (src.dataUrl) {
    if (kind === "glb" || kind === "gltf") {
      const gltf = await parseGltfFromDataUrl(gltfLoader, src.dataUrl, kind);
      return gltf.scene;
    }
    return parseObjFromDataUrl(objLoader, src.dataUrl);
  }

  throw new Error("Modelo inválido para animación.");
}

async function loadAnimationFromState(st) {
  clearAnimScene();
  const an = st.animation;
  if (!an) {
    animFileName.textContent = "Animación predeterminada";
    animSubtitleEl.textContent = "Sin animación configurada.";
    return;
  }
  if (an.enabled === false) {
  animFileName.textContent = an.name || "Animación predeterminada";
    animSubtitleEl.textContent = "Animación desactivada.";
    return;
  }
  animFileName.textContent = an.name || "Animación";

  if (an.kind === "sanagustin") {
    await loadSanAgustinAnimatedModel(st)
      .then((node) => {
        sanAgustinAnimNode = node;
        animRoot.add(node);
        animRoot.visible = true;
        fitCameraToObject(node);
        updateRendererSize();
        animSubtitleEl.textContent = "Animación predeterminada activa sobre el modelo cargado.";
      })
      .catch((e) => {
      console.error(e);
      animSubtitleEl.textContent = e?.message || "No se pudo activar la animación sobre el modelo cargado.";
    });
    return;
  }

  if (!an?.dataUrl) {
    animSubtitleEl.textContent = "Sin animación cargada";
    return;
  }

  if (an.kind === "video") {
    previewAnimVideo.src = an.dataUrl;
    previewAnimVideo.hidden = false;
    animSubtitleEl.textContent = "Vídeo listo (Iniciar / Pausar).";
    return;
  }

  if (an.kind === "gif") {
    previewAnimGif.src = an.dataUrl;
    previewAnimGif.hidden = false;
    animSubtitleEl.textContent = "GIF mostrado (reiniciar recarga la página del GIF).";
    return;
  }

  if (an.kind === "gltf") {
    try {
      const gltf = await parseGltfFromDataUrlAuto(gltfLoader, an.dataUrl);
      gltfAnim = gltf;
      animRoot.add(gltf.scene);
      animRoot.visible = true;
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      }
      fitCameraToObject(gltf.scene);
      updateRendererSize();
      animSubtitleEl.textContent = "Animación 3D lista (Iniciar / Pausar).";
    } catch (e) {
      console.error(e);
      animSubtitleEl.textContent = e?.message || "Error al cargar animación 3D.";
    }
  }
}

document.getElementById("btnAnimRemove").onclick = () => {
  mergeAppState({
    animation: {
      kind: "sanagustin",
      name: "Animación predeterminada",
      modelPath: "./assets/modelos/modelo.obj",
      enabled: true,
    },
  });
  loadAnimationFromState(getAppState());
  applyPreviewLayout("animaciones");
};

document.getElementById("btnAnimRestart").onclick = () => {
  const st = getAppState();
  if (!st.animation) return;
  if (st.animation.kind === "sanagustin" && sanAgustinAnimNode) {
    sanAgustinAnimNode.rotation.set(0, 0, 0);
  }
  if (st.animation.kind === "video") {
    previewAnimVideo.currentTime = 0;
    previewAnimVideo.play();
  }
  if (st.animation.kind === "gltf" && mixer && gltfAnim?.animations) {
    mixer.stopAllAction();
    gltfAnim.animations.forEach((clip) => mixer.clipAction(clip).reset().play());
    mixer.timeScale = 1;
  }
  audioAnim.currentTime = 0;
  audioAnimAD.currentTime = 0;
};

document.getElementById("btnAnimPlay").onclick = () => {
  const st = getAppState();
  if (!st.animation) return;
  if (st.animation.kind === "sanagustin") {
    mergeAppState({ animation: { ...st.animation, enabled: true } });
    loadAnimationFromState(getAppState());
    applyPreviewLayout("animaciones");
    return;
  }
  if (st.animation?.kind === "video") {
    previewAnimVideo.play();
  }
  if (st.animation?.kind === "gltf" && mixer) {
    mixer.timeScale = 1;
  }
  const a = animAdActive && audioAnimAD.src ? audioAnimAD : audioAnim;
  const o = animAdActive && audioAnimAD.src ? audioAnim : audioAnimAD;
  o.pause();
  if (a.src) a.play().catch(() => {});
};

document.getElementById("btnAnimPause").onclick = () => {
  const st = getAppState();
  if (st.animation?.kind === "sanagustin") {
    mergeAppState({ animation: { ...st.animation, enabled: false } });
    loadAnimationFromState(getAppState());
    applyPreviewLayout("animaciones");
    return;
  }
  previewAnimVideo.pause();
  audioAnim.pause();
  audioAnimAD.pause();
  if (mixer) mixer.timeScale = 0;
};

document.getElementById("toggleAnimAD").onclick = () => {
  animAdActive = !animAdActive;
  document.getElementById("toggleAnimAD").classList.toggle("btn-active", animAdActive);
};

document.getElementById("btnAnimAudioRestart").onclick = () => {
  audioAnim.pause();
  audioAnimAD.pause();
  audioAnim.currentTime = 0;
  audioAnimAD.currentTime = 0;
  updateAnimSubtitle();
  const a = animAdActive && audioAnimAD.src ? audioAnimAD : audioAnim;
  const o = animAdActive && audioAnimAD.src ? audioAnim : audioAnimAD;
  o.pause();
  if (a.src) a.play().catch(() => {});
};

function animSubsForAudio() {
  const st = getAppState();
  if (animAdActive) {
    return st.animSubtitlesAD?.length ? st.animSubtitlesAD : defaultAnimSubsAD();
  }
  return st.animSubtitlesMain?.length ? st.animSubtitlesMain : defaultAnimSubsMain();
}

function updateAnimSubtitle() {
  const a = animAdActive && audioAnimAD.src ? audioAnimAD : audioAnim;
  const t = a.currentTime || 0;
  const subs = animSubsForAudio() || [];
  const text = pickSubtitleAtTime(subs, t);
  animSubtitleEl.textContent = text || "";
  if (previewAnimSubtitlePublic) {
    const p = getAppState().lastPanel || "modelos";
    previewAnimSubtitlePublic.hidden = p !== "animaciones";
    if (p === "animaciones") previewAnimSubtitlePublic.textContent = text || "";
  }
}

audioAnim.addEventListener("timeupdate", updateAnimSubtitle);
audioAnimAD.addEventListener("timeupdate", updateAnimSubtitle);

document.getElementById("fileAnimAudio").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  const dataUrl = await fileToDataUrl(f);
  const st = getAppState();
  mergeAppState({
    animAudioMainUrl: dataUrl,
    animAudioMainName: f.name,
    animSubtitlesMain: st.animSubtitlesMain?.length ? st.animSubtitlesMain : defaultAnimSubsMain(),
  });
  audioAnim.src = dataUrl;
});

document.getElementById("fileAnimAudioAD").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  const dataUrl = await fileToDataUrl(f);
  const st = getAppState();
  mergeAppState({
    animAudioADUrl: dataUrl,
    animAudioADName: f.name,
    animSubtitlesAD: st.animSubtitlesAD?.length ? st.animSubtitlesAD : defaultAnimSubsAD(),
  });
  audioAnimAD.src = dataUrl;
});

function defaultAnimSubsMain() {
  return [
    { start: 0, end: 99999, text: "Narración de la animación (ajusta tiempos en el código si lo necesitas)." },
  ];
}
function defaultAnimSubsAD() {
  return [
    { start: 0, end: 99999, text: "Audiodescripción de la animación." },
  ];
}

// ─── Panel Juego ─────────────────────────────────────────────────────────────
function renderJuegoPanel() {
  const container = document.getElementById("juegoContent");
  if (!container) return;
  if (typeof SIMBOLOS_DATA === "undefined") {
    container.innerHTML = "<p class='muted'>No se encontraron datos de símbolos.</p>";
    return;
  }
  const letras = ["A", "B", "C", "D"];
  container.innerHTML = SIMBOLOS_DATA.map((s) => `
    <div class="juego-simbolo-block">
      <div class="juego-simbolo-header">
        <img class="juego-simbolo-img" src="${escHtml(s.imagen)}" alt="${escHtml(s.nombre)}">
        <span class="juego-simbolo-nombre">${escHtml(s.nombre)}</span>
      </div>
      ${s.preguntas.map((p, pi) => `
        <div class="juego-pregunta-row">
          <span class="juego-pregunta-texto">P${pi + 1}: ${escHtml(p.texto)}</span>
          ${p.opciones.map((op, oi) => `
            <span class="juego-opcion${oi === p.correcta ? " correcta" : ""}">
              ${letras[oi]}) ${escHtml(op)}${oi === p.correcta ? " (correcta)" : ""}
            </span>
          `).join("")}
          <span class="juego-justificacion">${escHtml(p.justificacion)}</span>
        </div>
      `).join("")}
    </div>
  `).join("");
}

// ─── Panel Reportes ───────────────────────────────────────────────────────────
function renderReportesPanel() {
  const container = document.getElementById("reportesContent");
  if (!container) return;
  import("./reports.js")
    .then(({ renderReportes }) => {
      renderReportes("reportesContent");
    })
    .catch((err) => {
      console.error("Reportes:", err);
      container.innerHTML =
        "<p class='muted'>No se pudo cargar el módulo de reportes. Revisa la consola (F12) para el detalle.</p>";
    });
}

function renderTestimoniosPanel() {
  const container = document.getElementById("testimoniosContent");
  if (!container) return;
  import("./testimonios.js").then(({ renderTestimoniosAdmin }) => {
    renderTestimoniosAdmin("testimoniosContent");
  }).catch(() => {
    container.innerHTML = "<p class='muted'>No se pudo cargar testimonios.</p>";
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

(async function init() {
  let st = getAppState();
  if (!st.animation || st.animation.kind !== "sanagustin") {
    mergeAppState({
      animation: {
        kind: "sanagustin",
        name: "Animación predeterminada",
        modelPath: "./assets/modelos/modelo.obj",
        enabled: true,
      },
    });
    st = getAppState();
  }
  if (st.lastPanel) setPanel(st.lastPanel);
  else applyPreviewLayout("modelos");

  await loadModelFromState(st);
  await wireAudioFromState(st);
  await loadAnimationFromState(st);

  if (st.animAudioMainUrl) audioAnim.src = st.animAudioMainUrl;
  if (st.animAudioADUrl) audioAnimAD.src = st.animAudioADUrl;

  if (!getAppState().animSubtitlesMain) {
    mergeAppState({ animSubtitlesMain: defaultAnimSubsMain(), animSubtitlesAD: defaultAnimSubsAD() });
  }

  loadModelsFromServer();
  loadProjectAudios();

  try {
    const bc = new BroadcastChannel(SYNC_CHANNEL);
    bc.onmessage = async () => {
      await pullAppStateFromIdbOnly();
      const st2 = getAppState();
      reflectPanelUI(st2.lastPanel || "modelos");
      await loadModelFromState(st2);
      await wireAudioFromState(st2);
      await loadAnimationFromState(st2);
      if (st2.animAudioMainUrl) audioAnim.src = st2.animAudioMainUrl;
      if (st2.animAudioADUrl) audioAnimAD.src = st2.animAudioADUrl;
      modelFileName.textContent = st2.model?.name || "Ninguno";
      if (st2.lastPanel === "reportes") renderReportesPanel();
      if (st2.lastPanel === "testimonios") renderTestimoniosPanel();
    };
  } catch {}
})();
}
