import * as resultsApi from "./results.js";

/** Misma clave que en `results.js` (fallback si el navegador cachea una versión antigua sin `deleteResultAt`). */
const IH_RESULTS_KEY = "ih_results";

function removeResultByIndex(index) {
  if (typeof resultsApi.deleteResultAt === "function") {
    resultsApi.deleteResultAt(index);
    return;
  }
  const arr = resultsApi.getResults();
  if (index < 0 || index >= arr.length) return;
  arr.splice(index, 1);
  try {
    localStorage.setItem(IH_RESULTS_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn("No se pudo actualizar resultados:", e);
  }
}

let _reportChartInstances = [];
let _lastReportesContainerId = "reportesContent";
let _printHooksInstalled = false;

function destroyReportCharts() {
  _reportChartInstances.forEach((c) => {
    try {
      c.destroy();
    } catch {
      /* ignore */
    }
  });
  _reportChartInstances = [];
}

function initReportCharts(results) {
  destroyReportCharts();
  if (!results.length || typeof globalThis.Chart === "undefined") return;

  const Chart = globalThis.Chart;
  Chart.defaults.color = "#a8b2d6";
  Chart.defaults.borderColor = "#2a3f66";

  let sumCorrectas = 0;
  let sumIncorrectas = 0;
  results.forEach((r) => {
    sumCorrectas += Number(r.correctas) || 0;
    sumIncorrectas += Number(r.incorrectas) || 0;
  });

  const ctxRes = document.getElementById("reportChartResumen");
  if (ctxRes && (sumCorrectas > 0 || sumIncorrectas > 0)) {
    _reportChartInstances.push(
      new Chart(ctxRes, {
        type: "doughnut",
        data: {
          labels: ["Respuestas correctas", "Respuestas incorrectas"],
          datasets: [
            {
              data: [sumCorrectas, sumIncorrectas],
              backgroundColor: ["#22c55e", "#ef4444"],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
            title: {
              display: true,
              text: "Total de respuestas registradas",
              color: "#e9eeff",
              font: { size: 14 },
            },
          },
        },
      })
    );
  }

  const bySimbolo = {};
  results.forEach((r) => {
    const s = String(r.simbolo ?? "—").trim() || "—";
    if (!bySimbolo[s]) bySimbolo[s] = 0;
    bySimbolo[s] += Number(r.correctas) || 0;
  });
  const symEntries = Object.entries(bySimbolo).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const ctxSym = document.getElementById("reportChartSimbolos");
  if (ctxSym && symEntries.length) {
    _reportChartInstances.push(
      new Chart(ctxSym, {
        type: "bar",
        data: {
          labels: symEntries.map(([k]) => (k.length > 18 ? `${k.slice(0, 18)}…` : k)),
          datasets: [
            {
              label: "Aciertos por símbolo",
              data: symEntries.map(([, v]) => v),
              backgroundColor: "rgba(106, 169, 255, 0.55)",
              borderColor: "#6aa9ff",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: "#a8b2d6" },
              grid: { color: "#1a2338" },
            },
            y: {
              ticks: { color: "#a8b2d6", font: { size: 11 } },
              grid: { display: false },
            },
          },
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: "Aciertos acumulados por símbolo (hasta 12)",
              color: "#e9eeff",
              font: { size: 14 },
            },
          },
        },
      })
    );
  }

  const last = [...results].reverse().slice(-12);
  const ctxSes = document.getElementById("reportChartSesiones");
  if (ctxSes && last.length) {
    const labels = last.map((r, i) => {
      const u = String(r.usuario ?? "—").trim();
      const short = u.length > 10 ? `${u.slice(0, 10)}…` : u;
      return `#${i + 1} ${short}`;
    });
    const dataCorr = last.map((r) => Number(r.correctas) || 0);
    const dataInc = last.map((r) => Number(r.incorrectas) || 0);

    _reportChartInstances.push(
      new Chart(ctxSes, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Correctas",
              data: dataCorr,
              backgroundColor: "rgba(34, 197, 94, 0.65)",
              borderColor: "#22c55e",
              borderWidth: 1,
            },
            {
              label: "Incorrectas",
              data: dataInc,
              backgroundColor: "rgba(239, 68, 68, 0.55)",
              borderColor: "#ef4444",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true,
              ticks: { color: "#a8b2d6", maxRotation: 45, minRotation: 35, font: { size: 10 } },
              grid: { color: "#1a2338" },
            },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: { color: "#a8b2d6" },
              grid: { color: "#1a2338" },
            },
          },
          plugins: {
            legend: { position: "bottom" },
            title: {
              display: true,
              text: "Últimas sesiones (orden cronológico)",
              color: "#e9eeff",
              font: { size: 14 },
            },
          },
        },
      })
    );
  }
}

