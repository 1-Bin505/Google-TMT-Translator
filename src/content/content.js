/**
 * content/content.js — TMT Translation
 *
 * Injected into all web pages. Single IIFE, no duplicates.
 * Handles:
 *  1. TMT_CONTEXT_RESULT  → show toast notification (right-click translate)
 *  2. TMT_TRANSLATE_PAGE  → walk DOM, translate all visible text in-place,
 *                           report TMT_PAGE_TRANSLATE_DONE back to popup
 */

(function () {
  "use strict";

  // Guard against being injected more than once
  if (window.__tmtLoaded) return;
  window.__tmtLoaded = true;

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast({ ok, translated, error }) {
    document.getElementById("tmt-toast")?.remove();

    const t = document.createElement("div");
    t.id = "tmt-toast";
    Object.assign(t.style, {
      position: "fixed", bottom: "24px", right: "24px", zIndex: "2147483647",
      maxWidth: "360px", padding: "12px 16px", borderRadius: "10px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "13px", lineHeight: "1.5",
      boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      opacity: "0", transform: "translateY(8px)",
      transition: "opacity 0.2s ease, transform 0.2s ease",
      userSelect: "text", backdropFilter: "blur(8px)",
    });

    if (ok) {
      Object.assign(t.style, { background: "rgba(255,255,255,0.96)", color: "#1a1a1a", border: "1px solid rgba(0,0,0,0.1)" });
      t.innerHTML = `<div style="display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:16px;flex-shrink:0">🌐</span>
        <div><div style="font-weight:600;margin-bottom:3px;color:#1a73e8">TMT Translation</div>
        <div style="color:#333">${esc(translated)}</div></div>
        <button id="tmt-copy" style="margin-left:auto;flex-shrink:0;border:none;background:none;cursor:pointer;padding:2px;color:#666;font-size:14px">⎘</button>
      </div>`;
    } else {
      Object.assign(t.style, { background: "rgba(255,235,235,0.97)", color: "#c0392b", border: "1px solid rgba(192,57,43,0.2)" });
      t.innerHTML = `<div style="display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:16px;flex-shrink:0">⚠️</span>
        <div><div style="font-weight:600;margin-bottom:3px">Translation Error</div>
        <div style="font-size:12px">${esc(error)}</div></div>
      </div>`;
    }

    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });

    if (ok) {
      t.querySelector("#tmt-copy")?.addEventListener("click", () => {
        navigator.clipboard.writeText(translated).then(() => {
          const b = t.querySelector("#tmt-copy");
          if (b) { b.textContent = "✓"; b.style.color = "#27ae60"; }
        });
      });
    }

    const timer = setTimeout(() => dismiss(t), 6000);
    t.addEventListener("click", (e) => { if (e.target.id !== "tmt-copy") { clearTimeout(timer); dismiss(t); } });
  }

  function dismiss(el) {
    el.style.opacity = "0"; el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 200);
  }

  function esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Page Translation ───────────────────────────────────────────────────────

  // Elements whose text nodes we skip entirely
  const SKIP = new Set([
    "SCRIPT","STYLE","NOSCRIPT","IFRAME","OBJECT","EMBED",
    "CODE","PRE","KBD","SAMP","VAR",
    "NAV","FOOTER","ASIDE",
    "INPUT","TEXTAREA","SELECT","BUTTON",
    "SVG","CANVAS","VIDEO","AUDIO",
    "META","LINK","HEAD",
  ]);

  /** Collect all visible, non-trivial leaf text nodes */
  function collectTextNodes() {
    const result = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el) {
          if (SKIP.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        const t = node.textContent.trim();
        if (!t || t.length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) result.push(n);
    return result;
  }

  /** Split text into sentences on . ! ? । and newlines */
  function splitSentences(text) {
    return text.split(/(?<=[.!?।\n])\s+/).map(s => s.trim()).filter(Boolean);
  }

  /**
   * Ask the background service worker to translate one sentence.
   * Content scripts cannot make cross-origin fetch calls directly.
   */
  function requestTranslation(text, srcLang, tgtLang, apiKey) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "TMT_TRANSLATE_REQUEST", text, srcLang, tgtLang, apiKey },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /** Walk every text node, translate sentence by sentence, replace in-place */
  async function translatePage(srcLang, tgtLang, apiKey) {
    const nodes = collectTextNodes();
    let count = 0;
    let firstError = null;

    for (const node of nodes) {
      const original  = node.textContent;
      const sentences = splitSentences(original);
      const parts     = [];

      for (let i = 0; i < sentences.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 150)); // rate-limit per API docs

        const res = await requestTranslation(sentences[i], srcLang, tgtLang, apiKey);

        if (res.ok) {
          parts.push(res.translated);
          count++;
        } else {
          // Auth errors → abort everything immediately
          if (res.error?.toLowerCase().includes("api key") ||
              res.error?.toLowerCase().includes("token")) {
            chrome.runtime.sendMessage({ type: "TMT_PAGE_TRANSLATE_DONE", ok: false, error: res.error });
            return;
          }
          // Other errors → keep original sentence, carry on
          parts.push(sentences[i]);
          if (!firstError) firstError = res.error;
        }
      }

      // Preserve leading/trailing whitespace of the original node
      const lead  = original.match(/^\s*/)[0];
      const trail = original.match(/\s*$/)[0];
      node.textContent = lead + parts.join(" ") + trail;
    }

    chrome.runtime.sendMessage({ type: "TMT_PAGE_TRANSLATE_DONE", ok: true, count, warning: firstError });
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TMT_CONTEXT_RESULT") {
      showToast(msg.result);
    }

    if (msg.type === "TMT_TRANSLATE_PAGE") {
      translatePage(msg.srcLang, msg.tgtLang, msg.apiKey).catch((err) => {
        chrome.runtime.sendMessage({ type: "TMT_PAGE_TRANSLATE_DONE", ok: false, error: err.message });
      });
    }
  });

})();
