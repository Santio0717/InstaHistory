const video = document.getElementById("introVideo");

video.addEventListener("ended", () => {
  sessionStorage.setItem("introPlayed", "true");
  window.location.href = "preview.html";
});

video.addEventListener("error", () => {
  alert("No se pudo cargar el video.");
});