/** Solo para PDF: texto y ejes en negro (Chart.js pinta en canvas; hace falta defaults + update completo). */
function applyChartsPrintTheme() {
  const Chart = globalThis.Chart;
  if (Chart) {
    Chart.defaults.color = "#000000";
    Chart.defaults.borderColor = "#888888";
  }

  _reportChartInstances.forEach((chart) => {
    try {
      const o = chart.options;
      o.color = "#000000";

      o.layout = { padding: { top: 14, right: 12, bottom: 30, left: 12 } };

      o.plugins = o.plugins || {};
      if (o.plugins.legend) {
        if (!o.plugins.legend.labels) o.plugins.legend.labels = {};
        o.plugins.legend.labels.color = "#000000";
        o.plugins.legend.labels.padding = 12;
        o.plugins.legend.labels.font = o.plugins.legend.labels.font || {};
        o.plugins.legend.labels.font.size = 12;
        o.plugins.legend.labels.font.weight = "600";
        o.plugins.legend.labels.font.family = "system-ui, sans-serif";
      }
      if (o.plugins.title) {
        o.plugins.title.color = "#000000";
        o.plugins.title.font = o.plugins.title.font || {};
        o.plugins.title.font.size = o.plugins.title.font.size || 14;
        o.plugins.title.font.weight = "700";
        o.plugins.title.font.family = "system-ui, sans-serif";
      }

      if (o.scales) {
        for (const k of Object.keys(o.scales)) {
          const s = o.scales[k];
          if (!s) continue;
          if (!s.ticks) s.ticks = {};
          s.ticks.color = "#000000";
          s.ticks.font = s.ticks.font || {};
          s.ticks.font.size = s.ticks.font.size || 11;
          s.ticks.font.weight = "600";
          s.ticks.font.family = "system-ui, sans-serif";
          if (!s.grid) s.grid = {};
          s.grid.color = "#cccccc";
          if (s.title) {
            s.title.color = "#000000";
            s.title.font = s.title.font || {};
            s.title.font.weight = "600";
          }
        }
      }

      chart.update();
    } catch {
      /* ignore */
    }
  });
}

function installPrintHooksOnce() {
  if (_printHooksInstalled) return;
  _printHooksInstalled = true;
  window.addEventListener("beforeprint", () => {
    const panel = document.getElementById("panel-reportes");
    if (!panel?.classList.contains("active-panel")) return;
    if (!_reportChartInstances.length) return;
    applyChartsPrintTheme();
  });
  window.addEventListener("afterprint", () => {
    const panel = document.getElementById("panel-reportes");
    if (!panel?.classList.contains("active-panel")) return;
    if (!document.getElementById(_lastReportesContainerId)?.querySelector(".reportes-root")) return;
    renderReportes(_lastReportesContainerId);
  });
}

