# 30X Pro Rechner

Wissenschaftlicher Taschenrechner mit natürlicher Anzeige (Brüche, Wurzeln, π exakt) als Web-App und Android-App: Statistik, Verteilungen, Gleichungslöser, Matrizen, Vektoren, Tabellen, Einheiten, Konstanten.

Inoffizielles Lernprojekt, nicht verbunden mit Texas Instruments. Handys sind in Prüfungen fast immer verboten – die App ist zum Üben gedacht.

## Benutzen

- **iPhone / iPad / PC:** <https://dlarz.github.io/calc30x/> öffnen. Auf dem iPhone in Safari: Teilen → „Zum Home-Bildschirm“. Danach läuft der Rechner wie eine App, auch offline.
- **Android:** `calc30x.apk` aus den [Releases](https://github.com/Dlarz/calc30x/releases) herunterladen und installieren (Installation aus unbekannten Quellen erlauben).

## Entwickeln

- `web/` – der ganze Rechner (`engine.js` Mathematik, `ui.js` Tasten und Bildschirme, `index.html`).
- `node test/engine.test.js` – Selbsttests der Mathematik.
- `bash build.sh` – baut die APK mit den Android-SDK-Build-Tools (ohne Gradle).
- Web-App aktualisieren: `git subtree push --prefix web origin gh-pages`
