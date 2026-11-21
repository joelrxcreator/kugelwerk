# Stufe 2 · 3D-Generator (Plan)

**Ziel:** Joel klickt im Backoffice bei einer Druckplatte auf **„3MF herunterladen“** und bekommt eine fertige Datei mit allen Kugeln dieser Platte (Name in Heartland Script + gewähltes Motiv), richtig angeordnet. Er öffnet sie in **Bambu Studio** und startet den Druck. Kein Abtippen mehr, keine Tippfehler.

## Entscheidungen (mit Joel abgestimmt)
- **Läuft komplett im Browser des Backoffice** (MacBook) – kein Server, kein Zusatzprogramm.
- **Schrift:** Joel wählt die gekaufte `Heartland Script.otf` einmal per Datei-Auswahl; sie wird nur **lokal** im Browser gespeichert (IndexedDB). Nie ins Repo, nie hochladen.
- **Vorlagen:** pro Motiv eine Datei **ohne Namen** (Ring + Öse + Motiv), von Joel geliefert (STL oder sein Bambu-Projekt „Vorlage.3mf“ mit 5 Platten: Schneeflocken, Pfoten, Glanzsterne, Sterne (5-zackig), Herzen – siehe `docs/referenz/vorlagen-bambu.webp`). Ablage: `generator/vorlagen/<variant>.stl` (Schlüssel wie in der App: `herzen`, `sterne`, `glanzsterne`, `schneeflocken`, `pfoten`).
- **Direkt an den Drucker senden** (P1S, LAN-/Entwicklermodus) ist **später** ein Bonus – erst wenn alles andere sicher läuft.

## Regeln von Joel (aus seiner Handarbeit, 21.11.)
Drucker: P1S, Düse 0,4 mm, Schichthöhe 0,2 mm. **Alles vollautomatisch** – Joel will direkt die fertige Datei; Verbesserungen laufen über Feedback → besserer Code.
1. **Alles hängt zusammen**, keine losen Teile. i-Punkte, T-Balken, abgesetzte Anfangsbuchstaben (P, W) bekommen automatisch eine **Brücke** oder der Buchstabe wird näher rangeschoben (wie bei „Paul“).
2. **Jede Verbindung ≥ 0,8 mm** breit (absolutes Minimum 0,5 mm ≈ 2 Drucklinien). Gilt für Buchstabe↔Buchstabe, Name↔Motiv, Motiv↔Ring.
3. **Name berührt nie direkt den Ring** – immer nur über die Motive.
4. Ausnahme (wie „Tina“): Name darf in Teile zerfallen, wenn **jedes Teil über ein Motiv** am Ring hängt.
5. **Motive diagonal gegenüber**, nie über den Ring hinaus, berühren den Namen an ≥ 1 Stelle (mehr ist besser). Größe nur im Notfall ändern.
6. **Name mittig nach Augenmaß** (Schnörkel vor dem ersten Buchstaben zählen weniger), nicht zu groß/klein.
7. **Höhe 5 mm** (einstellbar), alles gleich hoch → Arbeiten in **2D**, erst am Ende extrudieren.
8. Gedruckt wird **umgedreht** (Schauseite auf der Platte) → im Export spiegeln.
9. Brücken sollen schön aussehen: weich, keine Knicke; beim i-Punkt dünn (Punkt muss erkennbar bleiben).
Referenz-Screenshots (Canva + Bambu Studio) hat Joel im Chat geschickt (nicht im Repo).

## Benötigte Dateien von Joel (als SVG, sonst STL)
- `ring` (Ring + Öse, ohne Motiv/Name)
- je Motiv **ein einzelnes Element**: Herz-Paar, Schneeflocke, Glanzstern(e), Stern, Pfote – in Original-Größe
- je Motiv eine fertige Beispielkugel (3MF) für Positionen und Namensgröße

## Technischer Weg (Vorschlag)
1. Schrift lesen: **opentype.js** → Umrisse des Namens als Pfade (Kerning/Ligaturen der Schrift beachten, damit die Buchstaben verbunden bleiben).
2. Name skalieren: auf eine Ziel-Breite innerhalb des Rings einpassen; Höhe/Position je Motiv konfigurierbar, sodass der Name **links und rechts den Ring berührt** (wie auf den Produktfotos) und mit Motiven verschmilzt.
3. 2D → 3D: Pfade extrudieren (Dicke wie Vorlage) und mit der Vorlage **vereinigen** – z. B. **manifold-3d** (WASM, robuste Boolesche Operationen) oder three.js + Manifold. Ergebnis muss **ein** wasserdichtes Teil sein.
4. Platte zusammenstellen: bis zu 4 (bzw. „Max. Kugeln pro Platte“ aus den Einstellungen) Kugeln mit Abstand auf der P1S-Platte (256 × 256 mm) anordnen.
5. Export als **3MF** (ZIP mit `3D/3dmodel.model`, mehrere Objekte, Objektnamen = „#07 Emma“), damit Bambu Studio sie getrennt anzeigt. Optional zusätzlich einzelne STL.
6. Einbau ins Backoffice: kleiner Knopf auf jeder Druckplatten-Karte (`js/admin.js`, Funktion `plateHtml`) und in der Warteschlange für die aktuelle Auswahl. Generator-Code in **eigenem Ordner `generator/`** (z. B. `generator/generator.js`), damit die Bestell-App sauber getrennt bleibt. Bibliotheken fest im Ordner `vendor/` mitliefern (kein CDN).
7. Optional: erzeugte Datei-URL in `plates.file_url` speichern (Spalte existiert schon).

## Vorgehen
1. Von Joel holen: die 5 Vorlagen ohne Namen, Maße (Dicke der Kugel, Höhe des Namens, Abstand/Überlappung zum Ring), die `.otf` (lokal).
2. **Prototyp mit einem Motiv** (z. B. Herzen + „Emma“) → Joel druckt ihn und vergleicht mit seiner Hand-Version → Parameter anpassen.
3. Alle 5 Motive, schwierige Namen testen (lang: „Maximilian“, kurz: „Bo“, Umlaute „Jürgen“, „Oma & Opa“, Bindestrich).
4. Platten-Anordnung + 3MF-Export, Test in Bambu Studio (öffnet ohne Fehler, ein Teil pro Kugel, nicht schwebend).
5. Knopf im Backoffice, Live-Test, deployen (main + gh-pages).
