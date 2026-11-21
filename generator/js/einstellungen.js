// Alle Zahlen und Regeln des Generators an einer Stelle (Millimeter).
// Joels Regeln stehen in generator/README.md.

export const STANDARD = {
  hoehe: 5,              // Dicke der Kugel (in der App änderbar)
  minVerbindung: 0.8,    // jede Verbindung mindestens so breit (2 Drucklinien bei 0,4-mm-Düse)
  zielVerbindung: 1.2,   // so breit versuchen wir sie zu machen
  brueckePunkt: 1.0,     // Breite der Brücke zu i-Punkten / Umlaut-Punkten
  brueckeBuchstabe: 1.6, // Breite der Brücke zwischen Buchstaben (z. B. W -> i)
  maxBruecke: 2.5,       // längere Lücken zwischen Buchstaben werden nicht überbrückt (Teil hängt dann am Motiv)
  maxSchieben: 3,        // so weit darf ein abgesetzter Anfangs-/Endbuchstabe rangeschoben werden
  maxBeruehrung: 3.5,    // berühren sich zwei Buchstaben breiter, kleben sie aneinander -> nicht schieben
  abstandRing: 2.0,      // Name hält mindestens so viel Abstand zum Ring
  nameMaxBreite: 80,     // größte Namensbreite
  nameMaxHoehe: 36,      // größte Namenshöhe
  randAussen: 0.4,       // Motive bleiben so weit innerhalb der Außenkante
  glaetten: 0.25,        // kleine Ritzen < 0,5 mm werden geschlossen
  plattenGroesse: 256,   // Bambu Lab P1S
  plattenAbstand: 6,     // Abstand zwischen Kugeln auf der Platte
};

// Motive: welche Teile wo sitzen. winkel in Grad (0 = rechts, 90 = oben).
// haupt = berührt Ring UND Namen (hält den Namen), neben = nur Schmuck am Ring.
export const MOTIVE = {
  schneeflocken: { titel: 'Schneeflocken', teile: [
    { teil: 'schneeflocke', winkel: 45, haupt: true },
    { teil: 'schneeflocke', winkel: 225, haupt: true },
  ] },
  herzen: { titel: 'Herzen', teile: [
    { teil: 'herz-paar', winkel: 135, haupt: true },
    { teil: 'herz-paar', winkel: -45, haupt: true },
  ] },
  glanzsterne: { titel: 'Glanzsterne', teile: [
    { teil: 'glanz-gross', winkel: 135, haupt: true },
    { teil: 'glanz-gross', winkel: -45, haupt: true },
    { teil: 'glanz-klein', winkel: 50, haupt: false },
    { teil: 'glanz-klein', winkel: -130, haupt: false },
  ] },
  sterne: { titel: 'Sterne', teile: [
    { teil: 'stern-voll', winkel: 30, haupt: true },
    { teil: 'stern-voll', winkel: -150, haupt: true },
    { teil: 'stern-umriss', winkel: 125, haupt: false },
    { teil: 'stern-umriss', winkel: -70, haupt: false },
  ] },
  pfoten: { titel: 'Pfoten', teile: [
    { teil: 'pfote', winkel: 45, haupt: true },
    { teil: 'pfote', winkel: 225, haupt: true },
  ] },
};

// Suchbereich beim Platzieren der Motive
export const SUCHE = {
  winkel: 30,       // ± Grad entlang des Rings
  winkelSchritt: 3,
  drehung: 20,      // ± Grad Eigendrehung (leicht schräg stellen)
  drehSchritt: 5,
  nachInnen: 6,     // bis zu so viele mm vom Rand nach innen rücken
  innenSchritt: 0.75,
  groesser: [1, 1.08, 1.16], // nur im Notfall etwas größer
};
