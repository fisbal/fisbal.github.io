/* ===================== TechFix — languages =====================
   Same five languages as Office In 1: English, Français, Español, Português, Deutsch.
   The device language is picked the first time; the user's choice is remembered.

   How it works (no big rewrite of the app needed):
   - t("English text", {param}) for strings built in code (gettext style: English is the key).
   - A built-in translator walks every text TechFix shows (and placeholders/tooltips) and swaps
     in the translation from strings-<lang>.js. Numbers are kept automatically: the key
     "{0} findings to review" matches "3 findings to review".
   - Knowledge-base entries are translated by kb/kb-<lang>.js (loaded on demand) via kbL().
   Anything without a translation simply stays in English — never a blank or a raw key. */
"use strict";

const TF_LANGS = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
  { code: "de", name: "Deutsch" }
];
const TF_LANG_KEY = "techfix:language";
window.TF_STRINGS = window.TF_STRINGS || {};   // { fr: { "English": "Français", … }, … } — strings-<lang>.js
window.KB_L10N = window.KB_L10N || {};         // { fr: { "<kb id>": { t, s:[], c:[], f:[], a:[] } } } — kb/kb-<lang>.js

function tfDetectLang(){
  try{
    const saved = localStorage.getItem(TF_LANG_KEY);
    if(saved && TF_LANGS.some(l => l.code === saved)) return saved;
  }catch(e){ /* storage blocked */ }
  for(const tag of (navigator.languages || [navigator.language || "en"])){
    const base = String(tag || "").slice(0, 2).toLowerCase();
    if(TF_LANGS.some(l => l.code === base)) return base;
  }
  return "en";
}
let TF_LANG = tfDetectLang();
document.documentElement.lang = TF_LANG;

function tfFill(s, params){
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m)) : s;
}
function t(key, params){
  const table = window.TF_STRINGS[TF_LANG];
  const s = (TF_LANG !== "en" && table && table[key] != null) ? table[key] : key;
  return tfFill(s, params);
}
function tfLocale(){ return { en:"en-CA", fr:"fr-CA", es:"es", pt:"pt-BR", de:"de-DE" }[TF_LANG] || "en"; }

/* ---------- Knowledge base ---------- */
function kbL(entry){
  if(!entry) return null;
  const tr = TF_LANG === "en" ? null : (window.KB_L10N[TF_LANG] || {})[entry.id];
  const same = (a, b) => Array.isArray(a) && a.length === (b || []).length;
  return {
    title: (tr && tr.t) || entry.title,
    symptoms: tr && same(tr.s, entry.symptoms) ? tr.s : entry.symptoms,
    causes: tr && same(tr.c, entry.causes) ? tr.c : entry.causes,
    fixes: tr && same(tr.f, entry.fixes) ? tr.f : entry.fixes,
    actionLabels: (entry.actions || []).map((a, i) => (tr && tr.a && tr.a[i]) || a.label)
  };
}
function eraL(era){
  const tr = t(era);
  if(tr !== era) return tr;
  return String(era || "").replace(/present\)/, t("present") + ")");
}

const _kbLoads = {};
function loadKbLanguage(lang){
  if(lang === "en" || window.KB_L10N[lang]) return Promise.resolve(true);
  if(_kbLoads[lang]) return _kbLoads[lang];
  _kbLoads[lang] = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "kb/kb-" + lang + ".js";
    s.onload = () => resolve(!!window.KB_L10N[lang]);
    s.onerror = () => { delete _kbLoads[lang]; resolve(false); };
    document.head.appendChild(s);
  });
  return _kbLoads[lang];
}

