# Namenskugeln · Lohmarer Weihnachtsmarkt (MBG Lohmar)

Projekt von Joel. Er verkauft am Stand der MBG Lohmar auf dem **Lohmarer Familien- und Kunsthandwerker-Weihnachtsmarkt** (Sa. 05.12. 15:30–21:00, So. 06.12. 12:00–18:00, Kirchstraße, 53797 Lohmar) personalisierte, **3D-gedruckte Baumkugeln mit Namen**. Der gesamte Gewinn geht an eine Mädchenstation in Kenia.
Joel spricht Deutsch, ist kein Entwickler und möchte **kurze, einfache Antworten ohne Fachchinesisch**.

Das Repo enthält zwei Teile, die in **getrennten Claude-Code-Fenstern** bearbeitet werden:

| Teil | Status | Ordner |
|---|---|---|
| **1 · Bestell-App** (Kundenseite + Backoffice) | fertig, live | `index.html`, `admin.html`, `css/`, `js/`, `supabase/` |
| **2 · 3D-Generator** (fertige 3MF-Druckdateien aus Name + Motiv) | Prototyp (Schneeflocken im Test) | `generator/` – Regeln & Aufbau: `generator/README.md`, Plan: `docs/STUFE-2-3D-GENERATOR.md` |

**Wer am 3D-Generator arbeitet, ändert die Bestell-App nur minimal** (ein Knopf im Backoffice, siehe Plan) und bricht nichts am Bestellablauf.

## Teil 1 · Bestell-App (so funktioniert sie)
- Live: Kundenseite https://joelrxcreator.github.io/kugelwerk/ · Backoffice …/admin.html
- Ablauf Kunde: QR scannen → Name + Motiv (Herzen, Sterne, Glanzsterne, Schneeflocken, Pfoten) → „vormerken“ → an der Kasse bar/Karte zahlen → dort den **Kassen-QR-Code** (URL `?k=<4-stelliger Code>`) mit der Handykamera scannen → Abholnummer + Live-Status. Keine Konten.
- Backoffice (MacBook im Stand): Passwort-Login, Live-Warteschlange mit Ton, Kugeln für eine Druckplatte (1–4) auswählen → „Druck starten“ → „Fertig“ → „Abgeholt“. Einstellungen: Drucker, Druckzeiten, Preise, Motive, Bestellschluss, QR-Codes, Design hell/dunkel.
- Technik: reines HTML/CSS/JS, **kein Build-Schritt**. Daten in **Supabase** (Projekt `weihnachtskugeln`, ID `sygyfgdbelgfnzbcbwen`, Frankfurt). Alle Tabellen per RLS gesperrt; Zugriff **nur über `security definer`-Funktionen** (`public_info`, `create_order`, `get_orders`, `confirm_payment`, `admin_*` …). Kunden besitzen einen geheimen Token pro Bestellung; das Backoffice eine Sitzung (`admin_sessions`).
- Datenmodell: `orders` (Status unbezahlt → bezahlt → fertig → abgeholt; storniert/verfallen) · `items` (pos, **name**, **variant**, status wartet/druck/fertig, plate_id) · `plates` (Druckplatte: printer, minutes, status, **`file_url` – für Stufe 2 vorgesehen**) · `settings` (einzelne Zeile).
- Schema-Änderungen immer als neue Datei in `supabase/migrations/` **und** per Supabase-MCP anwenden. Nichts Bestehendes löschen.

## Regeln (wichtig)
- **Deploy:** GitHub Pages liefert den Branch **`gh-pages`** aus. Nach jeder Änderung: `git push origin main` **und** `git push origin main:gh-pages`. Bei geänderten CSS/JS die `?v=`-Nummer in `index.html` / `admin.html` hochzählen (Cache).
- **Vor dem Arbeiten `git pull`** – zwei Fenster arbeiten im selben Repo.
- **Das Repo ist öffentlich:** keine Passwörter, kein Kassen-Code, keine Schlüssel außer dem öffentlichen Supabase-„publishable key“ (`js/config.js`). Backoffice-Passwort und Kassen-Code kennt nur Joel.
- **Schrift der Kugeln: „Heartland Script“ (NREY, kommerziell, von Joel gekauft).** Im Repo liegt nur die Web-Teilmenge `fonts/kugelschrift.woff2`. Die Original-`.otf/.ttf` **niemals committen** (steht in `.gitignore`). Für den 3D-Generator lädt Joel die `.otf` lokal im Browser (bleibt auf seinem Mac).
- Design: wie der Flyer (`docs/referenz/flyer.webp`): Creme `#fffbf3`, Oliv `#4c4e34`, Beige `#e7c3a4`, Überschriften *Italiana*, Untertitel *Josefin Sans*, Logo `img/mbg-logo.svg` (aus dem Flyer vektorisiert). Kundenseite immer hell, Backoffice hell/dunkel. Mobile-first, Tap-Flächen ≥ 44 px, keine Emojis als Icons (Linien-Icons in `js/icons.js`).
- Bilder: nur echte Produktfotos (`docs/referenz/etsy-*.webp`) bzw. KI-Bilder **mit diesen Fotos als Referenz**. Higgsfield-Bilder: Produktfotos mit Nano Banana (bestes laut artificialanalysis.ai).
- Tests: Playwright (lokal mit gemockten RPCs, siehe Verlauf) und echter Durchlauf gegen die Live-Seite. Test-Sitzungen fürs Backoffice per SQL anlegen und danach löschen. Testdaten wieder aufräumen.

## Drucker & Zeiten
Bambu Lab **P1S**. Druckzeit pro Platte: 1 Kugel 19 Min., 4 Kugeln 57 Min. (dazwischen interpoliert, in den Einstellungen änderbar). Kapazität mit 1 Drucker ≈ 4 Kugeln/Stunde – evtl. leihen Freunde weitere Drucker.
