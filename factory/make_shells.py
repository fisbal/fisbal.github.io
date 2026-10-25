#!/usr/bin/env python3
"""Writes w/<id>/index.html (the web window with the gold bar) for every app in apps.json that has a same-site web address."""
import html
import json
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "factory", "shell.html"), encoding="utf-8") as f:
    TEMPLATE = f.read()
with open(os.path.join(ROOT, "apps.json"), encoding="utf-8") as f:
    APPS = json.load(f)["apps"]


def name_html(name):
    i = name.rfind("OS")
    if i > 0 and (i + 2 == len(name) or name[i + 2] == " "):
        return html.escape(name[:i]) + "<b>OS</b>" + html.escape(name[i + 2:])
    return html.escape(name)


made = []
shutil.rmtree(os.path.join(ROOT, "w"), ignore_errors=True)
for a in APPS:
    web = a.get("web")
    # Only same-site addresses can sit inside the window; the hub itself needs no window.
    if not web or not web.startswith("/") or web == "/":
        continue
    page = (TEMPLATE
            .replace("{{NAME_HTML}}", name_html(a["name"]))
            .replace("{{NAME}}", html.escape(a["name"]))
            .replace("{{DESC}}", html.escape(a.get("desc", "")))
            .replace("{{ICON}}", a.get("icon", "icons/hub.png"))
            .replace("{{BG}}", a.get("bg", "#0b0a08"))
            .replace("{{WEB}}", html.escape(web)))
    d = os.path.join(ROOT, "w", a["id"])
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    made.append(a["id"])
print("Web windows:", ", ".join(made))
