import { getAppState, mergeAppState } from "./state.js";

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Lista más reciente primero (solo lectura) */
export function getTestimonialsSorted() {
  return [...(getAppState().testimonials || [])].reverse();
}

export function formatTestimoniosReadonlyHTML(list) {
  if (!list.length) {
    return "<p class=\"muted testimonios-empty-msg\">Aún no hay testimonios publicados.</p>";
  }
  return `<ul class="testimonios-readonly-list">
    ${list
      .map(
        (t) => `
      <li class="testimonio-readonly-card">
        <p class="testimonio-readonly-text">${escHtml(t.text)}</p>
        <span class="testimonio-readonly-fecha">${escHtml(t.fecha || "")}</span>
      </li>`
      )
      .join("")}
  </ul>`;
}

/** Panel administración: formulario + lista con eliminar */
export function renderTestimoniosAdmin(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.innerHTML = `
    <p class="muted small-gap">
      Los estudiantes pueden leer estos textos desde <strong>Ver testimonios</strong> en su página de acceso.
    </p>
    <label class="label" for="testimonioTexto">Nuevo testimonio</label>
    <textarea id="testimonioTexto" class="testimonio-textarea" rows="5" placeholder="Escribe el testimonio aquí…"></textarea>
    <div class="row wrap">
      <button type="button" class="btn" id="btnSaveTestimonio">Guardar testimonio</button>
    </div>
    <h3 class="h3-testimonios">Publicados</h3>
    <ul id="testimoniosAdminList" class="testimonios-admin-list"></ul>
  `;

  const ul = document.getElementById("testimoniosAdminList");
  const ta = document.getElementById("testimonioTexto");

  function renderList() {
    if (!ul) return;
    const list = [...(getAppState().testimonials || [])].reverse();
    if (!list.length) {
      ul.innerHTML = "<li class=\"muted\">Ninguno aún.</li>";
      return;
    }
    ul.innerHTML = list
      .map(
        (t) => `
      <li class="testimonio-admin-card">
        <p class="testimonio-admin-text">${escHtml(t.text)}</p>
        <div class="testimonio-admin-footer">
          <span class="muted">${escHtml(t.fecha || "")}</span>
          <button type="button" class="btn secondary small btn-testimonio-del" data-id="${escHtml(t.id)}">Eliminar</button>
        </div>
      </li>`
      )
      .join("");
  }

  document.getElementById("btnSaveTestimonio")?.addEventListener("click", () => {
    const text = ta?.value?.trim();
    if (!text) return;
    const t = {
      id: String(Date.now()),
      text,
      fecha: new Date().toLocaleString("es-CO"),
    };
    mergeAppState({ testimonials: [...(getAppState().testimonials || []), t] });
    ta.value = "";
    renderList();
  });

  ul?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-testimonio-del");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (!id || !confirm("¿Eliminar este testimonio?")) return;
    mergeAppState({
      testimonials: (getAppState().testimonials || []).filter((x) => String(x.id) !== id),
    });
    renderList();
  });

  renderList();
}
