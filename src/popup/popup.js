/**
 * popup/popup.js
 *
 * Handles all UI interactions for the TMT Translation popup:
 *  - Language selection & swap
 *  - Text input + character count
 *  - Translate button (with loading state)
 *  - Result display (success / error / empty)
 *  - Copy to clipboard
 *  - Settings view (API key save/load/clear)
 *  - Auto-fill from page selection on open
 *  - Persists language preferences
 */

import {
  translate,
  loadApiKey,
  saveApiKey,
  loadLanguagePrefs,
  saveLanguagePrefs,
} from "../shared/api.js";
import { LANGUAGES } from "../shared/languages.js";

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const viewMain     = $("view-main");
const viewSettings = $("view-settings");

// Main
const selSrc        = $("sel-src");
const selTgt        = $("sel-tgt");
const btnSwap       = $("btn-swap");
const inputText     = $("input-text");
const charCount     = $("char-count");
const btnClear      = $("btn-clear");
const btnTranslate  = $("btn-translate");
const outputPanel   = $("output-panel");
const outputEmpty   = $("output-empty");
const outputError   = $("output-error");
const outputErrorMsg= $("output-error-msg");
const outputResult  = $("output-result");
const outputText    = $("output-text");
const btnCopy       = $("btn-copy");
const noKeyBanner   = $("no-key-banner");
const btnSettings   = $("btn-settings");
const bannerLink    = $("banner-settings-link");

// Settings
const btnBack       = $("btn-back");
const inputApiKey   = $("input-api-key");
const btnToggleKey  = $("btn-toggle-key");
const btnSaveKey    = $("btn-save-key");
const saveStatus    = $("save-status");
const btnClearKey   = $("btn-clear-key");

// ─── State ────────────────────────────────────────────────────────────────────
let currentApiKey = null;
let isCopied = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  // Load saved preferences
  const [prefs, apiKey] = await Promise.all([
    loadLanguagePrefs(),
    loadApiKey(),
  ]);

  currentApiKey = apiKey;
  selSrc.value = prefs.srcLang;
  selTgt.value = prefs.tgtLang;

  // Show banner if no API key
  updateKeyBanner();

  // Pre-fill with selected page text (if any)
  await prefillFromPageSelection();
}

// ─── View Navigation ──────────────────────────────────────────────────────────
function showMain() {
  viewMain.hidden = false;
  viewSettings.hidden = true;
}

function showSettings() {
  viewMain.hidden = true;
  viewSettings.hidden = false;
  // Show masked key if present
  if (currentApiKey) {
    inputApiKey.value = currentApiKey;
  }
}

btnSettings.addEventListener("click", showSettings);
btnBack.addEventListener("click", async () => {
  // Fix 3: Re-read the key from storage on every back navigation.
  // Without this, currentApiKey could be stale if the user saved/cleared
  // a key and then navigated back — the banner would show the wrong state.
  currentApiKey = await loadApiKey();
  updateKeyBanner();
  showMain();
});
bannerLink.addEventListener("click", showSettings);

// ─── Language Logic ───────────────────────────────────────────────────────────
function getLanguage(code) {
  return LANGUAGES.find((l) => l.code === code);
}

/** Ensure src and tgt never match. If they do, rotate tgt. */
function syncLanguageConflict(changedSelect) {
  if (selSrc.value === selTgt.value) {
    // Find a language that isn't the current one
    const fallback = LANGUAGES.find((l) => l.code !== selSrc.value);
    if (changedSelect === "src") selTgt.value = fallback.code;
    else selSrc.value = fallback.code;
  }
  persistLanguagePrefs();
}

selSrc.addEventListener("change", () => syncLanguageConflict("src"));
selTgt.addEventListener("change", () => syncLanguageConflict("tgt"));

// Swap
btnSwap.addEventListener("click", () => {
  [selSrc.value, selTgt.value] = [selTgt.value, selSrc.value];

  // Also swap input/output text if a result is shown
  if (!outputResult.hidden && outputText.textContent) {
    const previous = outputText.textContent;
    const inputVal = inputText.value;
    inputText.value = previous;
    updateCharCount();
    // Clear output since context is now reversed
    showOutputState("empty");
  }

  persistLanguagePrefs();
});

async function persistLanguagePrefs() {
  await saveLanguagePrefs(selSrc.value, selTgt.value);
}

// ─── Input / Char Count ───────────────────────────────────────────────────────
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
  showOutputState("empty");
  inputText.focus();
});

