import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164/build/three.module.js";
import { OBJLoader } from "https://cdn.jsdelivr.net/npm/three@0.164/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.164/examples/jsm/loaders/GLTFLoader.js";
import {
  getSession,
  getAppState,
  logout,
  SYNC_CHANNEL,
  pullAppStateFromIdbOnly,
  pickSubtitleAtTime,
} from "./state.js";
import { idbGet } from "./idb.js";
import {
  parseObjFromDataUrl,
  parseGltfFromDataUrl,
  parseGltfFromDataUrlAuto,
} from "./modelLoaders.js";

if (getSession()?.role !== "student") {
  window.location.replace("index.html");
} else {
  const canvas = document.getElementById("threeCanvas");
  const previewStackEl = document.getElementById("previewStack");
  let _lastRW = 0;
  let _lastRH = 0;

  function updateRendererSize() {
    if (!previewStackEl || !canvas) return;
    const r = previewStackEl.getBoundingClientRect();
    let w = Math.floor(r.width);
    let h = Math.floor(r.height);
    if (w < 32) w = 520;
    if (h < 32) h = 400;
    if (w === _lastRW && h === _lastRH) return;
    _lastRW = w;
    _lastRH = h;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  const previewAudioImg = document.getElementById("previewAudioImg");
  const previewAnimVideo = document.getElementById("previewAnimVideo");
  const previewAnimGif = document.getElementById("previewAnimGif");
  const subtitleEl = document.getElementById("subtitle");
  const animSubtitleEl = document.getElementById("animSubtitle");
  const previewHint = document.getElementById("previewHint");
  const studentControls = document.getElementById("studentControls");

  const audioMain = document.getElementById("audioMain");
  const audioAD = document.getElementById("audioAD");
  const audioAnim = document.getElementById("audioAnim");
  const audioAnimAD = document.getElementById("audioAnimAD");

  document.getElementById("btnLogout").onclick = () => logout();

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
  let sanAgustinSpinEnabled = true;
  let adActive = false;
  let subsVisible = true;

  let _objUrlAudioMain = null;
  let _objUrlAudioAD = null;
  let _objUrlImage = null;
  let _objUrlModel = null;
  let _objUrlAnimModel = null;
  function revokeMain() {
    if (_objUrlAudioMain) {
      URL.revokeObjectURL(_objUrlAudioMain);
      _objUrlAudioMain = null;
    }
  }
  function revokeAD() {
    if (_objUrlAudioAD) {
      URL.revokeObjectURL(_objUrlAudioAD);
      _objUrlAudioAD = null;
    }
  }
  function revokeImg() {
    if (_objUrlImage) {
      URL.revokeObjectURL(_objUrlImage);
      _objUrlImage = null;
    }
  }
  function revokeModel() {
    if (_objUrlModel) {
      URL.revokeObjectURL(_objUrlModel);
      _objUrlModel = null;
    }
  }
  function revokeAnimModel() {
    if (_objUrlAnimModel) {
      URL.revokeObjectURL(_objUrlAnimModel);
      _objUrlAnimModel = null;
    }
  }

  function defaultAnimSubsMain() {
    return [
      { start: 0, end: 99999, text: "Narración de la animación." },
    ];
  }

  const objLoader = new OBJLoader();
  const gltfLoader = new GLTFLoader();

  function fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 2.2;
    camera.position.set(center.x, center.y, center.z + dist);
    camera.lookAt(center);
  }

  function applyOpacity(root, pct) {
    const v = Math.max(0, Math.min(1, Number(pct) / 100));
    root.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m || typeof m.opacity !== "number") return;
        m.transparent = v < 0.999;
        m.opacity = v;
        m.depthWrite = v >= 0.999;
        m.needsUpdate = true;
        if (m.transparent && m.premultipliedAlpha) {
          m.blending = THREE.NormalBlending;
        }
      });
    });
  }

  function animateLoop() {
    requestAnimationFrame(animateLoop);
    updateRendererSize();
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (sanAgustinAnimNode && animRoot.visible && sanAgustinSpinEnabled) {
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

  function currentSubs() {
    const st = getAppState();
    if (adActive) {
      if (Array.isArray(st.subtitlesAD) && st.subtitlesAD.length) return st.subtitlesAD;
      if (Array.isArray(st.subtitlesMain) && st.subtitlesMain.length) return st.subtitlesMain;
      return [];
    }
    return st.subtitlesMain || [];
  }

  function subtitleTextAt(subs, timeSeconds) {
    if (!Array.isArray(subs) || !subs.length) return "";
    const t = Number(timeSeconds);
    if (!Number.isFinite(t)) return "";

    for (const s of subs) {
      const start = Number(s.start);
      const end = Number(s.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (t >= start && t < end) return s.text || "";
    }

    return pickSubtitleAtTime(subs, t) || "";
  }

  function onAudioTime() {
    if (!subsVisible) {
      subtitleEl.textContent = "";
      return;
    }
    const a = adActive && audioAD.src ? audioAD : audioMain;
    const subs = currentSubs();
    const text = subtitleTextAt(subs, a.currentTime);
    subtitleEl.textContent = text || (a.paused ? "Pausado" : "");
  }

  let subtitleTicker = null;
  function ensureSubtitleTicker() {
    const shouldRun = (!audioMain.paused && !!audioMain.src) || (!audioAD.paused && !!audioAD.src);
    if (shouldRun && !subtitleTicker) {
      subtitleTicker = setInterval(onAudioTime, 150);
      return;
    }
    if (!shouldRun && subtitleTicker) {
      clearInterval(subtitleTicker);
      subtitleTicker = null;
    }
  }

  function bindAudioSubtitleSync(media, fn) {
    ["timeupdate", "play", "pause", "seeked", "loadedmetadata", "ended"].forEach((ev) =>
      media.addEventListener(ev, () => {
        fn();
        ensureSubtitleTicker();
      })
    );
  }
  bindAudioSubtitleSync(audioMain, onAudioTime);
  bindAudioSubtitleSync(audioAD, onAudioTime);

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

  function layout(st) {
    const p = st.lastPanel || "modelos";
    const hasAudioImage = !!(st.audio?.imageDataUrl || st.audio?.imageBlobKey);
    const hasModel = !!(st.model?.urlPath || st.model?.dataUrl || st.model?.blobKey);
    previewHint.textContent =
      p === "modelos"
        ? "Contenido configurado por el administrador (modelo 3D)."
        : p === "audios"
          ? "Audio e imagen configurados por el administrador."
          : "Animación configurada por el administrador.";

    const hideCanvasForAnim =
      p === "animaciones" &&
      st.animation &&
      (st.animation.kind === "video" || st.animation.kind === "gif");

    const showCanvasInAudio = p === "audios" && !hasAudioImage && hasModel;
    canvas.style.display = showCanvasInAudio || (p !== "audios" && !hideCanvasForAnim) ? "block" : "none";
    previewAudioImg.hidden =
      p !== "audios" || !hasAudioImage;
    previewAnimVideo.hidden = p !== "animaciones" || !st.animation || st.animation.kind !== "video";
    previewAnimGif.hidden = p !== "animaciones" || !st.animation || st.animation.kind !== "gif";

    const showAudioControls = true;
    studentControls.hidden = !showAudioControls;
    studentControls.style.display = showAudioControls ? "flex" : "none";

    subtitleEl.hidden = false;
    if (animSubtitleEl) {
      animSubtitleEl.hidden = p !== "animaciones";
      if (p !== "animaciones") animSubtitleEl.textContent = "";
    }

    modelGroup.visible = p === "modelos" || showCanvasInAudio;
    animRoot.visible =
      p === "animaciones" &&
      !!st.animation &&
      st.animation.enabled !== false &&
      (st.animation.kind === "gltf" || st.animation.kind === "sanagustin");
  }

  async function loadModel(st) {
    while (modelGroup.children.length) modelGroup.remove(modelGroup.children[0]);
    if (!st.model?.dataUrl && !st.model?.urlPath && !st.model?.blobKey) return;
    const kind = st.model.kind || "obj";
    try {
      if (st.model.urlPath && !st.model.dataUrl && !st.model.blobKey) {
        if (kind === "glb" || kind === "gltf") {
          await new Promise((resolve, reject) => {
            gltfLoader.load(
              st.model.urlPath,
              (gltf) => {
                modelGroup.add(gltf.scene);
                fitCameraToObject(gltf.scene);
                applyOpacity(modelGroup, 100);
                resolve();
              },
              undefined,
              reject
            );
          });
        } else {
          await new Promise((resolve, reject) => {
            objLoader.load(
              st.model.urlPath,
              (obj) => {
                modelGroup.add(obj);
                fitCameraToObject(obj);
                applyOpacity(modelGroup, 100);
                resolve();
              },
              undefined,
              reject
            );
          });
        }
      } else if (st.model.blobKey && !st.model.dataUrl) {
        const b = await idbGet(st.model.blobKey);
        if (!(b instanceof Blob)) return;
        revokeModel();
        _objUrlModel = URL.createObjectURL(b);
        const path = _objUrlModel;
        if (kind === "glb" || kind === "gltf") {
          await new Promise((resolve, reject) => {
            gltfLoader.load(
              path,
              (gltf) => {
                modelGroup.add(gltf.scene);
                fitCameraToObject(gltf.scene);
                applyOpacity(modelGroup, 100);
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
                applyOpacity(modelGroup, 100);
                resolve();
              },
              undefined,
              reject
            );
          });
        }
      } else if (kind === "glb" || kind === "gltf") {
        const gltf = await parseGltfFromDataUrl(gltfLoader, st.model.dataUrl, kind);
        modelGroup.add(gltf.scene);
        fitCameraToObject(gltf.scene);
        applyOpacity(modelGroup, 100);
      } else {
        const obj = await parseObjFromDataUrl(objLoader, st.model.dataUrl);
        modelGroup.add(obj);
        fitCameraToObject(obj);
        applyOpacity(modelGroup, 100);
      }
      updateRendererSize();
    } catch (e) {
      console.error(e);
      previewHint.textContent = e?.message || "No se pudo cargar el modelo.";
    }
  }

  function clearAnim() {
    mixer = null;
    gltfAnim = null;
    sanAgustinAnimNode = null;
    revokeAnimModel();
    while (animRoot.children.length) animRoot.remove(animRoot.children[0]);
    previewAnimVideo.removeAttribute("src");
    previewAnimGif.removeAttribute("src");
  }

  async function loadSanAgustinAnimatedModel(st) {
    const src = st.model;
    if (!src) throw new Error("Sin modelo cargado por el administrador.");
    const kind = src.kind || "obj";

    if (src.urlPath && !src.dataUrl && !src.blobKey) {
      if (kind === "glb" || kind === "gltf") {
        return new Promise((resolve, reject) => {
          gltfLoader.load(src.urlPath, (gltf) => resolve(gltf.scene), undefined, reject);
        });
      }
      return new Promise((resolve, reject) => {
        objLoader.load(src.urlPath, (obj) => resolve(obj), undefined, reject);
      });
    }

    if (src.blobKey && !src.dataUrl) {
      const blob = await idbGet(src.blobKey);
      if (!(blob instanceof Blob)) throw new Error("No se encontró el modelo para animación.");
      revokeAnimModel();
      _objUrlAnimModel = URL.createObjectURL(blob);
      if (kind === "glb" || kind === "gltf") {
        return new Promise((resolve, reject) => {
          gltfLoader.load(_objUrlAnimModel, (gltf) => resolve(gltf.scene), undefined, reject);
        });
      }
      return new Promise((resolve, reject) => {
        objLoader.load(_objUrlAnimModel, (obj) => resolve(obj), undefined, reject);
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

  function loadAnim(st) {
    clearAnim();
    const an = st.animation;
    if (!an || an.enabled === false) return;
    if (an.kind === "sanagustin") {
      loadSanAgustinAnimatedModel(st)
        .then((node) => {
          sanAgustinAnimNode = node;
          animRoot.add(node);
          animRoot.visible = true;
          sanAgustinSpinEnabled = true;
          fitCameraToObject(node);
          updateRendererSize();
        })
        .catch((e) => {
          console.error(e);
          previewHint.textContent = e?.message || "No se pudo activar la animación del modelo.";
        });
      return;
    }
    if (!an?.dataUrl) return;
    if (an.kind === "video") {
      previewAnimVideo.src = an.dataUrl;
      previewAnimVideo.hidden = false;
      return;
    }
    if (an.kind === "gif") {
      previewAnimGif.src = an.dataUrl;
      previewAnimGif.hidden = false;
      return;
    }
    if (an.kind === "gltf") {
      parseGltfFromDataUrlAuto(gltfLoader, an.dataUrl)
        .then((gltf) => {
          gltfAnim = gltf;
          animRoot.add(gltf.scene);
          animRoot.visible = true;
          if (gltf.animations?.length) {
            mixer = new THREE.AnimationMixer(gltf.scene);
            gltf.animations.forEach((c) => mixer.clipAction(c).play());
          }
          fitCameraToObject(gltf.scene);
          updateRendererSize();
        })
        .catch(console.error);
    }
  }

  async function wireAudio(st) {
    if (st.audio?.mainUrlPath) {
      revokeMain();
      audioMain.src = st.audio.mainUrlPath;
    } else if (st.audio?.mainBlobKey) {
      revokeMain();
      const b = await idbGet(st.audio.mainBlobKey);
      if (b instanceof Blob) {
        _objUrlAudioMain = URL.createObjectURL(b);
        audioMain.src = _objUrlAudioMain;
      } else {
        audioMain.removeAttribute("src");
      }
    } else if (st.audio?.mainDataUrl) {
      revokeMain();
      audioMain.src = st.audio.mainDataUrl;
    } else {
      revokeMain();
      audioMain.removeAttribute("src");
    }

    if (st.audio?.adUrlPath) {
      revokeAD();
      audioAD.src = st.audio.adUrlPath;
    } else if (st.audio?.adBlobKey) {
      revokeAD();
      const b = await idbGet(st.audio.adBlobKey);
      if (b instanceof Blob) {
        _objUrlAudioAD = URL.createObjectURL(b);
        audioAD.src = _objUrlAudioAD;
      } else {
        audioAD.removeAttribute("src");
      }
    } else if (st.audio?.adDataUrl) {
      revokeAD();
      audioAD.src = st.audio.adDataUrl;
    } else {
      revokeAD();
      audioAD.removeAttribute("src");
    }

    if (st.audio?.imageBlobKey) {
      revokeImg();
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
      revokeImg();
      previewAudioImg.src = st.audio.imageDataUrl;
      previewAudioImg.hidden = false;
    } else {
      revokeImg();
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
    layout(st);
    onAudioTime();
  }

  function wireAnimAudio(st) {
    if (st.animAudioMainUrl) audioAnim.src = st.animAudioMainUrl;
    if (st.animAudioADUrl) audioAnimAD.src = st.animAudioADUrl;
  }

  document.getElementById("pvPlay").onclick = () => {
    const st = getAppState();
    const hasMain = !!(st.audio?.mainDataUrl || st.audio?.mainUrlPath || st.audio?.mainBlobKey);
    const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
    const use = adActive && hasAd ? audioAD : hasMain ? audioMain : hasAd ? audioAD : audioMain;
    const o = use === audioAD ? audioMain : audioAD;
    o.pause();
    playWhenReady(use).catch(() => {
      subtitleEl.textContent = "No hay audio cargado por el administrador.";
    });
  };
  document.getElementById("pvPause").onclick = () => {
    audioMain.pause();
    audioAD.pause();
    ensureSubtitleTicker();
  };
  document.getElementById("pvRestart").onclick = () => {
    const st = getAppState();
    const hasAd = !!(st.audio?.adDataUrl || st.audio?.adUrlPath || st.audio?.adBlobKey);
    const active = adActive && hasAd ? audioAD : audioMain;
    const other = active === audioAD ? audioMain : audioAD;
    other.pause();
    active.currentTime = 0;
    if (active.src) {
      playWhenReady(active).catch(() => {
        subtitleEl.textContent = "No hay audio cargado por el administrador.";
      });
    }
    ensureSubtitleTicker();
  };
  document.getElementById("pvToggleAD").onclick = () => {
    const btn = document.getElementById("pvToggleAD");
    subsVisible = !subsVisible;
    btn.classList.toggle("btn-active", subsVisible);
    if (!subsVisible) {
      subtitleEl.textContent = "";
    } else {
      onAudioTime();
    }
    ensureSubtitleTicker();
  };

  function animSubsForStudent() {
    const st = getAppState();
    return st.animSubtitlesMain?.length ? st.animSubtitlesMain : defaultAnimSubsMain();
  }

  function updateAnimSubtitleStudent() {
    if (!animSubtitleEl) return;
    const st = getAppState();
    if ((st.lastPanel || "modelos") !== "animaciones") return;
    const a = audioAnim;
    const t = a.currentTime || 0;
    const subs = animSubsForStudent() || [];
    let text = "";
    for (const s of subs) {
      if (t >= s.start && t < s.end) {
        text = s.text;
        break;
      }
    }
    animSubtitleEl.textContent = text || (a.paused ? "Pausado" : "");
  }

  audioAnim.addEventListener("timeupdate", updateAnimSubtitleStudent);
  audioAnimAD.addEventListener("timeupdate", updateAnimSubtitleStudent);

  async function refreshFromAdmin() {
    await pullAppStateFromIdbOnly();
    const st2 = getAppState();
    layout(st2);
    await loadModel(st2);
    await wireAudio(st2);
    loadAnim(st2);
    wireAnimAudio(st2);
    adActive = false;
    subsVisible = true;
    document.getElementById("pvToggleAD")?.classList.remove("btn-active");
    updateAnimSubtitleStudent();
  }

  (async function init() {
    const st = getAppState();
    layout(st);
    await loadModel(st);
    await wireAudio(st);
    loadAnim(st);
    wireAnimAudio(st);
    try {
      const bc = new BroadcastChannel(SYNC_CHANNEL);
      bc.onmessage = () => {
        refreshFromAdmin();
      };
    } catch {}
  })();
}
