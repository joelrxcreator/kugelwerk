// Alle Zahlen und Regeln des Generators an einer Stelle (Millimeter).
// Joels Regeln stehen in generator/README.md.

export const STANDARD = {
  hoehe: 5,              // Dicke der Kugel (in der App änderbar)
  minVerbindung: 0.8,    // jede Verbindung mindestens so breit (2 Drucklinien bei 0,4-mm-Düse)
  zielVerbindung: 1.2,   // so breit versuchen wir sie zu machen
  brueckePunkt: 1.0,     // Breite der Brücke zu i-Punkten / Umlaut-Punkten
  brueckeBuchstabe: 1.6, // Breite der Brücke zwischen Buchstaben (z. B. W -> i)
  kleineLuecke: 1.5,     // so kleine Lücken (T-/F-Balken, J -> ü) werden direkt an der engsten Stelle überbrückt
  maxBruecke: 4.5,       // (alt, nicht mehr genutzt)
  maxSchwung: 22,        // Schreibschrift-Bogen höchstens so lang (waagerecht) – V -> i, W -> i, Y -> u
  grundlinie: 0.4,       // „unten“ = unteres 40 % des Namens
  ohneVerbindungNach: ['T', 'F'], // nach diesen Buchstaben nie Brücke/Schieben (Teil hängt am Motiv)
  maxSchieben: 3,        // so weit darf ein abgesetzter Anfangs-/Endbuchstabe rangeschoben werden
  maxBeruehrung: 3.5,    // berühren sich zwei Buchstaben breiter, kleben sie aneinander -> nicht schieben
  abstandRing: 2.0,      // Name hält mindestens so viel Abstand zum Ring
  nameMaxBreite: 80,     // größte Namensbreite
  nameMaxHoehe: 36,      // größte Namenshöhe (gesamt)
  nameMaxKern: 30,       // Großbuchstaben-Höhe darf bis hierhin gehen, auch wenn f/J/y weit hinausragen (z. B. „Elif“)
  nameMinHoehe: 12,      // Großbuchstaben kleiner als das -> Hinweis „langer Name“
  randAussen: 0.4,       // Motive bleiben so weit innerhalb der Außenkante
  glaetten: 0,           // Ritzen schließen: aus (Joel will keine Extra-Striche, z. B. im „a“)
  strafeGroesse: 60,     // Bewertung: 10 % Größenänderung kostet so viel wie 6 mm nach innen rücken
  bonusTeileVerbinden: 10, // Bonus, wenn ein Motiv getrennte Namensteile verbindet (T + „im“ bei „Tim“)
  plattenGroesse: 256,   // Bambu Lab P1S
  plattenAbstand: 6,     // Abstand zwischen Kugeln auf der Platte
};

// Motive: welche Teile wo sitzen. winkel in Grad (0 = rechts, 90 = oben).
// haupt = berührt Ring UND Namen (hält den Namen), neben = nur Schmuck am Ring.
// drehen = wie weit ein Teil schräg gestellt werden darf (Glanzsterne & Herzen nie).
// drehZiel = bevorzugte Schräglage (Pfoten zeigen schöner leicht unterschiedlich).
// innenFrei = der Ring darf nicht durch das Innere des Motivs laufen (Herzen, Pfoten, Stern-Umriss).
// spiegeln = Aufschlag für die andere Diagonale (Herzen passen meist besser oben links / unten rechts).
// Das Programm probiert beide Diagonalen (unten links/oben rechts und oben links/unten rechts) und nimmt die schönere.
export const MOTIVE = {
  schneeflocken: { titel: 'Schneeflocken', drehen: 20, teile: [
    { teil: 'schneeflocke', winkel: 45, haupt: true },
    { teil: 'schneeflocke', winkel: 225, haupt: true },
  ] },
  herzen: { titel: 'Herzen', drehen: 0, innenFrei: true, spiegeln: 10, teile: [
    { teil: 'herz-paar', winkel: 135, haupt: true },
    { teil: 'herz-paar', winkel: -45, haupt: true },
  ] },
  glanzsterne: { titel: 'Glanzsterne', drehen: 0, teile: [
    { teil: 'glanz-gross', winkel: 135, haupt: true },
    { teil: 'glanz-gross', winkel: -45, haupt: true },
    { teil: 'glanz-klein', winkel: 50, haupt: false },
    { teil: 'glanz-klein', winkel: -130, haupt: false },
  ] },
  sterne: { titel: 'Sterne', drehen: 20, innenFrei: true, teile: [
    { teil: 'stern-voll', winkel: 30, haupt: true },
    { teil: 'stern-voll', winkel: -150, haupt: true },
    { teil: 'stern-umriss', winkel: 125, haupt: false },
    { teil: 'stern-umriss', winkel: -70, haupt: false },
  ] },
  pfoten: { titel: 'Pfoten', drehen: 35, innenFrei: true, teile: [
    { teil: 'pfote', winkel: 45, haupt: true, drehZiel: -18 },
    { teil: 'pfote', winkel: 225, haupt: true, drehZiel: 15 },
  ] },
};

// Suchbereich beim Platzieren der Motive
export const SUCHE = {
  winkel: 30,       // ± Grad entlang des Rings
  winkelSchritt: 3,
  drehSchritt: 5,   // Eigendrehung in diesen Schritten (Grenze je Motiv: MOTIVE.*.drehen)
  nachInnen: 8,     // bis zu so viele mm vom Rand nach innen rücken
  innenSchritt: 1,
  groesser: [1, 1.1],          // passt gar nichts: Notfall bis +10 %
  feinGroesse: [0.92, 0.96, 1.04, 1.08], // Feinschliff: Motiv bis ± 10 % kleiner/größer, wenn es schöner passt
};
