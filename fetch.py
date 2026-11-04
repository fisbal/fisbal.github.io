#!/usr/bin/env python3
"""Fetch raw OpenStreetMap data (Overpass) for Sky Control 3D airports. Writes raw/<ICAO>.json.gz."""
import gzip, json, math, os, sys, time, urllib.request, urllib.parse

AP = {  # ICAO: (lat, lon) reference point (OurAirports)
 "KATL": (33.6367, -84.428101), "KLAX": (33.942501, -118.407997), "KORD": (41.9786, -87.9048),
 "KJFK": (40.639447, -73.779317), "KSFO": (37.619806, -122.374821), "KDEN": (39.860027, -104.673792),
 "KMIA": (25.796011, -80.289751), "EGLL": (51.470748, -0.459909), "LFPG": (49.00896, 2.554117),
 "EHAM": (52.308601, 4.76389), "EDDF": (50.026706, 8.55835), "LEMD": (40.493407, -3.572249),
 "LIRF": (41.804532, 12.251998), "LSZH": (47.458056, 8.548056)}
SERVERS = ["https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
           "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
R_AIR, R_ENV = 6000, 7500   # metres: aerodrome features / surroundings (roads, water)

def bbox(lat, lon, r):
    dl = r / 110540; dn = r / (111320 * math.cos(math.radians(lat)))
    return f"{lat-dl:.5f},{lon-dn:.5f},{lat+dl:.5f},{lon+dn:.5f}"

def queries(icao, lat, lon):
    A, E = bbox(lat, lon, R_AIR), bbox(lat, lon, R_ENV)
    head = "[out:json][timeout:900][maxsize:1073741824];"
    ad = f'wr["aeroway"="aerodrome"]["icao"="{icao}"]->.ad; .ad map_to_area->.a;'
    return [
      head + ad + f"""( .ad; way["aeroway"~"^(runway|taxiway|taxilane|apron|parking_position|helipad|control_tower|terminal|hangar)$"]({A}); rel["aeroway"~"^(apron|terminal)$"]({A}); node["aeroway"~"^(helipad|control_tower|parking_position)$"]({A}); ); out geom qt;""",
      head + ad + """( way["building"](area.a); rel["building"](area.a); nwr["amenity"="fire_station"](area.a); ); out geom qt;""",
      head + f"""way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link)$"]({E}); out geom qt;""",
      head + f"""( way["waterway"~"^(river|canal|stream|riverbank)$"]({E}); way["natural"~"^(water|coastline)$"]({E}); way["landuse"~"^(reservoir|basin)$"]({E}); ); out geom qt; rel["natural"="water"]({E}); out geom qt;"""]

def fetch(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for attempt in range(8):
        url = SERVERS[attempt % len(SERVERS)]
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "SkyControl3D-airport-builder/1.0 (github.com/fisbal)"})
            with urllib.request.urlopen(req, timeout=960) as r:
                body = r.read()
            j = json.loads(body)
            if j.get("remark") and "error" in j["remark"].lower(): raise RuntimeError(j["remark"])
            return body, url
        except Exception as e:
            last = e; print("  ", url, "failed:", str(e)[:200], flush=True); time.sleep(20 + 15 * attempt)
    raise RuntimeError(last)

os.makedirs("raw", exist_ok=True)
only = sys.argv[1:] or list(AP)
log = []
for icao in only:
    out = f"raw/{icao}.json.gz"
    if os.path.exists(out) and os.path.getsize(out) > 1000: print(icao, "already"); continue
    lat, lon = AP[icao]; t = time.time()
    try:
        els, url = [], ""
        for q in queries(icao, lat, lon):
            body, url = fetch(q); els += json.loads(body)["elements"]; time.sleep(5)
        body = json.dumps({"elements": els}).encode()
        with gzip.open(out, "wb") as f: f.write(body)
        n = len(els)
        msg = f"{icao} ok {n} elements {len(body)//1024} KB {time.time()-t:.0f}s via {url}"
    except Exception as e:
        msg = f"{icao} FAILED {e}"
    print(msg, flush=True); log.append(msg); time.sleep(10)
with open("raw/log.txt", "a") as f: f.write("\n".join(log) + "\n")
