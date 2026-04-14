import { idbGet, idbPut } from "./idb.js";

export const SESSION_KEY = "ih_session";
export const APP_STATE_KEY = "ih_app_state";

export const BLOB_AUDIO_MAIN = "ih_blob_audio_main";
export const BLOB_AUDIO_AD = "ih_blob_audio_ad";
export const BLOB_AUDIO_IMAGE = "ih_blob_audio_image";
export const BLOB_MODEL = "ih_blob_model";
export const SYNC_CHANNEL = "ih_instahistory_sync_v1";

function defaultSanAgustinAnimation() {
  return {
    kind: "sanagustin",
    name: "Animación predeterminada",
    modelPath: "./assets/modelos/modelo.obj",
    enabled: true,
  };
}

export function defaultAppState() {
  return {
    lastPanel: "modelos",
    model: null,
    audio: {
      mainDataUrl: null,
      mainBlobKey: null,
      mainUrlPath: null,
      adDataUrl: null,
      adBlobKey: null,
      adUrlPath: null,
      imageDataUrl: null,
      imageBlobKey: null,
      mainName: "",
      adName: "",
      imageName: "",
    },
    subtitlesMain: defaultSubtitlesMain(),
    subtitlesAD: defaultSubtitlesAD(),
    animation: defaultSanAgustinAnimation(),
    animAudioMainUrl: null,
    animAudioADUrl: null,
    animSubtitlesMain: null,
    animSubtitlesAD: null,
  };
}

export function defaultSubtitlesMain() {
  return [
    {
      start: 0,
      end: 10,
      text: "Esta urna funeraria es un ejemplo representativo de las prácticas rituales de la cultura San Agustín, desarrollada en el sur de Colombia hace más de mil años."
    },
    {
      start: 10,
      end: 20,
      text: "En estas comunidades, la muerte no era vista como un final, sino como una transición hacia otra dimensión, por lo que los rituales funerarios tenían un gran significado cultural."
    },
    {
      start: 20,
      end: 28,
      text: "Era común depositar restos humanos en urnas de cerámica, las cuales eran ubicadas dentro de estructuras funerarias especialmente construidas."
    },
    {
      start: 28,
      end: 36,
      text: "Estas urnas no eran simples recipientes, sino objetos con un profundo valor simbólico y espiritual dentro de la cosmovisión de estas comunidades."
    },
    {
      start: 36,
      end: 46,
      text: "A través de sus formas y representaciones, es posible identificar creencias relacionadas con la vida, la muerte y la relación con el entorno natural."
    },
    {
      start: 46,
      end: 56,
      text: "La cultura San Agustín se caracterizó por un fuerte componente ritual, en el que los objetos acompañaban a los difuntos como parte de su tránsito."
    },
    {
      start: 56,
      end: 64,
      text: "Además de las urnas, estos espacios incluían esculturas, ofrendas y elementos ceremoniales que reflejan la complejidad de sus prácticas funerarias."
    },
    {
      start: 64,
      end: 73,
      text: "Gracias a estos elementos, hoy es posible comprender aspectos culturales, sociales y religiosos de estas comunidades precolombinas."
    },
    {
      start: 73,
      end: 1e9,
      text: "Actualmente, la integración de tecnología permite interpretar y difundir este patrimonio cultural de forma accesible."
    }
  ];
}

export function defaultSubtitlesAD() {
  return JSON.parse(JSON.stringify(defaultSubtitlesMain()));
}

export function pickSubtitleAtTime(subs, t) {
  if (!Array.isArray(subs) || !subs.length || !Number.isFinite(t)) return "";
  for (const s of subs) {
    if (t >= s.start && t < s.end) return s.text;
  }
  let last = "";
  for (const s of subs) {
    if (s.start <= t) last = s.text;
  }
  if (last !== "") return last;
  return subs[0].text;
}

function hasOldUrnaPlaceholderSubsAD(subs) {
  if (!Array.isArray(subs) || !subs.length) return false;
  return String(subs[0]?.text || "").includes("imagen centrada de una urna");
}

function hasLegacyMainSubs(subs) {
  if (!Array.isArray(subs) || !subs.length) return false;
  return String(subs[0]?.text || "").includes("Esta pieza es un ejemplo representativo");
}

