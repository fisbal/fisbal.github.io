#!/usr/bin/env python3
"""Public update channel for Martin's apps, so their source repos can be private.

Installed apps (Windows, Mac, Android) look for new versions here instead of in their own repo:
  - the files of each app's newest release are copied to the rolling release "<id>-updates" of this
    (public) repo:  https://github.com/fisbal/fisbal.github.io/releases/download/<id>-updates/<file>
  - small JSON files are published on the hub site (CORS-friendly, fast):
      https://fisbal.github.io/updates/<id>/latest.json   Tauri updater manifest, URLs pointing here
      https://fisbal.github.io/updates/<id>/release.json  {"tag_name": "v1.2.3", ...} like GitHub's API

Reading a private repo's releases needs SOURCE_TOKEN (fine-grained token, Contents: read-only).
While a repo is still public it works without it. Writing here uses the workflow's own token (GH_TOKEN).

  mirror_updates.py            -> mirror every app whose newest release is not copied yet
  mirror_updates.py <id> ...   -> only these apps
  FORCE=true                   -> copy again even if the version is already there
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HUB = "fisbal/fisbal.github.io"
DL = f"https://github.com/{HUB}/releases/download"

# id on the hub -> source repo
# Only Office In 1 is private (Martin, 2026-11-01): the other apps keep updating from their own public repos.
# Add an app here before making its repo private.
APPS = {
    "oi1": "fisbal/oi1",
}

SOURCE_TOKEN = os.environ.get("SOURCE_TOKEN", "").strip()


class _NoAuthOnOtherHost(urllib.request.HTTPRedirectHandler):
    """Asset downloads redirect to a signed storage URL: never send the token there."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and urllib.parse.urlsplit(newurl).hostname != urllib.parse.urlsplit(req.full_url).hostname:
            new.remove_header("Authorization")
        return new


_open = urllib.request.build_opener(_NoAuthOnOtherHost()).open


def api(url, accept="application/vnd.github+json"):
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "martinb-hub-mirror",
                                               "X-GitHub-Api-Version": "2022-11-28"})
    if SOURCE_TOKEN:
        req.add_header("Authorization", f"Bearer {SOURCE_TOKEN}")
    return _open(req, timeout=300)


def gh(*args, check=True):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=check)


def hub_state(app_id):
    """(version already mirrored, asset names) of the hub's rolling release, or ('', set())."""
    r = gh("release", "view", f"{app_id}-updates", "-R", HUB, "--json", "body,assets", check=False)
    if r.returncode != 0:
        return "", set()
    data = json.loads(r.stdout)
    ver = ""
    for line in data.get("body", "").splitlines():
        if line.startswith("mirrored: "):
            ver = line.split(": ", 1)[1].strip()
    return ver, {a["name"] for a in data.get("assets", [])}


def mirror(app_id, repo, force):
    with api(f"https://api.github.com/repos/{repo}/releases/latest") as r:
        rel = json.load(r)
    tag = rel["tag_name"]
    have, names = hub_state(app_id)
    page = os.path.join(ROOT, "updates", app_id)
    if have == tag and not force and os.path.exists(os.path.join(page, "release.json")):
        print(f"{app_id}: {tag} already mirrored")
        return False
    print(f"{app_id}: mirroring {repo} {tag}", flush=True)
    tmp = tempfile.mkdtemp()
    files = []
    for a in rel["assets"]:
        dest = os.path.join(tmp, a["name"])
        with api(a["url"], accept="application/octet-stream") as r, open(dest, "wb") as out:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
        files.append(a["name"])
        print(f"  got {a['name']} ({a['size']} bytes)", flush=True)

    # Tauri manifest: point every platform at the copy on the hub.
    latest = None
    if "latest.json" in files:
        p = os.path.join(tmp, "latest.json")
        with open(p, encoding="utf-8") as f:
            latest = json.load(f)
        for plat in latest.get("platforms", {}).values():
            plat["url"] = f"{DL}/{app_id}-updates/{plat['url'].rsplit('/', 1)[-1]}"
        with open(p, "w", encoding="utf-8") as f:
            json.dump(latest, f, indent=2)

    body = f"Update channel for {app_id} (copied automatically, do not edit).\nsource: {repo}\nmirrored: {tag}\n"
    if gh("release", "view", f"{app_id}-updates", "-R", HUB, check=False).returncode != 0:
        gh("release", "create", f"{app_id}-updates", "-R", HUB, "--title", f"{app_id} updates", "--notes", body, "--latest=false")
    gh("release", "upload", f"{app_id}-updates", "-R", HUB, "--clobber", *[os.path.join(tmp, n) for n in files])
    for old in names - set(files):
        gh("release", "delete-asset", f"{app_id}-updates", old, "-R", HUB, "-y", check=False)
    gh("release", "edit", f"{app_id}-updates", "-R", HUB, "--notes", body)

    os.makedirs(page, exist_ok=True)
    if latest is not None:
        with open(os.path.join(page, "latest.json"), "w", encoding="utf-8") as f:
            json.dump(latest, f, indent=2)
    summary = {
        "tag_name": tag,
        "name": rel.get("name") or tag,
        "published_at": rel.get("published_at"),
        "assets": [{"name": n, "browser_download_url": f"{DL}/{app_id}-updates/{n}"} for n in files],
    }
    with open(os.path.join(page, "release.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"{app_id}: {tag} mirrored ({len(files)} files)")
    return True


def prune():
    """Remove the channel of an app that is no longer listed (its own repo is public again)."""
    r = gh("release", "list", "-R", HUB, "-L", "200", "--json", "tagName", "-q", ".[].tagName", check=False)
    for tag in r.stdout.split():
        if tag.endswith("-updates") and tag[: -len("-updates")] not in APPS:
            body = gh("release", "view", tag, "-R", HUB, "--json", "body", "-q", ".body", check=False).stdout
            if body.startswith("Update channel for"):
                gh("release", "delete", tag, "-R", HUB, "-y", "--cleanup-tag", check=False)
                print(f"removed channel {tag}")


def check_token():
    """Say in the log whether SOURCE_TOKEN is there and accepted (needed once oi1 is private)."""
    if not SOURCE_TOKEN:
        print("SOURCE_TOKEN: missing (fine while the app repos are public)")
        return
    for repo in APPS.values():
        try:
            with api(f"https://api.github.com/repos/{repo}"):
                print(f"SOURCE_TOKEN: accepted for {repo}")
        except Exception as e:
            print(f"::error::SOURCE_TOKEN refused for {repo}: {e}")


def main():
    check_token()
    if not sys.argv[1:]:
        prune()
    force = os.environ.get("FORCE", "false") == "true"
    only = [a for a in sys.argv[1:] if a]
    failed = []
    for app_id, repo in APPS.items():
        if only and app_id not in only:
            continue
        try:
            mirror(app_id, repo, force)
        except Exception as e:  # one app failing must not stop the others
            print(f"::error::{app_id}: {e}")
            failed.append(app_id)
    if failed:
        sys.exit(f"Could not mirror: {', '.join(failed)}")


if __name__ == "__main__":
    main()