// ─── Output States ────────────────────────────────────────────────────────────
/**
 * @param {"empty" | "error" | "result"} state
 * @param {object} [data]
 */
function showOutputState(state, data = {}) {
  outputEmpty.hidden  = state !== "empty";
  outputError.hidden  = state !== "error";
  outputResult.hidden = state !== "result";

  if (state === "error") {
    outputErrorMsg.textContent = data.error || "An unexpected error occurred.";
  }
  if (state === "result") {
    outputText.textContent = data.translated;
    isCopied = false;
    btnCopy.textContent = ""; // Reset (rebuilt below)
    btnCopy.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M9 4V2.5A1.5 1.5 0 0 0 7.5 1H2.5A1.5 1.5 0 0 0 1 2.5v5A1.5 1.5 0 0 0 2.5 9H4"
              stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      Copy`;
  }
}

// ─── Translate ────────────────────────────────────────────────────────────────
async function doTranslate() {
  const text = inputText.value.trim();
  if (!text) {
    inputText.focus();
    return;
  }

  // Reload key in case it was just saved
  currentApiKey = await loadApiKey();

  // Set loading state
  btnTranslate.classList.add("loading");
  btnTranslate.disabled = true;
  showOutputState("empty");

  const result = await translate(text, selSrc.value, selTgt.value, currentApiKey);

  // Clear loading state
  btnTranslate.classList.remove("loading");
  btnTranslate.disabled = false;

  if (result.ok) {
    showOutputState("result", result);
  } else {
    showOutputState("error", result);
  }
}

btnTranslate.addEventListener("click", doTranslate);

// ─── Copy ─────────────────────────────────────────────────────────────────────
btnCopy.addEventListener("click", async () => {
  const text = outputText.textContent;
  if (!text || isCopied) return;

  try {
    await navigator.clipboard.writeText(text);
    isCopied = true;
    btnCopy.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <path d="M2 7l3.5 3.5L11 3" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Copied!`;
    btnCopy.style.color = "var(--success)";

    setTimeout(() => {
      isCopied = false;
      btnCopy.style.color = "";
      btnCopy.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M9 4V2.5A1.5 1.5 0 0 0 7.5 1H2.5A1.5 1.5 0 0 0 1 2.5v5A1.5 1.5 0 0 0 2.5 9H4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        Copy`;
    }, 2000);
  } catch {
    // Clipboard permission denied
    btnCopy.textContent = "Error";
  }
});

// ─── Settings: API Key ────────────────────────────────────────────────────────
// Toggle key visibility
btnToggleKey.addEventListener("click", () => {
  const isHidden = inputApiKey.type === "password";
  inputApiKey.type = isHidden ? "text" : "password";
  btnToggleKey.title = isHidden ? "Hide key" : "Show key";
  btnToggleKey.setAttribute("aria-label", isHidden ? "Hide API key" : "Show API key");
});

// Save key
btnSaveKey.addEventListener("click", async () => {
  const key = inputApiKey.value.trim();
  if (!key) {
    inputApiKey.focus();
    return;
  }

  await saveApiKey(key);
  currentApiKey = key;

  saveStatus.hidden = false;
  updateKeyBanner();

  setTimeout(() => { saveStatus.hidden = true; }, 2500);
});

// Enter key in API key field
inputApiKey.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnSaveKey.click();
});

// Clear / remove key
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

// ─── Pre-fill from Page Selection ─────────────────────────────────────────────
/**
 * If the user had text selected on the current tab when they opened the popup,
 * pre-fill the input box with it for convenience.
 */
async function prefillFromPageSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Inject a tiny script to grab the selection
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString()?.trim() ?? "",
    });

    if (result && result.length > 0 && result.length <= MAX_CHARS) {
      inputText.value = result;
      updateCharCount();
      // Fix 2: automatically trigger translation when text was pre-filled
      // from a page selection, so user just sees the result immediately.
      await doTranslate();
    }
  } catch {
    // Page may not allow scripting (e.g. chrome:// pages) — silently skip
  }
}

// ─── Network Recovery (Fix 4) ─────────────────────────────────────────────────
// When the browser comes back online after a network error, clear the stale
// "no internet" error message so the user can try again without confusion.
window.addEventListener("online", () => {
  // Only clear the error if it was a network error — don't wipe unrelated errors
  if (!outputError.hidden && outputErrorMsg.textContent.toLowerCase().includes("network")) {
    showOutputState("empty");
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
init();
