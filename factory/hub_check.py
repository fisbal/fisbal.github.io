"""Checks that the MartinB OS Hub keeps itself up to date.

  1. The live site (https://fisbal.github.io) serves the same apps.json and index.html as the repo.
  2. Every factory app's release was built from the current code, logo and settings
     (its fingerprint matches) and holds the APK, the Windows installer and the Mac .dmg.
  3. Every link the hub shows (web, APK, Windows, Mac, code, Play) really downloads or opens.
  4. Apps that build in their own repo: their latest version and date (for the report).

Writes a table to the run summary and exits 1 if anything is wrong.
Run by .github/workflows/hub-check.yml after each factory run, after each site update and once a day.
"""
import hashlib
import importlib.util
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://fisbal.github.io"
FACTORY_REPO = "fisbal/fisbal.github.io"
TOKEN = os.environ.get("GH_TOKEN", "")

spec = importlib.util.spec_from_file_location("build", os.path.join(ROOT, "factory", "build.py"))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def get(url, api=False, rng=False, timeout=60):
    headers = {"User-Agent": "MartinB-hub-check", "Cache-Control": "no-cache"}
    if api:
        headers["Accept"] = "application/vnd.github+json"
        if TOKEN:
            headers["Authorization"] = "Bearer " + TOKEN
    if rng:
        headers["Range"] = "bytes=0-0"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def reachable(url):
    for attempt in range(3):
        try:
            status, _ = get(url, rng=True)
            if status in (200, 206):
                return True, str(status)
        except urllib.error.HTTPError as e:
            if e.code in (200, 206):
                return True, str(e.code)
            last = str(e.code)
        except Exception as e:  # network hiccup: retry
            last = type(e).__name__
        time.sleep(3)
    return False, last


problems, rows = [], []


def bad(msg):
    problems.append(msg)
    print("PROBLEM:", msg)


# ---------------------------------------------------------------- 1. live site
local_apps = json.load(open(os.path.join(ROOT, "apps.json"), encoding="utf-8"))
local_index = hashlib.sha256(open(os.path.join(ROOT, "index.html"), "rb").read()).hexdigest()
site_ok = False
for attempt in range(int(os.environ.get("SITE_TRIES", "20"))):  # GitHub Pages can take a few minutes after a push
    try:
        stamp = str(int(time.time()))
        _, live_apps = get(f"{SITE}/apps.json?check={stamp}")
        _, live_index = get(f"{SITE}/index.html?check={stamp}")
        if json.loads(live_apps) == local_apps and hashlib.sha256(live_index).hexdigest() == local_index:
            site_ok = True
            break
    except Exception as e:
        print("site not reachable yet:", e)
    time.sleep(30)
if not site_ok:
    bad("Le site en ligne ne montre pas la dernière version de apps.json / index.html (après 10 min).")
rows.append(("Site en ligne", "Hub", "à jour" if site_ok else "EN RETARD"))

# ---------------------------------------------------------------- 2. factory releases
parts = (build.tree_hash(os.path.join(build.FACTORY, "android")) + build.tree_hash(os.path.join(build.FACTORY, "electron"))
         + build.tree_hash_file(os.path.join(build.FACTORY, "build.py")))
template_hash = hashlib.sha256(parts.encode()).hexdigest()[:16]
release_assets = {}
for app in local_apps["apps"]:
    if not app.get("factory") or app.get("hold"):
        continue
    want = build.fingerprint(app, template_hash)
    try:
        _, body = get(f"https://api.github.com/repos/{FACTORY_REPO}/releases/tags/{app['id']}-latest", api=True)
        rel = json.loads(body)
    except Exception as e:
        bad(f"{app['name']} : pas de version publiée ({e}).")
        rows.append(("Version", app["name"], "ABSENTE"))
        continue
    names = {a["name"] for a in rel.get("assets", [])}
    release_assets[app["id"]] = names
    m = re.search(r"fingerprint: ([0-9a-f]+)", rel.get("body") or "")
    have = m.group(1) if m else ""
    missing = [f for f in (f"{app['file']}.apk", f"{app['file']}-Setup.exe", f"{app['file']}.dmg") if f not in names]
    date = max((a["updated_at"] for a in rel.get("assets", [])), default="?")[:16].replace("T", " ")
    if have != want:
        bad(f"{app['name']} : la version publiée ne correspond pas au code actuel (pas reconstruite).")
    if missing:
        bad(f"{app['name']} : fichiers manquants {missing}.")
    rows.append(("Version", app["name"], ("à jour" if have == want and not missing else "PAS À JOUR") + f" · {date} UTC"))

# ---------------------------------------------------------------- 3. every link the hub shows
def links(app):
    out = []
    web = app.get("web")
    if web:
        out.append(("Web", SITE + "/" if web == "/" else (SITE + "/w/" + app["id"] + "/" if web.startswith("/") else web)))
        if web.startswith("/") and web != "/":
            out.append(("Web (app)", SITE + web))
    if app.get("play"):
        out.append(("Play", app["play"]))
    if app.get("factory"):
        base = f"https://github.com/{FACTORY_REPO}/releases/download/{app['id']}-latest/{app['file']}"
        # Own desktop installers (app["win"] / app["mac"]) replace the factory ones, as in index.html.
        out += [("APK", base + ".apk"), ("Windows", app.get("win") or base + "-Setup.exe"), ("Mac", app.get("mac") or base + ".dmg")]
    else:
        for k, label in (("apk", "APK"), ("win", "Windows"), ("mac", "Mac")):
            if app.get(k):
                out.append((label, app[k]))
    if app.get("code"):
        out.append(("Code", app["code"]))
    return out


for app in local_apps["apps"]:
    results = []
    for label, url in links(app):
        if "play.google.com" in url:
            results.append(f"{label} ✓")  # Play blocks automated requests; listed only
            continue
        ok, why = reachable(url)
        results.append(f"{label} {'✓' if ok else '✗ ' + why}")
        if not ok:
            bad(f"{app['name']} : le lien {label} ne marche pas ({why}) → {url}")
    rows.append(("Liens", app["name"], " · ".join(results)))

# ---------------------------------------------------------------- 4. apps with their own pipeline
for app in local_apps["apps"]:
    repo = app.get("release")
    if app.get("factory") or not repo:
        continue
    try:
        _, body = get(f"https://api.github.com/repos/{repo}/releases?per_page=1", api=True)
        rel = json.loads(body)[0]
        rows.append(("Son propre dépôt", app["name"], f"{rel['tag_name']} · {rel['published_at'][:16].replace('T', ' ')} UTC"))
    except Exception as e:
        rows.append(("Son propre dépôt", app["name"], f"illisible ({type(e).__name__})"))

# ---------------------------------------------------------------- report
summary = ["## Vérification du MartinB OS Hub", "",
           ("✅ **Tout est à jour.**" if not problems else f"❌ **{len(problems)} problème(s)**"), "",
           "| Vérification | App | Résultat |", "|---|---|---|"]
summary += [f"| {a} | {b} | {c} |" for a, b, c in rows]
if problems:
    summary += ["", "### Problèmes", ""] + [f"- {p}" for p in problems]
text = "\n".join(summary) + "\n"
print(text)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
        f.write(text)
with open(os.path.join(ROOT, "hub-check-report.md"), "w", encoding="utf-8") as f:
    f.write(text)
sys.exit(1 if problems else 0)
