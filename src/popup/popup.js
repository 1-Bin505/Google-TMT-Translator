/**
 * popup/popup.js — TMT Translation
 *
 * Single source of truth for all popup UI logic.
 * Normal Mode: textarea → translate button → output
 * Reading Mode: toggle switch → two action buttons (Translate Selection / Translate Page)
 */

import {
  translate,
  loadApiKey,
  saveApiKey,
  loadLanguagePrefs,
  saveLanguagePrefs,
} from "../shared/api.js";
import { LANGUAGES } from "../shared/languages.js";

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// Views
const viewMain     = $("view-main");
const viewSettings = $("view-settings");

// Normal mode
const normalMode     = $("normal-mode");
const selSrc         = $("sel-src");
const selTgt         = $("sel-tgt");
const btnSwap        = $("btn-swap");
const inputText      = $("input-text");
const charCount      = $("char-count");
const btnClear       = $("btn-clear");
const btnTranslate   = $("btn-translate");
const outputEmpty    = $("output-empty");
const outputError    = $("output-error");
const outputErrorMsg = $("output-error-msg");
const outputResult   = $("output-result");
const outputText     = $("output-text");
const btnCopy        = $("btn-copy");

// Reading mode
const chkReadingMode  = $("chk-reading-mode");
const readingMode     = $("reading-mode");
const rmSelTgt        = $("rm-sel-tgt");
const btnRmSelection  = $("btn-rm-selection");
const btnRmPage       = $("btn-rm-page");
const rmStatus        = $("rm-status");
const rmStatusError   = $("rm-status-error");
const rmErrorMsg      = $("rm-error-msg");
const rmStatusSuccess = $("rm-status-success");
const rmSuccessMsg    = $("rm-success-msg");
const rmResultBox     = $("rm-result-box");
const rmResultText    = $("rm-result-text");
const rmBtnCopy       = $("rm-btn-copy");

// Header / settings
const btnSettings    = $("btn-settings");
const bannerLink     = $("banner-settings-link");
const noKeyBanner    = $("no-key-banner");
const btnBack        = $("btn-back");
const inputApiKey    = $("input-api-key");
const btnToggleKey   = $("btn-toggle-key");
const btnSaveKey     = $("btn-save-key");
const saveStatus     = $("save-status");
const btnClearKey    = $("btn-clear-key");

// ─── State ────────────────────────────────────────────────────────────────────
let currentApiKey = null;
let isCopied      = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const [prefs, apiKey, stored] = await Promise.all([
    loadLanguagePrefs(),
    loadApiKey(),
    new Promise((r) => chrome.storage.sync.get(["readingMode"], r)),
  ]);

  currentApiKey  = apiKey;
  selSrc.value   = prefs.srcLang;
  selTgt.value   = prefs.tgtLang;
  rmSelTgt.value = prefs.tgtLang;

  // Restore toggle state
  if (stored.readingMode) {
    chkReadingMode.checked = true;
    applyMode(true);
  }

  updateKeyBanner();
  await prefillFromPageSelection();
}

// ─── Mode switching ───────────────────────────────────────────────────────────
chkReadingMode.addEventListener("change", () => {
  const on = chkReadingMode.checked;
  applyMode(on);
  chrome.storage.sync.set({ readingMode: on });
  setRmStatus("idle"); // clear stale result on every switch
});

function applyMode(readingOn) {
  normalMode.hidden  =  readingOn;
  readingMode.hidden = !readingOn;
}

// ─── View navigation ──────────────────────────────────────────────────────────
function showMain() {
  viewMain.hidden    = false;
  viewSettings.hidden = true;
}
function showSettings() {
  viewMain.hidden    = true;
  viewSettings.hidden = false;
  if (currentApiKey) inputApiKey.value = currentApiKey;
}

btnSettings.addEventListener("click", showSettings);
bannerLink.addEventListener("click",  showSettings);
btnBack.addEventListener("click", async () => {
  currentApiKey = await loadApiKey();
  updateKeyBanner();
  showMain();
});

// ─── Language controls ────────────────────────────────────────────────────────
function resolveConflict(changed) {
  if (selSrc.value === selTgt.value) {
    const fallback = LANGUAGES.find((l) => l.code !== selSrc.value);
    if (changed === "src") selTgt.value = fallback.code;
    else                   selSrc.value = fallback.code;
  }
  rmSelTgt.value = selTgt.value;
  persistLangs();
}

