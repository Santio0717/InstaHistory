const video = document.getElementById("introVideo");

// guardar que ya pasó por intro
sessionStorage.setItem("introPlayed", "true");

video.addEventListener("ended", () => {
  window.location.href = "preview.html";
});

// fallback si falla
video.addEventListener("error", () => {
  window.location.href = "preview.html";
});
