#!/usr/bin/env python3
"""MartinB app factory.

  build.py plan                     -> JSON list of app ids to (re)build, written to $GITHUB_OUTPUT as "apps"
  build.py source  <id> <out>       -> app files in <out>/www, config, icons (needs git, network, node for build steps)
  build.py android <id> <src> <dir> -> ready-to-build Android project in <dir>, gradle -P args in <dir>/gradle.args
  build.py electron <id> <src> <dir>-> ready-to-build Windows / Mac (Electron) project in <dir>

Everything is driven by apps.json at the repo root. App files are never edited, except that
<script src="https://cdn..."> libraries are copied next to the app so the APK and EXE work offline.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACTORY = os.path.join(ROOT, "factory")
RUN = int(os.environ.get("GITHUB_RUN_NUMBER", "1"))


def load_apps():
    with open(os.path.join(ROOT, "apps.json"), encoding="utf-8") as f:
        return [a for a in json.load(f)["apps"] if a.get("factory")]


def app_by_id(app_id):
    for a in load_apps():
        if a["id"] == app_id:
            return a
    sys.exit(f"Unknown app id: {app_id}")


def sh(cmd, cwd=None):
    print("+", cmd, flush=True)
    subprocess.run(cmd, shell=True, check=True, cwd=cwd)


# ---------------------------------------------------------------- plan

def tree_hash(path):
    h = hashlib.sha256()
    for base, dirs, files in sorted(os.walk(path)):
        dirs.sort()
        for name in sorted(files):
            p = os.path.join(base, name)
            h.update(os.path.relpath(p, path).encode())
            with open(p, "rb") as f:
                h.update(f.read())
    return h.hexdigest()


def fingerprint(app, template_hash):
    src = app["source"]
    if "repo" in src:
        out = subprocess.run(["git", "ls-remote", f"https://github.com/{src['repo']}", "HEAD"],
                             capture_output=True, text=True, check=True).stdout.split()
        part = "repo:" + (out[0] if out else "?")
    elif "local" in src:
        part = "local:" + tree_hash(os.path.join(ROOT, src["local"]))
    else:
        part = "url:" + src["url"]
    icons = "".join(tree_hash_file(os.path.join(ROOT, app[k])) for k in ("icon", "maskable") if app.get(k))
    blob = json.dumps(app, sort_keys=True) + part + template_hash + icons
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def tree_hash_file(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def current_fingerprint(app_id):
    """Fingerprint recorded in the body of the app's rolling release, or '' if none."""
    try:
        out = subprocess.run(["gh", "release", "view", f"{app_id}-latest", "--json", "body,assets", "-q", "."],
                             capture_output=True, text=True, check=True).stdout
        data = json.loads(out)
        if len(data.get("assets", [])) < 2:
            return ""  # a previous build only half finished: rebuild
        m = re.search(r"fingerprint: ([0-9a-f]+)", data.get("body", ""))
        return m.group(1) if m else ""
    except Exception:
        return ""


def cmd_plan():
    force = os.environ.get("FORCE", "false") == "true"
    only = os.environ.get("ONLY", "").strip()
    parts = tree_hash(os.path.join(FACTORY, "android")) + tree_hash(os.path.join(FACTORY, "electron")) + tree_hash_file(os.path.join(FACTORY, "build.py"))
    template_hash = hashlib.sha256(parts.encode()).hexdigest()[:16]
    todo, prints = [], {}
    for app in load_apps():
        if only and app["id"] != only:
            continue
        if app.get("hold"):
            print(f"{app['id']}: on hold ({app['hold']})")
            continue
        fp = fingerprint(app, template_hash)
        prints[app["id"]] = fp
        if force or only or current_fingerprint(app["id"]) != fp:
            todo.append(app["id"])
    print("Fingerprints:", json.dumps(prints, indent=1))
    print("To build:", todo)
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a") as f:
            f.write("apps=" + json.dumps(todo) + "\n")
            f.write("prints=" + json.dumps(prints) + "\n")


# ---------------------------------------------------------------- source

CDN = re.compile(r'(<script[^>]*\bsrc=")(https://(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)/[^"]+)(")', re.I)


def vendor_scripts(www):
    """Copy CDN scripts next to the app and point the pages at the local copy, so the app works offline."""
    cache = {}
    for base, _, files in os.walk(www):
        for name in files:
            if not name.lower().endswith((".html", ".htm")):
                continue
            path = os.path.join(base, name)
            with open(path, encoding="utf-8", errors="surrogateescape") as f:
                html = f.read()

            def repl(m):
                url = m.group(2)
                if url not in cache:
                    fname = hashlib.sha1(url.encode()).hexdigest()[:8] + "-" + os.path.basename(url.split("?")[0])
                    dest = os.path.join(www, "_vendor", fname)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    try:
                        req = urllib.request.Request(url, headers={"User-Agent": "MartinB-factory"})
                        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as out:
                            out.write(r.read())
                        cache[url] = fname
                        print("  vendored", url)
                    except Exception as e:
                        print("  could not vendor", url, e)
                        cache[url] = None
                if not cache[url]:
                    return m.group(0)
                rel = os.path.relpath(os.path.join(www, "_vendor", cache[url]), base).replace(os.sep, "/")
                return m.group(1) + rel + m.group(3)

            new = CDN.sub(repl, html)
            if new != html:
                with open(path, "w", encoding="utf-8", errors="surrogateescape") as f:
                    f.write(new)


