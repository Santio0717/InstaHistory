import { setSession, logout } from "./state.js";

document.getElementById("btnLogout").onclick = () => logout();

const form = document.getElementById("userForm");
const err = document.getElementById("errorUser");

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

  window.location.href = "preview.html";
});
