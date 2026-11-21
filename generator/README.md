# 3D-Generator (Stufe 2)

Erzeugt aus Name + Motiv fertige Druckdateien (3MF für Bambu Studio, P1S) – komplett im Browser, ohne Server.
Aufruf: Backoffice → Druckplatten-Karte → **„3D-Datei“** (oder direkt `generator/`).

## Dateien
| Datei | Aufgabe |
|---|---|
| `index.html`, `app.js`, `generator.css` | Bedienoberfläche (Schrift wählen, Vorschau, Download) |
| `js/einstellungen.js` | **alle Zahlen & Regeln** (Mindest-Verbindung, Höhe, Motiv-Positionen …) |
| `js/kugel.js` | das „Gehirn“: Name setzen, lose Teile verbinden, Motive platzieren, prüfen |
| `js/geo.js` | flache Geometrie (Vereinigen, Versatz, Verbindungsbreite messen) |
| `js/schrift.js` | Schrift laden (lokal im Browser, IndexedDB) + Name → Umrisse |
| `js/export.js` | 2D → 3D, 3MF/STL, Anordnung auf der Platte |
| `js/vorschau.js` | SVG-Vorschau |
| `vorlagen/teile.json` | Umrisse von Ring + Motiven (aus Joels STLs) |
| `werkzeuge/stl_zu_teile.py` | wandelt neue STL-Teile in `teile.json` um |

Bibliotheken liegen in `../vendor/` (opentype.js, Clipper, earcut). Die Schrift **Heartland Script** wird **nie** hochgeladen oder committet – Joel wählt die `.otf` einmal im Browser.

## Joels Regeln (aus seiner Handarbeit in Canva + Bambu Studio)
Drucker P1S · Düse 0,4 mm · Schicht 0,2 mm · Dicke 5 mm (in der App einstellbar).
1. **Alles hängt zusammen** – keine losen Teile.
2. **i-Punkte / Umlaut-Punkte**: dünne Brücke (1,0 mm) von der Mitte des Punkts **mittig** in den Stängel darunter (Punkt soll erkennbar bleiben).
3. **Abgesetzter Anfangs-/Endbuchstabe** (P bei Paul): ranschieben, bis er an **einer** Stelle berührt (≥ 1,2 mm) – nicht der Länge nach ankleben, nie in einen i-/Ü-Punkt rutschen.
4. Sonst **Brücke** 1,6 mm: kleine Lücken (≤ 1,5 mm: T-/F-Balken, J→ü, Bindestrich) an der engsten Stelle, größere (≤ 3,5 mm) **unten an der Grundlinie** (W→i bei „Wilma“).
4b. Keine Extra-Striche: schmale Ritzen innerhalb von Buchstaben (z. B. im „a“) bleiben, wie sie sind.
5. Geht beides nicht schön (wie bei **Tina**): Name darf aus Teilen bestehen – **jedes Teil hängt dann an einem eigenen Motiv**.
6. **Jede Verbindung ≥ 0,8 mm** (≈ 2 Drucklinien), Ziel ≥ 1,2 mm.
7. **Name berührt nie direkt den Ring** (mind. 2 mm Abstand) – Halt nur über die Motive.
8. **Motive diagonal gegenüber** – das Programm probiert **beide Diagonalen** (oben rechts/unten links und oben links/unten rechts) und nimmt die schönere. Motive wandern entlang des Rings, nie über den Ring hinaus. Größe nur im Notfall (max. +16 %).
8b. **Drehen:** Schneeflocken & Sterne ± 20°, Pfoten ± 35° (die zwei Pfoten bewusst unterschiedlich schräg), **Glanzsterne & Herzen nie**.
8c. Motive **berühren** den Ring, stecken aber nicht zu tief drin: der Ring darf **nicht durch das Innere** von Herzen, Pfoten oder Stern-Umriss laufen.
8d. Motive verdecken den Namen möglichst wenig.
9. **Name mittig nach Augenmaß**: Mitte aus Umriss + Schwerpunkt (Schnörkel zählen weniger), max. 80 × 36 mm.
10. Gedruckt wird **umgedreht** (Schauseite auf der Platte) → Export gespiegelt.

## Bekannte Grenzen / nächste Schritte
- Namen mit Leerzeichen („Oma & Opa“) haben mehr Teile als Motive → Programm meldet Fehler.
- Feinschliff der Motive Herzen, Glanzsterne, Sterne, Pfoten folgt nach dem Test mit Schneeflocken.
- Später optional: direkt an den Drucker senden.

## Testen (Entwickler)
Node-Test mit `ClipperLib`, `opentype`, `earcut` als Globals, dann `baueKugel({font, teileDaten, name, motiv})` aufrufen. Für Tests eine Schrift-Datei nur lokal verwenden (nicht committen).
