/* ============================================================
   APP — orchestration : récupération des données, état,
   et rendu de tous les blocs du dashboard.
   ============================================================ */

const PERSON_COLORS = {
  "Benjamin": "#2C7A73",
  "Florence": "#C77F2E",
  "Mélanie": "#B14B3F",
  "Randy": "#5B8A5A",
  "Simon": "#6E6AA8",
  "Equipe Dév": "#8B9A94",
};
const FALLBACK_COLORS = ["#2C7A73", "#C77F2E", "#B14B3F", "#5B8A5A", "#6E6AA8", "#8B9A94"];

function colorFor(name, idx) {
  return PERSON_COLORS[name] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

const state = {
  data: null,
  monthRange: 6, // nombre de mois affichés, ou "all"
  charts: {},
};

const els = {
  app: document.getElementById("app"),
  syncDot: document.getElementById("syncDot"),
  syncLabel: document.getElementById("syncLabel"),
  refreshBtn: document.getElementById("refreshBtn"),
};

function fmtHours(n) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}
function fmtPercent(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}
function sumSkipNull(arr) {
  return arr.reduce((acc, v) => acc + (v ?? 0), 0);
}
function lastValid(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined) return { value: arr[i], index: i };
  }
  return { value: null, index: -1 };
}

function visibleRange(monthsLength) {
  if (state.monthRange === "all") return { start: 0, end: monthsLength };
  const start = Math.max(0, monthsLength - state.monthRange);
  return { start, end: monthsLength };
}

/* ---------------- Boot ---------------- */

async function boot() {
  setSyncState("loading", "Synchronisation…");
  try {
    const csv = await Parser.fetchCsvText();
    const data = Parser.parse(csv);
    state.data = data;
    setSyncState("ok", `Synchronisé à ${data.fetchedAt.toLocaleTimeString("fr-FR")}`);
    renderAll();
  } catch (err) {
    console.error(err);
    setSyncState("error", "Échec de synchronisation");
    renderError(err);
  }
}

function setSyncState(kind, label) {
  els.syncDot.className = "sync-dot" + (kind === "loading" ? " is-loading" : kind === "error" ? " is-error" : "");
  els.syncLabel.textContent = label;
}

els.refreshBtn.addEventListener("click", boot);

if (window.DASHBOARD_CONFIG.AUTO_REFRESH_MS > 0) {
  setInterval(boot, window.DASHBOARD_CONFIG.AUTO_REFRESH_MS);
}

/* ---------------- Error state ---------------- */

function renderError(err) {
  els.app.innerHTML = `
    <div class="state-panel fade-in">
      <div class="state-panel__title">Impossible de lire la feuille Google Sheets</div>
      <p>Vérifie que le classeur est bien partagé en <strong>« Tous les utilisateurs qui ont le lien — Lecteur »</strong>,
      et que l'onglet « Dashboard » n'a pas changé de structure.</p>
      <code>${(err && err.message) || err}</code>
    </div>`;
}

/* ---------------- Main render ---------------- */

function renderAll() {
  const d = state.data;
  els.app.innerHTML = baseLayout();
  renderRangeButtons();
  renderDataQuality(d);
  renderKpis(d);
  renderMonthlyChart(d);
  renderPersonChart(d);
  renderGauges(d);
  renderPrestationStatus(d);
  renderServiceHours(d);
  renderOccupationTable(d);
  renderNonFactureCategories(d);
}

