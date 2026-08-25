  function buildCsvUrl() {
    // URL "Publier sur le web" : la plus fiable pour un accès
    // cross-origin depuis un site statique (CORS activé).
    const sep = cfg.PUBLISHED_CSV_URL.includes("?") ? "&" : "?";
    return `${cfg.PUBLISHED_CSV_URL}${sep}cachebust=${Date.now()}`;
  }

  function buildFallbackUrl() {
    // Repli (fonctionne si le partage évolue vers un mode
    // compatible CORS sans passer par "Publier sur le web").
    return `https://docs.google.com/spreadsheets/d/${cfg.SHEET_ID}/gviz/tq?tqx=out:csv&gid=${cfg.GID}&cachebust=${Date.now()}`;
  }
