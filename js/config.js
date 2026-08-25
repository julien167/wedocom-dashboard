/* ============================================================
   CONFIGURATION — à adapter si besoin
   ------------------------------------------------------------
   PUBLISHED_CSV_URL : l'URL générée par
   Fichier > Partager > Publier sur le web > format CSV,
   pour l'onglet "Dashboard" précisément.
   C'est cette étape (différente du partage classique) qui
   active un accès public compatible avec la lecture depuis
   un site externe (CORS).

   Le classeur doit rester "Publié sur le web" pour cet onglet.
   ============================================================ */

window.DASHBOARD_CONFIG = {
  PUBLISHED_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJHWIH8n1BvTnGkYNfVN55C5xEDDCQNS0MvQ_pHU1qpmsbNr-CuU20eWKgBz_A5huSNlrLhlJdGvRp/pub?gid=421722796&single=true&output=csv",

  // Repli utilisés uniquement si l'URL ci-dessus est indisponible.
  SHEET_ID: "1P31O3qN6V1PC-i_CkpRuYupaUBOxbfB9_SELgE805aQ",
  GID: "421722796",

  // Seuil (en heures) au-delà duquel une cellule mensuelle est
  // considérée comme une anomalie de données (bug de formule,
  // fusion de cellule, etc.) et exclue des graphiques/totaux.
  ANOMALY_THRESHOLD_HOURS: 300,

  // Jours ouvrés standard utilisés pour convertir un objectif
  // "jours/mois" en heures si besoin (7h/jour).
  HOURS_PER_DAY: 7,

  // Rafraîchissement automatique (ms). 0 = désactivé.
  AUTO_REFRESH_MS: 5 * 60 * 1000,
};
