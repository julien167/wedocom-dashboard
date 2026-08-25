/* ============================================================
   PARSER — transforme le CSV brut de l'onglet Dashboard
   en un objet de données structuré et propre.
   ============================================================ */

const Parser = (() => {
  const cfg = window.DASHBOARD_CONFIG;

  function buildCsvUrl() {
    // Endpoint gviz : le plus fiable pour une lecture cross-origin
    // d'une feuille publique depuis un site statique (CORS ok).
    return `https://docs.google.com/spreadsheets/d/${cfg.SHEET_ID}/gviz/tq?tqx=out:csv&gid=${cfg.GID}&cachebust=${Date.now()}`;
  }

  function buildFallbackUrl() {
    return `https://docs.google.com/spreadsheets/d/${cfg.SHEET_ID}/export?format=csv&gid=${cfg.GID}&cachebust=${Date.now()}`;
  }

  async function fetchCsvText() {
    const tryUrls = [buildCsvUrl(), buildFallbackUrl()];
    let lastError;
    for (const url of tryUrls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text || text.trim().length === 0) throw new Error("Réponse vide");
        return text;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("Impossible de contacter Google Sheets");
  }

  function parseNumber(raw) {
    if (raw === undefined || raw === null) return 0;
    let s = String(raw).trim();
    if (s === "" || s === "​") return 0;
    s = s.replace(/\s|\u00A0|\u200B/g, ""); // espaces normaux, insécables, zero-width
    s = s.replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function parsePercent(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (s === "") return null;
    const n = parseFloat(s.replace("%", "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function cell(rows, r, c) {
    if (!rows[r]) return "";
    return (rows[r][c] ?? "").toString().trim();
  }

  function findRowIndex(rows, colIndex, matcher, fromIndex = 0) {
    for (let i = fromIndex; i < rows.length; i++) {
      const v = cell(rows, i, colIndex);
      if (typeof matcher === "string" ? v === matcher : matcher(v)) return i;
    }
    return -1;
  }

  function readMonthsHeader(rows, headerRowIdx, startCol) {
    const months = [];
    let c = startCol;
    while (true) {
      const v = cell(rows, headerRowIdx, c);
      if (!v) break;
      months.push(v);
      c++;
      if (months.length > 36) break; // garde-fou
    }
    return { months, endCol: c };
  }

  // Lit un bloc "Nom | mois... " de 6 lignes de personnes + 1 ligne Total
  function readPersonBlock(rows, headerRowIdx, startCol, monthCount, anomalies, blockLabel) {
    const people = [];
    let r = headerRowIdx + 1;
    while (true) {
      const name = cell(rows, r, 0);
      if (!name || name === "Total") break;
      const values = [];
      for (let m = 0; m < monthCount; m++) {
        const raw = cell(rows, r, startCol + m);
        let v = parseNumber(raw);
        if (v > cfg.ANOMALY_THRESHOLD_HOURS) {
          anomalies.push({
            location: `${blockLabel} · ${name} · ${cell(rows, headerRowIdx, startCol + m)}`,
            rawValue: raw,
          });
          v = null; // exclu des calculs/graphiques
        }
        values.push(v);
      }
      people.push({ name, values });
      r++;
      if (r - headerRowIdx > 20) break; // garde-fou
    }
    const totalRowIdx = r; // ligne "Total"
    const totalValues = [];
    for (let m = 0; m < monthCount; m++) {
      const raw = cell(rows, totalRowIdx, startCol + m);
      let v = parseNumber(raw);
      if (v > cfg.ANOMALY_THRESHOLD_HOURS * 6) {
        anomalies.push({
          location: `${blockLabel} · Total · ${cell(rows, headerRowIdx, startCol + m)}`,
          rawValue: raw,
        });
        v = null;
      }
      totalValues.push(v);
    }
    return { people, total: totalValues, nextRowIdx: totalRowIdx + 1 };
  }

  function parse(csvText) {
    const rows = Papa.parse(csvText, { skipEmptyLines: false }).data;
    const anomalies = [];

    // --- Bloc Facturé ---
    const idxFacture = findRowIndex(rows, 0, "Facturé");
    if (idxFacture === -1) throw new Error("Section 'Facturé' introuvable — la mise en page de l'onglet a peut-être changé.");
    const headFacture = idxFacture + 1;
    const { months, endCol } = readMonthsHeader(rows, headFacture, 1);
    const blocFacture = readPersonBlock(rows, headFacture, 1, months.length, anomalies, "Facturé");

    // --- Bloc Non facturé ---
    const idxNonFacture = findRowIndex(rows, 0, "Non facturé", blocFacture.nextRowIdx);
    const blocNonFacture = readPersonBlock(rows, idxNonFacture + 1, 1, months.length, anomalies, "Non facturé");

    // --- Bloc Total (section) ---
    const idxTotalSection = findRowIndex(rows, 0, "Total", blocNonFacture.nextRowIdx + 1);
    const blocTotal = readPersonBlock(rows, idxTotalSection + 1, 1, months.length, anomalies, "Total");

    // --- Table occupation % (4e occurrence de "Nom" en colonne A) ---
    let nomOccurrences = 0, idxOccupHeader = -1;
    for (let i = 0; i < rows.length; i++) {
      if (cell(rows, i, 0) === "Nom") {
        nomOccurrences++;
        if (nomOccurrences === 4) { idxOccupHeader = i; break; }
      }
    }
    const occupation = { months: [], people: [] };
    if (idxOccupHeader !== -1) {
      const occMonths = readMonthsHeader(rows, idxOccupHeader, 1).months;
      occupation.months = occMonths;
      let r = idxOccupHeader + 1;
      while (true) {
        const label = cell(rows, r, 0);
        if (!label || label === "Total") break;
        const match = label.match(/^(.*?)\s*\((\d+)\s*jours?\)/);
        const name = match ? match[1].trim() : label;
        const capacityDays = match ? parseInt(match[2], 10) : null;
        const values = [];
        for (let m = 0; m < occMonths.length; m++) {
          values.push(parsePercent(cell(rows, r, 1 + m)));
        }
        occupation.people.push({ name, capacityDays, values });
        r++;
        if (r - idxOccupHeader > 20) break;
      }
    }

    // --- Prestations (Nbre de prestations) : colonne P (15) ---
    const idxPresta = findRowIndex(rows, 15, "Prestation");
    const prestations = [];
    if (idxPresta !== -1) {
      let r = idxPresta + 1;
      while (true) {
        const name = cell(rows, r, 15);
        if (!name || name === "Total") break;
        prestations.push({
          name,
          enCours: parseNumber(cell(rows, r, 16)),
          enSuspens: parseNumber(cell(rows, r, 17)),
          termine: parseNumber(cell(rows, r, 18)),
        });
        r++;
        if (r - idxPresta > 20) break;
      }
    }

    // --- Heures par prestation (Total / travaillées / reste) ---
    const idxHeures = findRowIndex(rows, 16, "Total nbre d'heure");
    const prestaHeures = [];
    if (idxHeures !== -1) {
      let r = idxHeures + 1;
      while (true) {
        const name = cell(rows, r, 15);
        if (!name || name === "Total") break;
        prestaHeures.push({
          name,
          totalHeures: parseNumber(cell(rows, r, 16)),
          travaillees: parseNumber(cell(rows, r, 17)),
          reste: parseNumber(cell(rows, r, 18)),
        });
        r++;
        if (r - idxHeures > 20) break;
      }
    }

    // --- Non facturé par catégorie ---
    const idxCat = findRowIndex(rows, 0, (v) => v.toLowerCase() === "non facturé", idxTotalSection + 15);
    const nonFactureCategories = { months: [], categories: [] };
    if (idxCat !== -1) {
      const catMonths = readMonthsHeader(rows, idxCat, 1).months;
      nonFactureCategories.months = catMonths;
      let r = idxCat + 1;
      while (true) {
        const name = cell(rows, r, 0);
        if (!name || name === "Total") break;
        const values = [];
        for (let m = 0; m < catMonths.length; m++) {
          const raw = cell(rows, r, 1 + m);
          let v = parseNumber(raw);
          if (v > cfg.ANOMALY_THRESHOLD_HOURS) {
            anomalies.push({ location: `Non facturé (catégorie) · ${name} · ${catMonths[m]}`, rawValue: raw });
            v = null;
          }
          values.push(v);
        }
        nonFactureCategories.categories.push({ name, values });
        r++;
        if (r - idxCat > 20) break;
      }
    }

    return {
      months,
      facture: blocFacture,
      nonFacture: blocNonFacture,
      total: blocTotal,
      occupation,
      prestations,
      prestaHeures,
      nonFactureCategories,
      anomalies,
      fetchedAt: new Date(),
    };
  }

  return { fetchCsvText, parse };
})();
