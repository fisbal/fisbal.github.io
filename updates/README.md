# Update channel

Written by `.github/workflows/mirror-updates.yml` (`factory/mirror_updates.py`). Do not edit by hand.

Installed apps read `https://fisbal.github.io/updates/<id>/latest.json` (Tauri) or `release.json`
(Android, `{"tag_name": "v1.2.3"}`), and download files from the release `<id>-updates` of this repo.
This keeps updates working when the apps' own repos are private.
