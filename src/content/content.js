/**
 * content/content.js
 *
 * Injected into all web pages.
 * Handles:
 *  1. TMT_CONTEXT_RESULT  — shows a toast for right-click translations
 *  2. TMT_TRANSLATE_PAGE  — walks the DOM, translates all visible text
 *                           nodes in-place, reports back to popup
 */

(function () {
  "use strict";

  if (window.__tmtContentScriptLoaded) return;
  window.__tmtContentScriptLoaded = true;

  // ─── Toast Notification ─────────────────────────────────────────────────────
  function showToast({ ok, translated, error }) {
    document.getElementById("tmt-toast")?.remove();

    const toast = document.createElement("div");
    toast.id = "tmt-toast";

    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      maxWidth: "360px",
      padding: "12px 16px",
      borderRadius: "10px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "13px",
      lineHeight: "1.5",
      boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      opacity: "0",
      transform: "translateY(8px)",
      transition: "opacity 0.2s ease, transform 0.2s ease",
      cursor: "default",
      userSelect: "text",
      backdropFilter: "blur(8px)",
    });

    if (ok) {
      Object.assign(toast.style, {
        background: "rgba(255,255,255,0.95)",
        color: "#1a1a1a",
        border: "1px solid rgba(0,0,0,0.1)",
      });
      toast.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:16px;flex-shrink:0;">🌐</span>
          <div>
            <div style="font-weight:600;margin-bottom:3px;color:#0061e0;">TMT Translation</div>
            <div style="color:#333;">${escapeHtml(translated)}</div>
          </div>
          <button id="tmt-toast-copy" title="Copy translation" style="
            margin-left:auto;flex-shrink:0;border:none;background:none;
            cursor:pointer;padding:2px;color:#666;font-size:14px;">⎘</button>
        </div>`;
    } else {
      Object.assign(toast.style, {
        background: "rgba(255,235,235,0.97)",
        color: "#c0392b",
        border: "1px solid rgba(192,57,43,0.2)",
      });
      toast.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:16px;flex-shrink:0;">⚠️</span>
          <div>
            <div style="font-weight:600;margin-bottom:3px;">Translation Error</div>
            <div style="font-size:12px;">${escapeHtml(error)}</div>
          </div>
        </div>`;
    }

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    if (ok) {
      toast.querySelector("#tmt-toast-copy")?.addEventListener("click", () => {
        navigator.clipboard.writeText(translated).then(() => {
          const btn = toast.querySelector("#tmt-toast-copy");
          if (btn) { btn.textContent = "✓"; btn.style.color = "#27ae60"; }
        });
      });
    }

    toast.addEventListener("click", (e) => {
      if (e.target.id !== "tmt-toast-copy") dismissToast(toast);
    });

    const timer = setTimeout(() => dismissToast(toast), 6000);
    toast._dismissTimer = timer;
  }

  function dismissToast(toast) {
    clearTimeout(toast._dismissTimer);
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 200);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ─── Page Translation ────────────────────────────────────────────────────────

  /**
   * Tags whose text content should be skipped entirely.
   * We don't want to translate nav, scripts, code, etc.
   */
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED",
    "CODE", "PRE", "KBD", "SAMP", "VAR",
    "NAV", "FOOTER", "HEADER", "ASIDE",
    "INPUT", "TEXTAREA", "SELECT", "BUTTON",
    "SVG", "CANVAS", "VIDEO", "AUDIO",
    "META", "LINK", "HEAD",
  ]);

  /**
   * Collect all leaf text nodes in the page that have meaningful content.
   * Returns an array of { node, sentences[] } objects.
   */
  function collectTextNodes() {
    const collected = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Skip if inside a skippable tag
          let el = node.parentElement;
          while (el) {
            if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
            el = el.parentElement;
          }
          // Skip empty / whitespace-only nodes
          const text = node.textContent.trim();
          if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      collected.push(node);
    }
    return collected;
  }

  /**
   * Split a string into sentences on . ! ? । and newlines.
   * Preserves leading/trailing whitespace of the full string.
   */
  function splitSentences(text) {
    return text
      .split(/(?<=[.!?।\n])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Send a single-sentence translation request to the background service worker.
   * Content scripts can't fetch cross-origin directly.
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

  /**
   * Main page translation routine.
   * Walks DOM text nodes, translates each sentence via the background worker,
   * replaces text in-place, then reports completion back to the popup.
   */
  async function translatePage(srcLang, tgtLang, apiKey) {
    const nodes = collectTextNodes();
    let totalSentences = 0;
    let firstError = null;

    for (const node of nodes) {
      const original = node.textContent;
      const sentences = splitSentences(original);
      const translated = [];

      for (let i = 0; i < sentences.length; i++) {
        // 150ms inter-sentence delay per API docs
        if (i > 0) await new Promise((r) => setTimeout(r, 150));

        const result = await requestTranslation(sentences[i], srcLang, tgtLang, apiKey);

        if (result.ok) {
          translated.push(result.translated);
          totalSentences++;
        } else {
          // On auth/key errors, abort the whole run immediately
          if (
            result.error?.toLowerCase().includes("api key") ||
            result.error?.toLowerCase().includes("token")
          ) {
            chrome.runtime.sendMessage({
              type: "TMT_PAGE_TRANSLATE_DONE",
              ok: false,
              error: result.error,
            });
            return;
          }
          // For other errors, keep the original sentence
          translated.push(sentences[i]);
          firstError = firstError ?? result.error;
        }
      }

      // Replace node text, preserving leading/trailing whitespace
      const leadingWS  = original.match(/^\s*/)[0];
      const trailingWS = original.match(/\s*$/)[0];
      node.textContent = leadingWS + translated.join(" ") + trailingWS;
    }

    // Report back to popup
    chrome.runtime.sendMessage({
      type: "TMT_PAGE_TRANSLATE_DONE",
      ok: true,
      count: totalSentences,
      warning: firstError ?? null,
    });
  }

  // ─── Message Listener ────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TMT_CONTEXT_RESULT") {
      showToast(message.result);
    }

    if (message.type === "TMT_TRANSLATE_PAGE") {
      const { srcLang, tgtLang, apiKey } = message;
      translatePage(srcLang, tgtLang, apiKey).catch((err) => {
        chrome.runtime.sendMessage({
          type: "TMT_PAGE_TRANSLATE_DONE",
          ok: false,
          error: err.message,
        });
      });
    }
  });

})();

