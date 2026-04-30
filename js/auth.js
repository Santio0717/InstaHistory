if (role === "admin") {
  window.location.href = "experience.html";
} else {
  sessionStorage.removeItem("introPlayed");
  window.location.href = "experienceusuario.html";
}
