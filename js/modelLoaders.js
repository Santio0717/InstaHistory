function loadGltfViaBlobUrl(gltfLoader, dataUrl) {
  return fetch(dataUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`No se pudo leer el archivo (${r.status})`);
      return r.blob();
    })
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const u = URL.createObjectURL(blob);
          gltfLoader.load(
            u,
            (gltf) => {
              URL.revokeObjectURL(u);
              resolve(gltf);
            },
            undefined,
            (err) => {
              URL.revokeObjectURL(u);
              reject(err);
            }
          );
        })
    );
}

export async function parseObjFromDataUrl(objLoader, dataUrl) {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`No se pudo leer el OBJ (${res.status})`);
  const blob = await res.blob();
  let text = await blob.text();
  if (!text.trim()) throw new Error("Archivo OBJ vacío");
  text = text.replace(/^\s*mtllib[^\r\n]*/gim, "");

  if (typeof objLoader.parse === "function") {
    try {
      return objLoader.parse(text);
    } catch (e) {
      console.warn("OBJLoader.parse falló, probando blob URL:", e);
    }
  }

  const safeBlob = new Blob([text], { type: "text/plain" });
  const blobUrl = URL.createObjectURL(safeBlob);
  return new Promise((resolve, reject) => {
    objLoader.load(
      blobUrl,
      (group) => {
        URL.revokeObjectURL(blobUrl);
        resolve(group);
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(blobUrl);
        reject(err);
      }
    );
  });
}

export async function parseGltfFromDataUrl(gltfLoader, dataUrl, kind) {
  try {
    if (kind === "glb") {
      const buf = await fetch(dataUrl).then((r) => {
        if (!r.ok) throw new Error(`No se pudo leer el GLB (${r.status})`);
        return r.arrayBuffer();
      });
      return await new Promise((resolve, reject) => {
        gltfLoader.parse(buf, "", resolve, reject);
      });
    }
    const text = await fetch(dataUrl).then((r) => {
      if (!r.ok) throw new Error(`No se pudo leer el GLTF (${r.status})`);
      return r.text();
    });
    return await new Promise((resolve, reject) => {
      gltfLoader.parse(text, "", resolve, reject);
    });
  } catch (e) {
    console.warn("GLTF parse (data URL) falló, usando blob URL:", e);
    return loadGltfViaBlobUrl(gltfLoader, dataUrl);
  }
}

export async function parseGltfFromDataUrlAuto(gltfLoader, dataUrl) {
  try {
    const res = await fetch(dataUrl);
    if (!res.ok) throw new Error(`No se pudo leer el modelo (${res.status})`);
    const buf = await res.arrayBuffer();
    const u8 = new Uint8Array(buf.slice(0, Math.min(4, buf.byteLength)));
    const isGlb =
      u8.length >= 4 && u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46;
    return await new Promise((resolve, reject) => {
      if (isGlb) {
        gltfLoader.parse(buf, "", resolve, reject);
      } else {
        const text = new TextDecoder().decode(buf);
        gltfLoader.parse(text, "", resolve, reject);
      }
    });
  } catch (e) {
    console.warn("GLTF auto parse falló, usando blob URL:", e);
    return loadGltfViaBlobUrl(gltfLoader, dataUrl);
  }
}
