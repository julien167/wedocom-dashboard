/* ============================================================
   CONFIGURATION — à adapter si besoin
   ------------------------------------------------------------
   SHEET_ID : l'identifiant de ton classeur Google Sheets
   (visible dans l'URL entre /d/ et /edit).
   GID      : l'identifiant de l'onglet "Dashboard" précis
   (visible dans l'URL après #gid=).

   Le classeur doit rester en partage
   "Tous les utilisateurs qui ont le lien — Lecteur"
   pour que le site puisse lire les données sans connexion.
   ============================================================ */

window.DASHBOARD_CONFIG = {
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