(function () {
  "use strict";

  // Prevent double-injection
  if (window.__tmtContentScriptLoaded) return;
  window.__tmtContentScriptLoaded = true;

  // ─── Toast Notification ─────────────────────────────────────────────────────
  /**
   * Show a small non-intrusive toast near the bottom of the viewport.
   * Auto-dismisses after 6 seconds.
   */
  function showToast({ ok, translated, error }) {
    // Remove any existing toast
    document.getElementById("tmt-toast")?.remove();

    const toast = document.createElement("div");
    toast.id = "tmt-toast";

    // Inline styles so we don't pollute the page's CSS
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      maxWidth: "360px",
      padding: "12px 16px",
      borderRadius: "10px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "13px",
      lineHeight: "1.5",
      boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      opacity: "0",
      transform: "translateY(8px)",
      transition: "opacity 0.2s ease, transform 0.2s ease",
      cursor: "default",
      userSelect: "text",
      backdropFilter: "blur(8px)",
    });

    if (ok) {
      Object.assign(toast.style, {
        background: "rgba(255,255,255,0.95)",
        color: "#1a1a1a",
        border: "1px solid rgba(0,0,0,0.1)",
      });

      toast.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:16px;flex-shrink:0;">🌐</span>
          <div>
            <div style="font-weight:600;margin-bottom:3px;color:#0061e0;">TMT Translation</div>
            <div style="color:#333;">${escapeHtml(translated)}</div>
          </div>
          <button id="tmt-toast-copy" title="Copy translation" style="
            margin-left:auto;flex-shrink:0;border:none;background:none;
            cursor:pointer;padding:2px;color:#666;font-size:14px;
          ">⎘</button>
        </div>
      `;
    } else {
      Object.assign(toast.style, {
        background: "rgba(255,235,235,0.97)",
        color: "#c0392b",
        border: "1px solid rgba(192,57,43,0.2)",
      });

      toast.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:16px;flex-shrink:0;">⚠️</span>
          <div>
            <div style="font-weight:600;margin-bottom:3px;">Translation Error</div>
            <div style="font-size:12px;">${escapeHtml(error)}</div>
          </div>
        </div>
      `;
    }

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    // Copy button handler
    if (ok) {
      toast.querySelector("#tmt-toast-copy")?.addEventListener("click", () => {
        navigator.clipboard.writeText(translated).then(() => {
          const btn = toast.querySelector("#tmt-toast-copy");
          if (btn) { btn.textContent = "✓"; btn.style.color = "#27ae60"; }
        });
      });
    }

    // Dismiss on click
    toast.addEventListener("click", (e) => {
      if (e.target.id !== "tmt-toast-copy") dismissToast(toast);
    });

    // Auto-dismiss after 6s
    const timer = setTimeout(() => dismissToast(toast), 6000);
    toast._dismissTimer = timer;
  }

  function dismissToast(toast) {
    clearTimeout(toast._dismissTimer);
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 200);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── Message Listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TMT_CONTEXT_RESULT") {
      showToast(message.result);
    }
  });
})();
