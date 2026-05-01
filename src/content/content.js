/**
 * content/content.js
 *
 * Injected into all web pages.
 * Currently handles:
 *  - Receiving TMT_CONTEXT_RESULT from the background service worker
 *    and showing a lightweight toast/notification on the page.
 *
 * NOTE: The main translation UI lives in the popup (popup.html).
 * This content script is intentionally minimal to avoid page interference.
 */

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
