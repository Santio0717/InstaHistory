const form = document.getElementById("loginForm");
const err = document.getElementById("error");

function setSession(user) {
  localStorage.setItem("ih_session", JSON.stringify(user));
}

function go() {
  window.location.href = "experience.html";
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

  setSession({
    email,
    role: "admin",
    ts: Date.now()
  });

  go();
});