export function renderReportes(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  _lastReportesContainerId = containerId;
  const results = resultsApi.getResults();

  container.innerHTML = `
    <div class="reportes-root">
    <div class="reportes-toolbar">
      <button class="btn" id="btnExportPdf">Exportar PDF</button>
      <button class="btn secondary" id="btnExportCsv">Exportar Excel (CSV)</button>
      <button class="btn danger-outline" id="btnClearReportes">Limpiar</button>
      <span class="reportes-count">${results.length} registro${results.length !== 1 ? "s" : ""}</span>
    </div>
    ${
      results.length
        ? `<div class="reportes-charts-wrap" id="reportesChartsWrap">
      <div class="reportes-chart-box">
        <canvas id="reportChartResumen" aria-label="Gráfico resumen respuestas"></canvas>
      </div>
      <div class="reportes-chart-box">
        <canvas id="reportChartSimbolos" aria-label="Gráfico por símbolo"></canvas>
      </div>
      <div class="reportes-chart-box">
        <canvas id="reportChartSesiones" aria-label="Gráfico últimas sesiones"></canvas>
      </div>
    </div>`
        : ""
    }
    <div class="reportes-table-wrap" id="reportesTableWrap">
      ${results.length === 0 ? renderEmpty() : renderTable(results)}
    </div>
    </div>
  `;

  document.getElementById("btnExportPdf")?.addEventListener("click", exportPdf);
  document.getElementById("btnExportCsv")?.addEventListener("click", () => exportCsv(results));
  document.getElementById("btnClearReportes")?.addEventListener("click", () => {
    if (confirm("¿Eliminar todos los registros?")) {
      resultsApi.clearResults();
      renderReportes(containerId);
    }
  });

  container.querySelector(".reportes-table")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-result-idx]");
    if (!btn) return;
    e.preventDefault();
    const idx = parseInt(btn.getAttribute("data-result-idx"), 10);
    if (!Number.isInteger(idx) || idx < 0) return;
    const list = resultsApi.getResults();
    if (idx >= list.length) return;
    if (!confirm("¿Eliminar este registro?")) return;
    removeResultByIndex(idx);
    renderReportes(containerId);
  });

  if (results.length) {
    requestAnimationFrame(() => initReportCharts(results));
  }

  installPrintHooksOnce();
}

function renderEmpty() {
  return `<div class="reportes-empty">No hay registros aún.<br>Los resultados aparecen aquí cuando los estudiantes completan la experiencia.</div>`;
}

function renderTable(results) {
  const n = results.length;
  const rows = [...results]
    .reverse()
    .map((r, displayI) => {
      const storageIdx = n - 1 - displayI;
      const labelUsuario = String(r.usuario ?? "—").trim().slice(0, 40);
      return `
    <tr>
      <td>${escHtml(r.usuario || "—")}</td>
      <td>${escHtml(r.simbolo || "—")}</td>
      <td>${escHtml(r.tiempoTotal || "—")}</td>
      <td style="color:#22c55e;font-weight:600;">${r.correctas ?? "—"}</td>
      <td style="color:#ef4444;font-weight:600;">${r.incorrectas ?? "—"}</td>
      <td>${r.total ?? "—"}</td>
      <td>${escHtml(r.fecha || "—")}</td>
      <td class="reportes-actions-col">
        <button type="button" class="btn danger-outline small" data-result-idx="${storageIdx}" aria-label="Eliminar registro de ${escHtml(labelUsuario)}">Eliminar</button>
      </td>
    </tr>
  `;
    })
    .join("");

  return `
    <table class="reportes-table">
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Símbolo</th>
          <th>Tiempo</th>
          <th>Correctas</th>
          <th>Incorrectas</th>
          <th>Total</th>
          <th>Fecha</th>
          <th class="reportes-actions-col">Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function exportPdf() {
  if (_reportChartInstances.length) {
    applyChartsPrintTheme();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  } else {
    window.print();
  }
}

function exportCsv(results) {
  const header = ["Usuario", "Símbolo", "Tiempo Total", "Correctas", "Incorrectas", "Total Preguntas", "Fecha"];
  const rows = [...results].reverse().map((r) =>
    [
      r.usuario || "",
      r.simbolo || "",
      r.tiempoTotal || "",
      r.correctas ?? "",
      r.incorrectas ?? "",
      r.total ?? "",
      r.fecha || "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csvContent = [header.join(","), ...rows].join("\n");
  const bom = "﻿";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `instahistory-reportes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
