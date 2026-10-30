// Opens the live hub in a real browser and checks what a visitor sees:
// one card per app in apps.json, each with its buttons, a Mac button for every factory app, no page errors.
// Appends the result to the run summary; exits 1 on a problem.
import { chromium } from "playwright";
import fs from "fs";

const apps = JSON.parse(fs.readFileSync("apps.json", "utf8")).apps;
const browser = await chromium.launch();
const page = await browser.newPage({ locale: "fr-CA" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("https://fisbal.github.io/?check=" + Date.now(), { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelectorAll("#apps .app").length > 0, null, { timeout: 30000 });
await page.waitForTimeout(3000);

const cards = await page.$$eval("#apps .app", (els) => els.map((e) => ({
  name: e.querySelector(".name").textContent,
  on: [...e.querySelectorAll("a.btn")].map((b) => b.textContent.trim()),
  off: [...e.querySelectorAll(".btn.off")].map((b) => b.textContent.trim())
})));
await page.screenshot({ path: "hub-screenshot.png", fullPage: true });
await browser.close();

const problems = [...errors.map((e) => "Erreur dans la page : " + e)];
if (cards.length !== apps.length) problems.push(`${cards.length} cartes affichées pour ${apps.length} apps.`);
for (const a of apps) {
  const c = cards.find((x) => x.name === a.name);
  if (!c) { problems.push(`${a.name} : carte absente.`); continue; }
  if (a.factory) {
    for (const t of ["Web", "APK", "Windows", "Mac"]) if (!c.on.includes(t)) problems.push(`${a.name} : bouton ${t} absent ou pas prêt.`);
  } else if (c.on.length === 0) {
    problems.push(`${a.name} : aucun bouton actif.`);
  }
}

const lines = ["", "## Le hub vu par un visiteur", "", problems.length ? `❌ ${problems.length} problème(s)` : "✅ Toutes les cartes et tous les boutons sont là.", "",
  "| App | Boutons actifs | Pas prêts |", "|---|---|---|",
  ...cards.map((c) => `| ${c.name} | ${c.on.join(" · ")} | ${c.off.join(" · ")} |`),
  ...(problems.length ? ["", ...problems.map((p) => "- " + p)] : []), ""];
const text = lines.join("\n");
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
fs.appendFileSync("hub-check-report.md", text);
process.exit(problems.length ? 1 : 0);
