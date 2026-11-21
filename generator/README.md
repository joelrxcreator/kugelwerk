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
2. **i-Punkte / Umlaut-Punkte**: dünne Brücke (1,0 mm) schräg nach unten in den eigenen Buchstaben (Punkt soll erkennbar bleiben).
3. **Abgesetzter Anfangs-/Endbuchstabe** (P bei Paul, J bei Johannes): ranschieben, bis er punktuell berührt (≥ 1,2 mm) – nicht der ganzen Länge nach ankleben.
4. **Kleine Lücken in Buchstaben** (T-Balken, F-Balken, Bindestrich): Brücke 1,6 mm.
5. Geht beides nicht schön (wie bei **Tina**): Name darf aus Teilen bestehen – **jedes Teil hängt dann an einem eigenen Motiv**.
6. **Jede Verbindung ≥ 0,8 mm** (≈ 2 Drucklinien), Ziel ≥ 1,2 mm.
7. **Name berührt nie direkt den Ring** (mind. 2 mm Abstand) – Halt nur über die Motive.
8. **Motive diagonal gegenüber**, dürfen entlang des Rings wandern und **leicht gedreht** werden (± 20°), nie über den Ring hinaus. Größe nur im Notfall (max. +16 %).
9. **Name mittig nach Augenmaß**: Mitte aus Umriss + Schwerpunkt (Schnörkel zählen weniger), max. 80 × 36 mm.
10. Gedruckt wird **umgedreht** (Schauseite auf der Platte) → Export gespiegelt.

## Bekannte Grenzen / nächste Schritte
- Namen mit Leerzeichen („Oma & Opa“) haben mehr Teile als Motive → Programm meldet Fehler.
- Feinschliff der Motive Herzen, Glanzsterne, Sterne, Pfoten folgt nach dem Test mit Schneeflocken.
- Später optional: direkt an den Drucker senden.

## Testen (Entwickler)
Node-Test mit `ClipperLib`, `opentype`, `earcut` als Globals, dann `baueKugel({font, teileDaten, name, motiv})` aufrufen. Für Tests eine Schrift-Datei nur lokal verwenden (nicht committen).
