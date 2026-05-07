const RESULTS_KEY = "ih_results";

export function saveResult(data) {
  const existing = getResults();
  existing.push({
    ...data,
    timestamp: Date.now(),
    fecha: new Date().toLocaleString("es-CO")
  });
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn("No se pudo guardar resultado:", e);
  }
}

export function getResults() {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function clearResults() {
  localStorage.removeItem(RESULTS_KEY);
}

/** Elimina un resultado por su índice en el array guardado (orden cronológico de guardado). */
export function deleteResultAt(index) {
  const arr = getResults();
  if (index < 0 || index >= arr.length) return;
  arr.splice(index, 1);
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn("No se pudo actualizar resultados:", e);
  }
}