function baseLayout() {
  return `
    <div class="dq-banner" id="dqBanner"></div>

    <div class="controls">
      <span class="section-label">Vue d'ensemble</span>
      <div class="range-select" id="rangeSelect">
        <button data-range="3">3 mois</button>
        <button data-range="6">6 mois</button>
        <button data-range="12">12 mois</button>
        <button data-range="all">Tout</button>
      </div>
    </div>

    <div class="kpi-grid fade-in" id="kpiGrid"></div>

    <div class="grid-2">
      <div>
        <div class="card fade-in">
          <div class="card__head">
            <div>
              <h2 class="card__title">Facturé vs Non facturé</h2>
              <div class="card__subtitle">Heures par mois</div>
            </div>
          </div>
          <div class="chart-box"><canvas id="chartMonthly"></canvas></div>
        </div>

        <div class="card fade-in">
          <div class="card__head">
            <div>
              <h2 class="card__title">Charge par collaborateur</h2>
              <div class="card__subtitle">Total d'heures (facturé + non facturé) par mois</div>
            </div>
          </div>
          <div class="chart-box tall"><canvas id="chartPerson"></canvas></div>
        </div>

        <div class="card fade-in">
          <div class="card__head">
            <div>
              <h2 class="card__title">Taux d'occupation</h2>
              <div class="card__subtitle">% du temps contractuel utilisé, par collaborateur et par mois</div>
            </div>
          </div>
          <div class="table-scroll"><table class="data" id="occupationTable"></table></div>
        </div>
      </div>

      <div>
        <div class="card fade-in">
          <div class="card__head">
            <div>
              <h2 class="card__title">Charge actuelle</h2>
              <div class="card__subtitle">Dernier mois renseigné, par collaborateur</div>
            </div>
          </div>
          <div class="gauge-row" id="gaugeRow"></div>
        </div>

        <div class="card fade-in">
          <div class="card__head">
            <div>
              <h2 class="card__title">Statut des prestations</h2>
              <div class="card__subtitle">Répartition par type</div>
            </div>
          </div>
          <div id="prestaStatus"></div>
          <div class="legend">
            <span><span class="legend__dot" style="background:var(--teal)"></span>En cours</span>
            <span><span class="legend__dot" style="background:var(--amber)"></span>En suspens</span>
            <span><span class="legend__dot" style="background:var(--border-strong)"></span>Terminé</span>
          </div>
        </div>

        <div class="card fade-in">
          <div class="card__head">
            <div>
              <h2 class="card__title">Heures par prestation</h2>
              <div class="card__subtitle">Travaillées vs allouées</div>
            </div>
          </div>
          <div class="table-scroll"><table class="data" id="serviceHoursTable"></table></div>
        </div>

        <div class="card fade-in">
          <div class="card__head">
            <div>
              <h2 class="card__title">Non facturé — par catégorie</h2>
              <div class="card__subtitle">Total sur la période sélectionnée</div>
            </div>
          </div>
          <div class="table-scroll"><table class="data" id="categoryTable"></table></div>
        </div>
      </div>
    </div>
  `;
}

function renderRangeButtons() {
  const container = document.getElementById("rangeSelect");
  const buttons = [...container.querySelectorAll("button")];
  function sync() {
    buttons.forEach((b) => {
      const r = b.dataset.range === "all" ? "all" : parseInt(b.dataset.range, 10);
      b.classList.toggle("is-active", r === state.monthRange);
    });
  }
  buttons.forEach((b) => {
    b.addEventListener("click", () => {
      state.monthRange = b.dataset.range === "all" ? "all" : parseInt(b.dataset.range, 10);
      sync();
      renderKpis(state.data);
      renderMonthlyChart(state.data);
      renderPersonChart(state.data);
      renderOccupationTable(state.data);
      renderNonFactureCategories(state.data);
    });
  });
  sync();
}

/* ---------------- Data quality banner ---------------- */

function renderDataQuality(d) {
  const banner = document.getElementById("dqBanner");
  if (!d.anomalies.length) { banner.classList.remove("is-visible"); return; }
  banner.classList.add("is-visible");
  const items = d.anomalies.slice(0, 8).map(
    (a) => `<li><code>${a.location}</code> — valeur brute lue : <code>${a.rawValue}</code></li>`
  ).join("");
  const more = d.anomalies.length > 8 ? `<div style="margin-top:6px">+ ${d.anomalies.length - 8} autre(s) valeur(s) suspecte(s).</div>` : "";
  banner.innerHTML = `
    <div class="dq-banner__title">⚠ ${d.anomalies.length} valeur(s) incohérente(s) détectée(s) et exclue(s) des calculs</div>
    <div>Ces cellules dépassent ${window.DASHBOARD_CONFIG.ANOMALY_THRESHOLD_HOURS}h sur un mois pour une personne — probablement une erreur de formule dans la feuille source (ex. date au lieu d'un nombre d'heures). Elles sont ignorées ici pour ne pas fausser les graphiques :</div>
    <ul>${items}</ul>${more}`;
}

/* ---------------- KPIs ---------------- */

