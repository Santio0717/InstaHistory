const video = document.getElementById("introVideo");
const postVideoActions = document.getElementById("postVideoActions");

video.addEventListener("ended", () => {
  sessionStorage.setItem("introPlayed", "true");
  if (postVideoActions) {
    postVideoActions.style.display = "flex";
  }
});

video.addEventListener("error", () => {
  sessionStorage.setItem("introPlayed", "true");
  if (postVideoActions) {
    postVideoActions.style.display = "flex";
  }
});

const btnReiniciar = document.getElementById("btnReiniciarVideo");
const btnContinuar = document.getElementById("btnContinuarVideo");

if (btnReiniciar) {
  btnReiniciar.addEventListener("click", () => {
    postVideoActions.style.display = "none";
    video.currentTime = 0;
    video.play();
  });
}

if (btnContinuar) {
  btnContinuar.addEventListener("click", () => {
    window.location.href = "preview.html";
  });
}