/* ---------- Built-in page translator ---------- */
const TF_SKIP = new Set(["SCRIPT", "STYLE", "CODE", "TEXTAREA", "PRE", "KBD"]);
function tfKey(s){
  const nums = [];
  const k = s.replace(/\s+/g, " ").trim().replace(/\d+(?:[.,]\d+)?/g, (m) => { nums.push(m); return "{" + (nums.length - 1) + "}"; });
  return { k, nums };
}
function tfTranslateString(orig){
  if(TF_LANG === "en") return orig;
  const table = window.TF_STRINGS[TF_LANG];
  if(!table) return orig;
  const { k, nums } = tfKey(orig);
  if(!k || !/[A-Za-z]/.test(k)) return orig;
  let tr = table[k];
  if(tr == null) return orig;
  tr = tr.replace(/\{(\d+)\}/g, (m, i) => (nums[+i] != null ? nums[+i] : m));
  const lead = orig.match(/^\s*/)[0], trail = orig.match(/\s*$/)[0];
  return lead + tr + trail;
}
function tfSkipped(node){
  for(let p = node.parentNode; p && p.nodeType === 1; p = p.parentNode){
    if(TF_SKIP.has(p.tagName) || (p.classList && (p.classList.contains("notranslate-tf") || p.classList.contains("brand")))) return true;
  }
  return false;
}
let _tfBusy = false;
function tfTranslateTree(root){
  if(!root) return;
  _tfBusy = true;
  try{
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    if(root.nodeType === 3) nodes.push(root);
    while(walker.nextNode()) nodes.push(walker.currentNode);
    for(const n of nodes){
      if(!n.nodeValue || !n.nodeValue.trim() || tfSkipped(n)) continue;
      if(n.__tfOrig === undefined || (n.nodeValue !== n.__tfLast)) n.__tfOrig = n.nodeValue;
      const out = tfTranslateString(n.__tfOrig);
      if(out !== n.nodeValue) n.nodeValue = out;
      n.__tfLast = n.nodeValue;
    }
    const els = root.nodeType === 1 ? [root, ...root.querySelectorAll("[placeholder],[title],[aria-label]")] : [];
    for(const e of els){
      for(const attr of ["placeholder", "title", "aria-label"]){
        if(!e.hasAttribute || !e.hasAttribute(attr)) continue;
        const store = "tfOrig" + attr.replace(/-./g, (m) => m[1].toUpperCase()).replace(/^./, (c) => c.toUpperCase());
        const cur = e.getAttribute(attr);
        if(e.dataset[store] === undefined || cur !== e.dataset[store + "Last"]) e.dataset[store] = cur;
        const out = tfTranslateString(e.dataset[store]);
        if(out !== cur) e.setAttribute(attr, out);
        e.dataset[store + "Last"] = e.getAttribute(attr);
      }
    }
  } finally { _tfBusy = false; }
}
let _tfObserver = null;
function tfStartTranslator(){
  if(_tfObserver) return;
  _tfObserver = new MutationObserver((muts) => {
    if(_tfBusy || TF_LANG === "en") return;
    for(const m of muts){
      if(m.type === "characterData") tfTranslateTree(m.target);
      else m.addedNodes.forEach((n) => { if(n.nodeType === 1 || n.nodeType === 3) tfTranslateTree(n); });
    }
  });
  _tfObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  tfTranslateTree(document.body);
}

/* ---------- Switching language ---------- */
const _langListeners = new Set();
function onLanguageChange(fn){ _langListeners.add(fn); }
function setLanguage(code){
  if(!TF_LANGS.some(l => l.code === code)) return;
  TF_LANG = code;
  document.documentElement.lang = code;
  try{ localStorage.setItem(TF_LANG_KEY, code); }catch(e){}
  loadKbLanguage(code).then(() => {
    _langListeners.forEach((fn) => { try{ fn(code); }catch(e){ console.error(e); } });
    tfTranslateTree(document.body);
  });
}
function tfLanguagePicker(){
  const sel = document.createElement("select");
  sel.id = "lang-select";
  sel.className = "lang-select notranslate-tf";
  sel.setAttribute("aria-label", "Language");
  sel.innerHTML = TF_LANGS.map((l) => `<option value="${l.code}" ${l.code === TF_LANG ? "selected" : ""}>${l.name}</option>`).join("");
  sel.addEventListener("change", () => setLanguage(sel.value));
  return sel;
}
