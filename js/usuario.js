import { setSession, logout, hydrateAppStateFromStorage, getAppState } from "./state.js";
import { formatTestimoniosReadonlyHTML, getTestimonialsSorted } from "./testimonios.js";

document.getElementById("btnLogout").onclick = () => logout();

const form = document.getElementById("userForm");
const err = document.getElementById("errorUser");

function openTestimoniosModal() {
  const modal = document.getElementById("testimoniosModal");
  const body = document.getElementById("testimoniosModalBody");
  if (!modal || !body) return;
  const list = getTestimonialsSorted();
  body.innerHTML = formatTestimoniosReadonlyHTML(list);
  modal.hidden = false;
  modal.removeAttribute("aria-hidden");
}

function closeTestimoniosModal() {
  const modal = document.getElementById("testimoniosModal");
  if (modal) {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }
}

document.getElementById("btnVerTestimonios")?.addEventListener("click", async () => {
  try {
    await hydrateAppStateFromStorage();
  } catch (e) {
    console.warn("hydrate testimonios", e);
  }
  openTestimoniosModal();
});

document.getElementById("testimoniosModalClose")?.addEventListener("click", closeTestimoniosModal);
document.getElementById("testimoniosModalBackdrop")?.addEventListener("click", closeTestimoniosModal);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const m = document.getElementById("testimoniosModal");
  if (m && !m.hidden) closeTestimoniosModal();
});

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  err.textContent = "";

  const nombre = document.getElementById("nombre").value.trim();
  const apellido = document.getElementById("apellido").value.trim();

  if (!nombre || !apellido) {
    err.textContent = "Completa nombre y apellido.";
    return;
  }

  setSession({
    nombre,
    apellido,
    role: "student",
    ts: Date.now(),
  });

  window.location.href = "experienceusuario.html";
});