function renderKpis(d) {
  const { start, end } = visibleRange(d.months.length);
  const facTotal = sumSkipNull(d.facture.total.slice(start, end));
  const nonFacTotal = sumSkipNull(d.nonFacture.total.slice(start, end));
  const grandTotal = facTotal + nonFacTotal;
  const tauxFacturation = grandTotal > 0 ? (facTotal / grandTotal) * 100 : null;

  const facSlice = d.facture.total.slice(start, end);
  const lastIdx = facSlice.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0).pop();
  let trendHtml = "";
  if (lastIdx !== undefined && lastIdx > 0 && facSlice[lastIdx - 1] !== null) {
    const diff = facSlice[lastIdx] - facSlice[lastIdx - 1];
    const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
    trendHtml = `<div class="kpi__trend ${cls}">${arrow} ${Math.abs(Math.round(diff))}h vs mois précédent</div>`;
  }

  let occAvg = null;
  if (d.occupation.people.length) {
    const perPersonLast = d.occupation.people
      .filter((p) => p.capacityDays)
      .map((p) => lastValid(p.values).value)
      .filter((v) => v !== null);
    if (perPersonLast.length) occAvg = perPersonLast.reduce((a, b) => a + b, 0) / perPersonLast.length;
  }

  const enCours = sumSkipNull(d.prestations.map((p) => p.enCours));

  const cards = [
    { label: "Heures facturées", value: fmtHours(facTotal), unit: "h", trend: trendHtml },
    { label: "Heures non facturées", value: fmtHours(nonFacTotal), unit: "h" },
    { label: "Taux de facturation", value: fmtPercent(tauxFacturation), unit: "" },
    { label: "Occupation moyenne", value: fmtPercent(occAvg), unit: "" },
    { label: "Prestations en cours", value: fmtHours(enCours), unit: "" },
  ];

  document.getElementById("kpiGrid").innerHTML = cards.map((c) => `
    <div class="kpi">
      <div class="kpi__label">${c.label}</div>
      <div class="kpi__value">${c.value}<span class="kpi__unit">${c.unit}</span></div>
      ${c.trend || ""}
    </div>`).join("");
}

/* ---------------- Chart: Facturé vs Non facturé ---------------- */

function renderMonthlyChart(d) {
  const { start, end } = visibleRange(d.months.length);
  const labels = d.months.slice(start, end);
  const facture = d.facture.total.slice(start, end);
  const nonFacture = d.nonFacture.total.slice(start, end);

  if (state.charts.monthly) state.charts.monthly.destroy();
  const ctx = document.getElementById("chartMonthly");
  state.charts.monthly = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Facturé", data: facture, backgroundColor: "#2C7A73", borderRadius: 4, maxBarThickness: 34 },
        { label: "Non facturé", data: nonFacture, backgroundColor: "#C77F2E", borderRadius: 4, maxBarThickness: 34 },
      ],
    },
    options: baseChartOptions({ stacked: true }),
  });
}

/* ---------------- Chart: charge par personne ---------------- */

function renderPersonChart(d) {
  const { start, end } = visibleRange(d.months.length);
  const labels = d.months.slice(start, end);

  if (state.charts.person) state.charts.person.destroy();
  const ctx = document.getElementById("chartPerson");
  state.charts.person = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: d.total.people.map((p, idx) => ({
        label: p.name,
        data: p.values.slice(start, end),
        backgroundColor: colorFor(p.name, idx),
        borderRadius: 4,
        maxBarThickness: 30,
      })),
    },
    options: baseChartOptions({ stacked: true }),
  });
}

function baseChartOptions({ stacked }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { family: "Inter", size: 11.5 }, color: "#5B6D66" },
      },
      tooltip: {
        backgroundColor: "#101820",
        titleFont: { family: "IBM Plex Mono", size: 11 },
        bodyFont: { family: "IBM Plex Mono", size: 11 },
        padding: 10,
        cornerRadius: 6,
        callbacks: { label: (c) => `${c.dataset.label} : ${c.formattedValue} h` },
      },
    },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { font: { family: "Inter", size: 11 }, color: "#8B9A94" } },
      y: { stacked, grid: { color: "#D9E1DD" }, ticks: { font: { family: "IBM Plex Mono", size: 10.5 }, color: "#8B9A94" } },
    },
  };
}

/* ---------------- Gauges ---------------- */

function renderGauges(d) {
  const container = document.getElementById("gaugeRow");
  container.innerHTML = d.occupation.people.map((p, idx) => {
    const { value, index } = lastValid(p.values);
    const monthLabel = index >= 0 ? d.occupation.months[index] : "—";
    return gaugeSvg(p.name, value, monthLabel, colorFor(p.name, idx));
  }).join("");
}

function gaugeSvg(name, value, monthLabel, color) {
  const r = 38, cx = 50, cy = 50, circumference = 2 * Math.PI * r;
  const capped = value === null ? 0 : Math.min(value, 150);
  const fraction = capped / 150;
  const offset = circumference * (1 - fraction);
  const track = "#E7ECE9";
  const ringColor = value === null ? "#C3CDC8" : value > 115 ? "#B14B3F" : value < 65 ? "#C77F2E" : "#5B8A5A";
  return `
    <div class="gauge">
      <svg width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="Occupation ${name} : ${value === null ? "non renseigné" : Math.round(value) + "%"}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="9"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ringColor}" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          transform="rotate(-90 ${cx} ${cy})"/>
        <text x="50" y="46" text-anchor="middle" font-family="IBM Plex Mono" font-size="17" font-weight="600" fill="#14211C">${value === null ? "—" : Math.round(value) + "%"}</text>
        <text x="50" y="61" text-anchor="middle" font-family="IBM Plex Mono" font-size="8" fill="#8B9A94">${monthLabel}</text>
      </svg>
      <div class="gauge__name">${name}</div>
    </div>`;
}