def cmd_source(app_id, out):
    app = app_by_id(app_id)
    src = app["source"]
    www = os.path.join(out, "www")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(www)
    meta = {"id": app["id"], "name": app["name"], "file": app["file"], "pkg": app["pkg"], "desc": app.get("desc", "")}
    cfg = {"name": app["name"], "entry": app.get("entry", "index.html"), "bg": app.get("bg", "#0B0A08")}
    cfg.update({k: v for k, v in app.get("android", {}).items() if k in ("immersive", "keepScreenOn")})

    if "url" in src:
        cfg["url"] = src["url"]
        with open(os.path.join(www, "README.txt"), "w") as f:
            f.write("This app opens " + src["url"] + "\n")
    else:
        if "repo" in src:
            repo_dir = os.path.join(out, "_repo")
            sh(f"git clone -q --depth 1 https://github.com/{src['repo']} {repo_dir}")
            if src.get("build"):
                sh(src["build"], cwd=repo_dir)
            base = os.path.join(repo_dir, src.get("path", ""))
        else:
            repo_dir = None
            base = os.path.join(ROOT, src["local"])
        skip = set(src.get("exclude", [])) | {".git", ".github", "node_modules", ".gitignore", ".gitattributes"}
        for name in os.listdir(base):
            if name in skip:
                continue
            s, d = os.path.join(base, name), os.path.join(www, name)
            (shutil.copytree if os.path.isdir(s) else shutil.copy2)(s, d)
        if not os.path.exists(os.path.join(www, cfg["entry"])):
            sys.exit(f"{app_id}: entry page {cfg['entry']} not found in the app files")
        vendor_scripts(www)

        android = app.get("android", {})
        if repo_dir and android.get("res"):
            shutil.copytree(os.path.join(repo_dir, android["res"]), os.path.join(out, "android-res"))
            meta["androidRes"] = True
        if repo_dir and android.get("keystore"):
            ks = android["keystore"]
            shutil.copy2(os.path.join(repo_dir, ks["file"]), os.path.join(out, "keystore.jks"))
            meta["keystore"] = {"pass": ks["pass"], "alias": ks["alias"]}
        if repo_dir:
            shutil.rmtree(repo_dir, ignore_errors=True)

    meta["orientation"] = app.get("android", {}).get("orientation", "unspecified")
    shutil.copy2(os.path.join(ROOT, app["icon"]), os.path.join(out, "icon.png"))
    if app.get("maskable"):
        shutil.copy2(os.path.join(ROOT, app["maskable"]), os.path.join(out, "maskable.png"))
    with open(os.path.join(out, "mb-config.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    with open(os.path.join(out, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"{app_id}: source ready in {out}")


# ---------------------------------------------------------------- android

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def make_mipmaps(src, res, bg_hex, crest=False):
    from PIL import Image, ImageDraw
    icon = Image.open(os.path.join(src, "icon.png")).convert("RGBA")
    mask_path = os.path.join(src, "maskable.png")
    maskable = Image.open(mask_path).convert("RGBA") if os.path.exists(mask_path) else None
    bg = tuple(int(bg_hex.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    for d, k in DENSITIES.items():
        folder = os.path.join(res, "mipmap-" + d)
        os.makedirs(folder, exist_ok=True)
        legacy = round(48 * k)
        full = round(108 * k)
        # Legacy launcher icon: the logo with rounded corners; round icon: circle crop.
        im = icon.resize((legacy, legacy), Image.LANCZOS)
        rmask = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(rmask).rounded_rectangle([0, 0, legacy - 1, legacy - 1], radius=legacy // 5, fill=255)
        sq = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        sq.paste(im, (0, 0), Image.composite(im.split()[3], Image.new("L", im.size, 0), rmask))
        sq.save(os.path.join(folder, "ic_launcher.png"))
        cmask = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(cmask).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
        rd = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        rd.paste(im, (0, 0), Image.composite(im.split()[3], Image.new("L", im.size, 0), cmask))
        rd.save(os.path.join(folder, "ic_launcher_round.png"))
        # Adaptive icon layers (Android 8+): full-bleed maskable art, or the logo inside the safe zone.
        if maskable is not None:
            fg = maskable.resize((full, full), Image.LANCZOS)
            back = Image.new("RGBA", (full, full), fg.getpixel((2, 2))[:3] + (255,))
        else:
            fg = Image.new("RGBA", (full, full), (0, 0, 0, 0))
            inner = round(full * (0.72 if crest else 0.64))
            small = icon.resize((inner, inner), Image.LANCZOS)
            if crest:
                # Round crest logos: keep the disc (ring + studs), drop the square backdrop so no corners show.
                disc = Image.new("L", (inner, inner), 0)
                pad = round(inner * 0.045)
                ImageDraw.Draw(disc).ellipse([pad, pad, inner - 1 - pad, inner - 1 - pad], fill=255)
                small.putalpha(Image.composite(small.split()[3], Image.new("L", small.size, 0), disc))
            fg.paste(small, ((full - inner) // 2,) * 2, small)
            back = Image.new("RGBA", (full, full), bg)
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"))
        back.save(os.path.join(folder, "ic_launcher_background.png"))
    any_dir = os.path.join(res, "mipmap-anydpi-v26")
    os.makedirs(any_dir, exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '  <background android:drawable="@mipmap/ic_launcher_background"/>\n'
           '  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n')
    for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(any_dir, n), "w") as f:
            f.write(xml)


def cmd_android(app_id, src, work):
    app = app_by_id(app_id)
    with open(os.path.join(src, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    shutil.rmtree(work, ignore_errors=True)
    shutil.copytree(os.path.join(FACTORY, "android"), work)
    main = os.path.join(work, "app", "src", "main")
    shutil.copytree(os.path.join(src, "www"), os.path.join(main, "assets", "www"))
    shutil.copy2(os.path.join(src, "mb-config.json"), os.path.join(main, "assets", "mb-config.json"))
    res = os.path.join(main, "res")
    if meta.get("androidRes"):
        for name in os.listdir(os.path.join(src, "android-res")):
            if name.startswith("mipmap"):
                shutil.copytree(os.path.join(src, "android-res", name), os.path.join(res, name), dirs_exist_ok=True)
    else:
        make_mipmaps(src, res, app.get("iconBg", app.get("bg", "#0B0A08")), crest="iconBg" in app)
    # The app name goes into strings.xml (XML-escaped: "Alpha & Omega", apostrophes), the rest into gradle.properties.
    name = meta["name"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "\\'").replace('"', '\\"')
    with open(os.path.join(res, "values", "strings.xml"), "w", encoding="utf-8") as f:
        f.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">{name}</string>\n</resources>\n')
    props = {
        "mbAppId": meta["pkg"],
        "mbVersionCode": str(1000 + RUN),
        "mbVersionName": f"1.{RUN}",
        "mbOrientation": meta.get("orientation", "unspecified"),
    }
    if meta.get("keystore"):
        shutil.copy2(os.path.join(src, "keystore.jks"), os.path.join(work, "keys", "app.jks"))
        props.update({"mbStoreFile": "../keys/app.jks", "mbStorePass": meta["keystore"]["pass"],
                      "mbKeyAlias": meta["keystore"]["alias"]})
    with open(os.path.join(work, "gradle.properties"), "a", encoding="utf-8") as f:
        f.write("\n" + "".join(f"{k}={v}\n" for k, v in props.items()))
    print(f"{app_id}: Android project ready in {work}")


# ---------------------------------------------------------------- electron

def cmd_electron(app_id, src, work):
    with open(os.path.join(src, "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    shutil.rmtree(work, ignore_errors=True)
    shutil.copytree(os.path.join(FACTORY, "electron"), work)
    shutil.copytree(os.path.join(src, "www"), os.path.join(work, "www"))
    shutil.copy2(os.path.join(src, "mb-config.json"), os.path.join(work, "mb-config.json"))
    shutil.copy2(os.path.join(src, "icon.png"), os.path.join(work, "icon.png"))
    pkg = {
        "name": re.sub(r"[^a-z0-9-]", "", meta["id"].lower()) or "martinb-app",
        "version": f"1.0.{RUN}",
        "description": meta.get("desc") or meta["name"],
        "author": "Martin B",
        "main": "main.js",
        "private": True,
        "devDependencies": {"electron": "31.7.7", "electron-builder": "24.13.3"},
        "build": {
            "appId": meta["pkg"],
            "productName": meta["name"],
            "artifactName": meta["file"] + "-Setup.${ext}",
            "directories": {"output": "dist"},
            "files": ["main.js", "preload.js", "bar.html", "mb-config.json", "icon.png", "package.json"],
            "extraResources": [{"from": "www", "to": "www"}],
            "win": {"target": [{"target": "nsis", "arch": ["x64"]}], "icon": "icon.png"},
            # Mac: one app for Apple Silicon and Intel; signed ad hoc and packed into a .dmg by the workflow.
            "mac": {"target": [{"target": "dir", "arch": ["universal"]}], "icon": "icon.png",
                    "category": "public.app-category.productivity", "identity": None},
            "nsis": {
                "oneClick": False,
                "perMachine": False,
                "allowToChangeInstallationDirectory": True,
                "createDesktopShortcut": True,
                "createStartMenuShortcut": True,
                "shortcutName": meta["name"],
                "uninstallDisplayName": meta["name"],
            },
        },
    }
    with open(os.path.join(work, "package.json"), "w", encoding="utf-8") as f:
        json.dump(pkg, f, ensure_ascii=False, indent=2)
    print(f"{app_id}: Windows / Mac project ready in {work}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "plan":
        cmd_plan()
    elif cmd == "source":
        cmd_source(sys.argv[2], sys.argv[3])
    elif cmd == "android":
        cmd_android(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "electron":
        cmd_electron(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        sys.exit(__doc__)