function mergeAppStateObject(o) {
  if (!o) return defaultAppState();
  const base = {
    ...defaultAppState(),
    ...o,
    audio: { ...defaultAppState().audio, ...(o.audio || {}) },
  };
  if (!Array.isArray(base.subtitlesMain) || base.subtitlesMain.length === 0) {
    base.subtitlesMain = defaultSubtitlesMain();
  } else if (hasLegacyMainSubs(base.subtitlesMain)) {
    base.subtitlesMain = defaultSubtitlesMain();
  }
  if (!Array.isArray(base.subtitlesAD) || base.subtitlesAD.length === 0) {
    base.subtitlesAD = defaultSubtitlesAD();
  } else if (hasOldUrnaPlaceholderSubsAD(base.subtitlesAD)) {
    base.subtitlesAD = defaultSubtitlesAD();
  } else if (hasLegacyMainSubs(base.subtitlesAD)) {
    base.subtitlesAD = defaultSubtitlesAD();
  }
  if (!base.animation) {
    base.animation = defaultSanAgustinAnimation();
  }
  if (base.animation?.name === "Animación ritual San Agustín") {
    base.animation.name = "Animación predeterminada";
  }
  if (base.animation && typeof base.animation.enabled !== "boolean") {
    base.animation.enabled = true;
  }
  return base;
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

let _memoryAppState = null;
let _appStateCache = null;
export async function hydrateAppStateFromStorage() {
  _memoryAppState = null;
  try {
    const fromIdb = await idbGet(APP_STATE_KEY);
    if (fromIdb != null) {
      _appStateCache = mergeAppStateObject(fromIdb);
      return;
    }
  } catch (e) {
    console.warn("IndexedDB (lectura):", e);
  }

  try {
    const raw = localStorage.getItem(APP_STATE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      _appStateCache = mergeAppStateObject(o);
      localStorage.removeItem(APP_STATE_KEY);
      try {
        await idbPut(APP_STATE_KEY, _appStateCache);
      } catch (e2) {
        console.warn("IndexedDB (migración):", e2);
        _memoryAppState = _appStateCache;
      }
      return;
    }
  } catch (e) {
    console.warn("Migración localStorage:", e);
  }

  _appStateCache = defaultAppState();
}

export async function pullAppStateFromIdbOnly() {
  try {
    const fromIdb = await idbGet(APP_STATE_KEY);
    if (fromIdb != null) {
      _appStateCache = mergeAppStateObject(fromIdb);
    }
  } catch (e) {
    console.warn("pullAppStateFromIdbOnly:", e);
  }
}

export function notifyAppStateChanged() {
  try {
    const bc = new BroadcastChannel(SYNC_CHANNEL);
    bc.postMessage({ type: "state" });
    bc.close();
  } catch {
  }
}

export function getAppState() {
  if (_memoryAppState) {
    return mergeAppStateObject(_memoryAppState);
  }
  if (_appStateCache) {
    return mergeAppStateObject(_appStateCache);
  }
  try {
    const raw = localStorage.getItem(APP_STATE_KEY);
    if (raw) {
      return mergeAppStateObject(JSON.parse(raw));
    }
  } catch {
  }
  return defaultAppState();
}

export function saveAppState(state) {
  const merged = mergeAppStateObject(state);
  _appStateCache = merged;
  _memoryAppState = null;

  idbPut(APP_STATE_KEY, merged)
    .then(() => {
      notifyAppStateChanged();
    })
    .catch((e) => {
      console.warn("IndexedDB (guardar):", e);
      _memoryAppState = merged;
    });

  try {
    const s = JSON.stringify(merged);
    if (s.length < 1_200_000) {
      localStorage.setItem(APP_STATE_KEY, s);
    } else {
      localStorage.removeItem(APP_STATE_KEY);
    }
  } catch {
    try {
      localStorage.removeItem(APP_STATE_KEY);
    } catch {
    }
  }
  return true;
}

export function mergeAppState(partial) {
  const cur = getAppState();
  const next = { ...cur, ...partial };
  if (partial.audio) next.audio = { ...cur.audio, ...partial.audio };
  saveAppState(next);
  return next;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html";
}

export function requireAdminExperience() {
  const s = getSession();
  if (!s || s.role !== "admin") {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

export function requireStudentPreview() {
  const s = getSession();
  if (!s || s.role !== "student") {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
