"""
Liest Joels STL-Teile (Ring, Motive) und speichert ihre flachen Umrisse
als generator/vorlagen/teile.json (Millimeter, y nach oben).

Aufruf:  python3 stl_zu_teile.py <ordner-mit-stls> <ausgabe.json>
Benötigt: pip install trimesh shapely scipy networkx

Die Zuordnung Dateiname -> Teil steht unten in TEILE. Neue Teile dort ergänzen.
Ring: wird so verschoben, dass der Kreismittelpunkt bei (0,0) liegt.
Motive: werden auf die Mitte ihres Umrisses (Bounding-Box) zentriert.
"""
import json
import sys
from pathlib import Path

import numpy as np
import trimesh

TEILE = {
    'ring':         'Weihnachtskugel.stl.stl',
    'herz-paar':    'Zusammenbau.stl',
    'pfote':        'WKugeln (12)_5.stl',
    'stern-voll':   'WKugeln (7)_2.stl',
    'stern-umriss': 'WKugeln (5)_0.stl',
    'glanz-gross':  'WKugeln_0.stl',
    'glanz-klein':  'WKugeln_0(1).stl',
    'schneeflocke': 'schneeflocke.stl',
}


def umriss(datei):
    mesh = trimesh.load(datei)
    hoehe = float(mesh.bounds[1][2] - mesh.bounds[0][2])
    schnitt = mesh.section(plane_origin=[0, 0, mesh.bounds[0][2] + hoehe / 2], plane_normal=[0, 0, 1])
    polys = schnitt.to_2D(to_2D=np.eye(4))[0].polygons_full
    return polys, hoehe


def ring_runden(p):
    return [[round(x, 3), round(y, 3)] for x, y in list(p.coords)[:-1]]


def main(ordner, ausgabe):
    ordner = Path(ordner)
    teile = {}
    for name, datei in TEILE.items():
        pfad = ordner / datei
        if not pfad.exists():
            print('fehlt:', datei)
            continue
        polys, hoehe = umriss(pfad)
        minx = min(p.bounds[0] for p in polys); maxx = max(p.bounds[2] for p in polys)
        miny = min(p.bounds[1] for p in polys); maxy = max(p.bounds[3] for p in polys)
        info = {}
        if name == 'ring':
            # größtes Loch = Innenkreis der Kugel
            loch = max(polys[0].interiors, key=lambda i: abs(np.ptp(np.array(i.coords)[:, 0])))
            c = np.array(loch.coords)
            cx, cy = (c[:, 0].min() + c[:, 0].max()) / 2, (c[:, 1].min() + c[:, 1].max()) / 2
            info['innenRadius'] = round(float(np.ptp(c[:, 0]) / 2), 3)
            # Außenkreis: Abstand vom Mittelpunkt nach unten
            info['aussenRadius'] = round(float(cy - miny), 3)
        else:
            cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
        flaechen = []
        for p in polys:
            p = p.simplify(0.01)
            aussen = [[x - cx, y - cy] for x, y in ring_runden(p.exterior)]
            loecher = [[[x - cx, y - cy] for x, y in ring_runden(i)] for i in p.interiors]
            flaechen.append({'aussen': [[round(x, 3), round(y, 3)] for x, y in aussen],
                             'loecher': [[[round(x, 3), round(y, 3)] for x, y in l] for l in loecher]})
        teile[name] = {'datei': datei, 'hoeheOriginal': round(hoehe, 2),
                       'breite': round(maxx - minx, 2), 'hoehe': round(maxy - miny, 2),
                       'flaechen': flaechen, **info}
        print(f'{name:13s} {maxx-minx:6.2f} x {maxy-miny:6.2f} mm  Flächen: {len(flaechen)}')
    Path(ausgabe).write_text(json.dumps(teile, separators=(',', ':')))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
