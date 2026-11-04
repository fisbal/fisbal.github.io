#!/usr/bin/env python3
"""Fallback fetcher: OSM main API (/api/0.6/map) in small tiles, merged into the same
Overpass-style JSON ("out geom") that convert.py reads. Writes raw/<ICAO>.json.gz."""
import gzip, json, math, os, sys, time, urllib.request
AP = {"KJFK": (40.639447, -73.779317), "KLAX": (33.942501, -118.407997),
      "LEMD": (40.493407, -3.572249), "LIRF": (41.804532, 12.251998)}
R_AIR, R_ENV = 6000, 7500

API = "https://api.openstreetmap.org/api/0.6/map.json?bbox={},{},{},{}"
UA = {"User-Agent": "SkyControl3D-airport-builder/1.0 (github.com/fisbal)"}
nodes, ways, rels = {}, {}, {}

def get(w, s, e, n, depth=0):
    url = API.format(f"{w:.5f}", f"{s:.5f}", f"{e:.5f}", f"{n:.5f}")
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                j = json.loads(r.read())
            for el in j["elements"]:
                {"node": nodes, "way": ways, "relation": rels}[el["type"]][el["id"]] = el
            time.sleep(1.5); return
        except urllib.error.HTTPError as ex:
            if ex.code == 400 and depth < 4:          # too many nodes: split in 4
                mx, my = (w + e) / 2, (s + n) / 2
                for b in ((w, s, mx, my), (mx, s, e, my), (w, my, mx, n), (mx, my, e, n)): get(*b, depth=depth + 1)
                return
            print("   ", ex.code, url, flush=True); time.sleep(10 + 10 * attempt)
        except Exception as ex:
            print("   ", str(ex)[:100], flush=True); time.sleep(10 + 10 * attempt)
    raise RuntimeError("tile failed " + url)

def bb(lat, lon, r):
    dl = r / 110540; dn = r / (111320 * math.cos(math.radians(lat)))
    return lon - dn, lat - dl, lon + dn, lat + dl

def inside(x, y, ring):
    c = False; j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi: c = not c
        j = i
    return c

def geom(w):
    g = [{"lat": nodes[i]["lat"], "lon": nodes[i]["lon"]} for i in w.get("nodes", []) if i in nodes]
    return g if len(g) == len(w.get("nodes", [])) else (g if len(g) >= 2 else None)

def run(icao):
    lat, lon = AP[icao]; nodes.clear(); ways.clear(); rels.clear(); t = time.time()
    W, S, E, N = bb(lat, lon, R_ENV); step = 0.03
    y = S
    while y < N:
        x = W
        while x < E:
            get(x, y, min(x + step, E), min(y + step, N)); x += step
        y += step
    print(icao, "tiles done", len(nodes), "nodes", len(ways), "ways", len(rels), "rels", f"{time.time()-t:.0f}s", flush=True)
    aw, ae, as_, an = bb(lat, lon, R_AIR)
    inA = lambda p: aw <= p["lon"] <= ae and as_ <= p["lat"] <= an
    AERO = {"runway", "taxiway", "taxilane", "apron", "parking_position", "helipad", "control_tower", "terminal", "hangar"}
    HW = {"motorway", "trunk", "primary", "secondary", "tertiary", "motorway_link", "trunk_link"}
    out = []
    # aerodrome boundary (for buildings filter)
    rings = []
    for coll, typ in ((ways, "way"), (rels, "relation")):
        for el in coll.values():
            t_ = el.get("tags", {})
            if t_.get("aeroway") == "aerodrome" and t_.get("icao") == icao:
                if typ == "way":
                    g = geom(el)
                    if g: rings.append([(p["lon"], p["lat"]) for p in g]); out.append(dict(el, geometry=g))
                else:
                    mem = []
                    for m in el.get("members", []):
                        mm = dict(m)
                        if m["type"] == "way" and m["ref"] in ways:
                            g = geom(ways[m["ref"]])
                            if g:
                                mm["geometry"] = g
                                if m.get("role") == "outer": rings.append([(p["lon"], p["lat"]) for p in g])
                        mem.append(mm)
                    out.append(dict(el, members=mem))
    # join open outer segments of a relation boundary into rings
    if rings and any(r[0] != r[-1] for r in rings):
        segs = [list(r) for r in rings]; joined = []
        while segs:
            cur = segs.pop(0)
            changed = True
            while cur[0] != cur[-1] and changed:
                changed = False
                for k, sg in enumerate(segs):
                    if sg[0] == cur[-1]: cur += sg[1:]
                    elif sg[-1] == cur[-1]: cur += sg[::-1][1:]
                    elif sg[-1] == cur[0]: cur = sg[:-1] + cur
                    elif sg[0] == cur[0]: cur = sg[::-1][:-1] + cur
                    else: continue
                    segs.pop(k); changed = True; break
            joined.append(cur)
        rings = joined
    in_ad = lambda g: any(inside(sum(p["lon"] for p in g) / len(g), sum(p["lat"] for p in g) / len(g), r) for r in rings) if rings else inA(g[0])
    for el in nodes.values():
        t_ = el.get("tags")
        if not t_: continue
        if (t_.get("aeroway") in ("helipad", "control_tower", "parking_position") and inA(el)) or \
           (t_.get("amenity") == "fire_station" and in_ad([el])):
            out.append(el)
    for el in ways.values():
        t_ = el.get("tags")
        if not t_: continue
        g = None
        a = t_.get("aeroway")
        keep = False
        if a in AERO:
            g = geom(el); keep = bool(g) and any(inA(p) for p in g)
        if not keep and (t_.get("building") or t_.get("amenity") == "fire_station"):
            g = geom(el); keep = bool(g) and in_ad(g)
        if not keep and (t_.get("highway") in HW or t_.get("waterway") in ("river", "canal", "stream", "riverbank")
                         or t_.get("natural") in ("water", "coastline") or t_.get("landuse") in ("reservoir", "basin")):
            g = geom(el); keep = bool(g)
        if keep and a != "aerodrome": out.append(dict(el, geometry=g))
    for el in rels.values():
        t_ = el.get("tags", {})
        if t_.get("aeroway") == "aerodrome": continue
        want = t_.get("aeroway") in ("apron", "terminal") or t_.get("natural") == "water" or t_.get("building")
        if not want: continue
        mem = []
        for m in el.get("members", []):
            mm = dict(m)
            if m["type"] == "way" and m["ref"] in ways:
                g = geom(ways[m["ref"]])
                if g: mm["geometry"] = g
            mem.append(mm)
        gs = [p for m in mem for p in m.get("geometry", [])]
        if not gs: continue
        if t_.get("building") and not in_ad(gs): continue
        out.append(dict(el, members=mem))
    body = json.dumps({"elements": out}).encode()
    with gzip.open(f"raw/{icao}.json.gz", "wb") as f: f.write(body)
    return f"{icao} ok {len(out)} elements {len(body)//1024} KB {time.time()-t:.0f}s via OSM API, boundary rings {len(rings)}"

os.makedirs("raw", exist_ok=True)
for icao in sys.argv[1:]:
    try: msg = run(icao)
    except Exception as e: msg = f"{icao} FAILED {e}"
    print(msg, flush=True); open("raw/log.txt", "a").write(msg + "\n")
