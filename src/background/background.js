/**
 * background/background.js  (Service Worker — Manifest V3)
 *
 * Responsibilities:
 *  - Register context menu item for translating selected text
 *  - Listen for keyboard shortcut commands
 *  - Relay translation requests from content scripts to the API
 *    (service workers can make cross-origin requests; content scripts cannot)
 *  - Keep extension icon state in sync
 */

import { translate, loadApiKey, loadLanguagePrefs } from "../shared/api.js";

// ─── Context Menu Setup ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "tmt-translate-selection",
    title: "Translate with TMT",
    contexts: ["selection"],
  });
});

// ─── Context Menu Click ───────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "tmt-translate-selection") return;

  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  const apiKey = await loadApiKey();
  const { srcLang, tgtLang } = await loadLanguagePrefs();

  const result = await translate(selectedText, srcLang, tgtLang, apiKey);

  // Send result to the active tab's content script for display
  chrome.tabs.sendMessage(tab.id, {
    type: "TMT_CONTEXT_RESULT",
    result,
    originalText: selectedText,
  }).catch(() => {
    // Content script may not be injected on some pages (e.g. chrome:// pages)
    // Fall back to opening the popup — handled by action click
  });
});

// ─── Message Relay from Content Scripts ──────────────────────────────────────
/**
 * Content scripts cannot make cross-origin fetch calls directly.
 * They send a message to the background, which performs the API call and replies.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "TMT_TRANSLATE_REQUEST") return false;

  const { text, srcLang, tgtLang, apiKey } = message;

  translate(text, srcLang, tgtLang, apiKey)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  // Return true to keep the message channel open for async sendResponse
  return true;
});

// ─── Keyboard Shortcut Command ────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-popup") {
    // Opening the popup programmatically is not directly supported in MV3;
    // the shortcut defined in manifest.json will handle this natively.
    // This listener is kept for future extensibility.
  }
});