/* ---------------- Prestations : statut ---------------- */

function renderPrestationStatus(d) {
  const container = document.getElementById("prestaStatus");
  container.innerHTML = d.prestations.map((p) => {
    const total = p.enCours + p.enSuspens + p.termine || 1;
    const pct = (v) => (v / total) * 100;
    return `
      <div class="presta-row">
        <div class="presta-row__top">
          <span class="presta-row__name">${p.name}</span>
          <span class="presta-row__count">${p.enCours} en cours · ${p.termine} terminées</span>
        </div>
        <div class="presta-bar">
          <div class="presta-bar__seg presta-bar__seg--cours" style="width:${pct(p.enCours)}%"></div>
          <div class="presta-bar__seg presta-bar__seg--suspens" style="width:${pct(p.enSuspens)}%"></div>
          <div class="presta-bar__seg presta-bar__seg--termine" style="width:${pct(p.termine)}%"></div>
        </div>
      </div>`;
  }).join("");
}

/* ---------------- Heures par prestation ---------------- */

function renderServiceHours(d) {
  const rows = d.prestaHeures.map((p) => {
    const pct = p.totalHeures > 0 ? Math.min(100, (p.travaillees / p.totalHeures) * 100) : 0;
    return `
      <tr>
        <td class="label-cell">${p.name}</td>
        <td>${fmtHours(p.travaillees)}</td>
        <td>${fmtHours(p.totalHeures)}</td>
        <td>${cellHeatPill(pct)}</td>
      </tr>`;
  }).join("");
  document.getElementById("serviceHoursTable").innerHTML = `
    <thead><tr><th class="label-cell">Prestation</th><th>Travaillées</th><th>Allouées</th><th>Avancement</th></tr></thead>
    <tbody>${rows}</tbody>`;
}

function cellHeatPill(pct) {
  const kind = pct >= 90 ? "over" : pct >= 60 ? "warn" : "ok";
  return `<span class="pill pill--${kind}">${Math.round(pct)}%</span>`;
}

/* ---------------- Table occupation (heatmap) ---------------- */

function renderOccupationTable(d) {
  const { start, end } = visibleRange(d.occupation.months.length);
  const months = d.occupation.months.slice(start, end);
  const head = `<thead><tr><th class="label-cell">Collaborateur</th>${months.map((m) => `<th>${m.replace(" 20", " '")}</th>`).join("")}</tr></thead>`;
  const body = d.occupation.people.map((p) => {
    const cells = p.values.slice(start, end).map((v) => {
      if (v === null) return `<td class="heat">—</td>`;
      const bg = heatColor(v);
      return `<td class="heat" style="background:${bg.bg};color:${bg.fg}">${Math.round(v)}%</td>`;
    }).join("");
    return `<tr><td class="label-cell">${p.name}${p.capacityDays ? ` <span style="color:var(--text-faint)">(${p.capacityDays}j)</span>` : ""}</td>${cells}</tr>`;
  }).join("");
  document.getElementById("occupationTable").innerHTML = head + `<tbody>${body}</tbody>`;
}

function heatColor(v) {
  if (v > 115) return { bg: "#F3DAD5", fg: "#6B2A21" };
  if (v < 65) return { bg: "#F5E4CC", fg: "#6E4517" };
  return { bg: "#DEEBDC", fg: "#2E4A2E" };
}

/* ---------------- Non facturé par catégorie ---------------- */

function renderNonFactureCategories(d) {
  const { start, end } = visibleRange(d.nonFactureCategories.months.length);
  const rows = d.nonFactureCategories.categories
    .map((c) => ({ name: c.name, total: sumSkipNull(c.values.slice(start, end)) }))
    .sort((a, b) => b.total - a.total);
  const grand = sumSkipNull(rows.map((r) => r.total)) || 1;
  const body = rows.map((r) => `
    <tr>
      <td class="label-cell">${r.name}</td>
      <td>${fmtHours(r.total)}</td>
      <td>${fmtPercent((r.total / grand) * 100)}</td>
    </tr>`).join("");
  document.getElementById("categoryTable").innerHTML = `
    <thead><tr><th class="label-cell">Catégorie</th><th>Heures</th><th>Part</th></tr></thead>
    <tbody>${body}</tbody>`;
}

boot();
