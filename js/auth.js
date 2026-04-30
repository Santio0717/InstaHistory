const form = document.getElementById("loginForm");
const err = document.getElementById("error");

function setSession(user) {
  localStorage.setItem("ih_session", JSON.stringify(user));
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  err.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    err.textContent = "Completa correo y contraseña.";
    return;
  }

  if (!email.endsWith("@uao.edu.co")) {
    err.textContent = "Debes usar un correo @uao.edu.co";
    return;
  }

  // 🔥 DEFINIR ROL
  let role = "student";

  // 👉 si quieres admin por correo específico
  if (email === "admin@uao.edu.co") {
    role = "admin";
  }

  setSession({
    email,
    role,
    ts: Date.now()
  });

  // 🔥 REDIRECCIÓN CORRECTA
  if (role === "admin") {
    window.location.href = "experience.html";
  } else {
    window.location.href = "experienceusuario.html"; // 👉 aquí está el video
  }
});