selSrc.addEventListener("change", () => resolveConflict("src"));
selTgt.addEventListener("change", () => resolveConflict("tgt"));

btnSwap.addEventListener("click", () => {
  [selSrc.value, selTgt.value] = [selTgt.value, selSrc.value];
  rmSelTgt.value = selTgt.value;
  if (!outputResult.hidden && outputText.textContent) {
    inputText.value = outputText.textContent;
    updateCharCount();
    showOutput("empty");
  }
  persistLangs();
});

rmSelTgt.addEventListener("change", () => {
  if (rmSelTgt.value === selSrc.value) {
    const fallback = LANGUAGES.find((l) => l.code !== rmSelTgt.value);
    selSrc.value = fallback.code;
  }
  selTgt.value = rmSelTgt.value;
  persistLangs();
});

async function persistLangs() {
  await saveLanguagePrefs(selSrc.value, selTgt.value);
}

// ─── Char count ───────────────────────────────────────────────────────────────
const MAX_CHARS = 2000;
function updateCharCount() {
  const len = inputText.value.length;
  charCount.textContent = `${len} / ${MAX_CHARS}`;
  charCount.style.color = len > MAX_CHARS * 0.9 ? "var(--error-text)" : "";
}
inputText.addEventListener("input", updateCharCount);

btnClear.addEventListener("click", () => {
  inputText.value = "";
  updateCharCount();
  showOutput("empty");
  inputText.focus();
});

// ─── Normal mode output ───────────────────────────────────────────────────────
function showOutput(state, data = {}) {
  outputEmpty.hidden  = state !== "empty";
  outputError.hidden  = state !== "error";
  outputResult.hidden = state !== "result";

  if (state === "error") {
    outputErrorMsg.textContent = data.error || "An unexpected error occurred.";
  }
  if (state === "result") {
    outputText.textContent = data.translated;
    isCopied = false;
    resetCopyBtn(btnCopy);
  }
}

// ─── Normal mode translate ────────────────────────────────────────────────────
async function doTranslate() {
  const text = inputText.value.trim();
  if (!text) { inputText.focus(); return; }

  currentApiKey = await loadApiKey();
  btnTranslate.classList.add("loading");
  btnTranslate.disabled = true;
  showOutput("empty");

  const result = await translate(text, selSrc.value, selTgt.value, currentApiKey);

  btnTranslate.classList.remove("loading");
  btnTranslate.disabled = false;

  if (result.ok) showOutput("result", result);
  else           showOutput("error",  result);
}

btnTranslate.addEventListener("click", doTranslate);

// ─── Normal mode copy ─────────────────────────────────────────────────────────
btnCopy.addEventListener("click", () => copyText(outputText.textContent, btnCopy));

// ─── Reading mode: status ─────────────────────────────────────────────────────
function setRmStatus(state, msg = "", text = "") {
  rmStatus.hidden          = state === "idle";
  rmStatusError.hidden     = state !== "error";
  rmStatusSuccess.hidden   = state !== "success";
  rmResultBox.hidden       = state !== "result";

  if (state === "error")   rmErrorMsg.textContent   = msg;
  if (state === "success") rmSuccessMsg.textContent = msg;
  if (state === "result")  {
    rmResultText.textContent = text;
    resetCopyBtn(rmBtnCopy);
  }
}

// ─── Reading mode: Translate Selection ───────────────────────────────────────
btnRmSelection.addEventListener("click", async () => {
  setRmStatus("idle");

  // Read selection from active tab
  let selected = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() ?? "",
    });
    selected = result ?? "";
  } catch {
    setRmStatus("error", "Could not read the page. Try reloading the tab.");
    return;
  }

  if (!selected) {
    setRmStatus("error", "No text selected. Highlight some text on the page first.");
    return;
  }

  currentApiKey = await loadApiKey();

  setRmBtnsLoading(true, "selection");
  const result = await translate(selected, selSrc.value, rmSelTgt.value, currentApiKey);
  setRmBtnsLoading(false);

  if (result.ok) setRmStatus("result", "", result.translated);
  else           setRmStatus("error",  result.error);
});

