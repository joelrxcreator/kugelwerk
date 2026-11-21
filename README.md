# Kugelwerk 🎄

Bestell-App für personalisierte, 3D-gedruckte Baumkugeln auf dem Weihnachtsmarkt.

- **Kundenseite** (`index.html`): QR-Code scannen → Namen + Motiv wählen → an der Kasse bezahlen und den Kassen-Code scannen → Abholnummer + Live-Status (Warteschlange, im Druck, abholbereit). Keine Anmeldung nötig.
- **Backoffice** (`admin.html`): Live-Warteschlange mit Ton, Druckplatten zusammenstellen (1–4 Kugeln), Drucker-Status, Abholung, Einstellungen, QR-Codes als SVG/PNG.

## Technik
- Reines HTML/CSS/JS, kein Build-Schritt. Gehostet über **GitHub Pages**.
- Datenbank: **Supabase** (Projekt `weihnachtskugeln`, Region Frankfurt). Schema in `supabase/migrations/`.
- Alle Tabellen sind per Row-Level-Security gesperrt. Zugriff nur über geprüfte Datenbank-Funktionen:
  - Kunden sehen nur Bestellungen, deren geheimen Abholschlüssel ihr Browser besitzt.
  - Das Backoffice braucht eine Sitzung (Passwort-Login). Das Passwort steht **nicht** im Repo.
- Abholzeit wird automatisch geplant: Warteschlange in Platten zu max. 4 Kugeln, Druckzeiten pro Plattengröße, Anzahl Drucker, Puffer und manuelle Zusatzminuten.

## Stufe 2 (später)
Die Tabelle `plates` hat schon ein Feld `file_url` – hier kann später eine automatisch erzeugte 3MF/STL-Datei pro Druckplatte abgelegt werden.

## Schriften & Lizenzen
Pacifico (SIL Open Font License, `fonts/OFL.txt`), jsQR (Apache-2.0), qrcode-generator (MIT), Icons im Lucide-Stil (ISC).