// ─── Reading mode: Translate Page ────────────────────────────────────────────
btnRmPage.addEventListener("click", async () => {
  setRmStatus("idle");
  currentApiKey = await loadApiKey();

  if (!currentApiKey) {
    setRmStatus("error", "No API key set. Please add your key in Settings.");
    return;
  }

  setRmBtnsLoading(true, "page");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Message content.js which will walk the DOM and report back via TMT_PAGE_TRANSLATE_DONE
    await chrome.tabs.sendMessage(tab.id, {
      type:    "TMT_TRANSLATE_PAGE",
      srcLang: selSrc.value,
      tgtLang: rmSelTgt.value,
      apiKey:  currentApiKey,
    });
    // Result arrives in the onMessage listener below
  } catch {
    setRmBtnsLoading(false);
    setRmStatus("error", "Could not reach the page. Try reloading the tab.");
  }
});

// Receive completion message from content.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "TMT_PAGE_TRANSLATE_DONE") return;
  setRmBtnsLoading(false);
  if (msg.ok) {
    setRmStatus("success",
      `Page translated — ${msg.count} sentence${msg.count !== 1 ? "s" : ""} replaced.`);
  } else {
    setRmStatus("error", msg.error || "Page translation failed.");
  }
});

// ─── Reading mode: copy ───────────────────────────────────────────────────────
rmBtnCopy.addEventListener("click", () => copyText(rmResultText.textContent, rmBtnCopy));

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Enable/disable both rm buttons and show spinner on the active one */
function setRmBtnsLoading(on, active = "none") {
  btnRmSelection.disabled = on;
  btnRmPage.disabled      = on;
  btnRmSelection.classList.toggle("loading", on && active === "selection");
  btnRmPage.classList.toggle("loading",      on && active === "page");
}

/** Copy text to clipboard and animate the button */
async function copyText(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <path d="M2 7l3.5 3.5L11 3" stroke="var(--success)" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg> Copied!`;
    btn.style.color = "var(--success)";
    setTimeout(() => {
      resetCopyBtn(btn);
      btn.style.color = "";
    }, 2000);
  } catch {
    btn.textContent = "Error";
  }
}

function resetCopyBtn(btn) {
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M9 4V2.5A1.5 1.5 0 0 0 7.5 1H2.5A1.5 1.5 0 0 0 1 2.5v5A1.5 1.5 0 0 0 2.5 9H4"
            stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg> Copy`;
}

// ─── Settings: API key ────────────────────────────────────────────────────────
btnToggleKey.addEventListener("click", () => {
  const hidden = inputApiKey.type === "password";
  inputApiKey.type = hidden ? "text" : "password";
  btnToggleKey.title = hidden ? "Hide key" : "Show key";
});

btnSaveKey.addEventListener("click", async () => {
  const key = inputApiKey.value.trim();
  if (!key) { inputApiKey.focus(); return; }
  await saveApiKey(key);
  currentApiKey = key;
  saveStatus.hidden = false;
  updateKeyBanner();
  setTimeout(() => { saveStatus.hidden = true; }, 2500);
});

inputApiKey.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnSaveKey.click();
});

btnClearKey.addEventListener("click", async () => {
  if (!confirm("Remove your saved API key?")) return;
  await saveApiKey("");
  currentApiKey = null;
  inputApiKey.value = "";
  updateKeyBanner();
});

function updateKeyBanner() {
  noKeyBanner.hidden = Boolean(currentApiKey);
}

// ─── Pre-fill from selection ──────────────────────────────────────────────────
async function prefillFromPageSelection() {
  if (chkReadingMode.checked) return; // reading mode has its own flow
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() ?? "",
    });
    if (result && result.length > 0 && result.length <= MAX_CHARS) {
      inputText.value = result;
      updateCharCount();
      await doTranslate();
    }
  } catch { /* restricted pages — silently skip */ }
}

// ─── Network recovery ─────────────────────────────────────────────────────────
window.addEventListener("online", () => {
  if (!outputError.hidden && outputErrorMsg.textContent.toLowerCase().includes("network")) {
    showOutput("empty");
  }
  if (!rmStatusError.hidden && rmErrorMsg.textContent.toLowerCase().includes("network")) {
    setRmStatus("idle");
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
