(function () {
  "use strict";

  if (window.__tmtLoaded) return;
  window.__tmtLoaded = true;

  // ── Utilities ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

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

  // ── Page Translation ───────────────────────────────────────────────────────

  /**
   * Tags that are themselves block containers — we collect text within these.
   * We do NOT descend past them looking for sub-blocks; we treat their full
   * text content as one translation unit.
   */
  const BLOCK_TAGS = new Set([
    "P", "H1", "H2", "H3", "H4", "H5", "H6",
    "LI", "DT", "DD", "BLOCKQUOTE", "FIGCAPTION", "CAPTION",
    "TD", "TH", "LEGEND", "LABEL", "SUMMARY",
    "ADDRESS", "ARTICLE", "SECTION", "MAIN",
  ]);

  /**
   * Tags whose text we must never touch regardless of where they appear.
   */
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED",
    "CODE", "PRE", "KBD", "SAMP", "VAR",
    "NAV", "FOOTER", "HEADER", "ASIDE",
    "INPUT", "TEXTAREA", "SELECT", "BUTTON", "OPTION",
    "SVG", "CANVAS", "VIDEO", "AUDIO",
    "META", "LINK", "HEAD", "TIME", "DATA",
  ]);

  /**
   * Check if any ancestor of `el` is in SKIP_TAGS.
   * Returns true if the element should be skipped.
   */
  function hasSkipAncestor(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (SKIP_TAGS.has(cur.tagName)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  /**
   * Collect all leaf TEXT nodes within `root`, skipping skip-tagged subtrees.
   * Does NOT recurse into nested block elements — those are handled separately.
   */
  function getLeafTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip empty / whitespace-only
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        // Skip if inside a skip-tagged ancestor
        if (hasSkipAncestor(node.parentElement)) return NodeFilter.FILTER_REJECT;
        // Don't descend into nested block elements — they're separate units
        let p = node.parentElement;
        while (p && p !== root) {
          if (BLOCK_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  /**
   * Find all block-level elements on the page that contain translatable text.
   * Returns an array of { el, nodes } where `nodes` are the leaf text nodes
   * inside `el` that together form one translation unit.
   */
  function collectBlocks() {
    const blocks = [];
    const seen   = new Set();

    // Walk every element in the body
    const allEls = document.body.querySelectorAll("*");

    for (const el of allEls) {
      if (!BLOCK_TAGS.has(el.tagName)) continue;
      if (seen.has(el))                continue;
      if (hasSkipAncestor(el))         continue;

      // Check visibility — skip hidden elements
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;

      // Collect leaf text nodes within this block (not descending into sub-blocks)
      const nodes = getLeafTextNodes(el);
      if (nodes.length === 0) continue;

      // Only include if there's actual non-whitespace content
      const fullText = nodes.map(n => n.textContent).join("").trim();
      if (!fullText || fullText.length < 2) continue;

      blocks.push({ el, nodes });
      seen.add(el);
    }

    return blocks;
  }

  /**
   * Send ONE translation request to the background service worker.
   * The background calls the TMT API and returns the result.
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

  /**
   * Write translated text back into the original text nodes.
   *
   * Strategy: the translated string is one continuous piece of text.
   * We distribute it across the original nodes proportionally by the
   * character-length weight of each node's original content.
   *
   * This keeps inline elements (<a>, <strong>, <em>) structurally intact
   * while replacing their text content with the translation.
   *
   * Example:
   *   Original nodes: ["Hello ", "world", " today"]   → full = "Hello world today"
   *   Translated:     "नमस्ते संसार आज"
   *   Weights:         6/17, 5/17, 6/17
   *   Result nodes:   ["नमस्ते स", "ंसार", " आज"]   ← approximate split
   *
   * Note: character-proportional splitting is approximate but far better than
   * sending each node independently, since the full sentence context is preserved.
   * For most pages with simple inline markup, this produces clean results.
   */
  function distributeTranslation(nodes, translatedText) {
    if (nodes.length === 1) {
      // Simple case — only one text node, just replace it directly
      const orig = nodes[0].textContent;
      const lead  = orig.match(/^\s*/)[0];
      const trail = orig.match(/\s*$/)[0];
      nodes[0].textContent = lead + translatedText + trail;
      return;
    }

    // Calculate the total non-whitespace character length of originals
    const originals  = nodes.map(n => n.textContent);
    const trimmed    = originals.map(s => s.trim());
    const totalLen   = trimmed.reduce((sum, s) => sum + s.length, 0);

    if (totalLen === 0) return;

    // Distribute the translated text proportionally
    const words       = translatedText.split(/\s+/).filter(Boolean);
    const totalWords  = words.length;
    let wordOffset    = 0;

    for (let i = 0; i < nodes.length; i++) {
      const orig      = originals[i];
      const lead      = orig.match(/^\s*/)[0];
      const trail     = orig.match(/\s*$/)[0];
      const weight    = trimmed[i].length / totalLen;

      // Last node gets everything remaining
      if (i === nodes.length - 1) {
        nodes[i].textContent = lead + words.slice(wordOffset).join(" ") + trail;
        break;
      }

      const wordCount = Math.max(1, Math.round(weight * totalWords));
      const chunk     = words.slice(wordOffset, wordOffset + wordCount).join(" ");
      nodes[i].textContent = lead + chunk + trail;
      wordOffset += wordCount;

      // Guard: if we've run out of words early, leave remaining nodes as-is
      if (wordOffset >= words.length) break;
    }
  }

  /**
   * Main page translation routine.
   *
   * For each block element on the page:
   *  1. Concatenate all its leaf text nodes into one string
   *  2. Send the full string to the API as one translation unit
   *  3. Distribute the translated result back across the original nodes
   */
  async function translatePage(srcLang, tgtLang, apiKey) {
    const blocks = collectBlocks();
    let count      = 0;
    let firstError = null;

    for (let i = 0; i < blocks.length; i++) {
      const { nodes } = blocks[i];

      // Build the full text of this block from all its text nodes
      const fullText = nodes.map(n => n.textContent.trim()).filter(Boolean).join(" ");
      if (!fullText) continue;

      // Inter-block delay per API docs (avoid overloading server)
      if (i > 0) await new Promise(r => setTimeout(r, 150));

      // Send the ENTIRE block as one translation request — this is the key fix.
      // The API translates the full sentence/paragraph with complete context.
      const res = await requestTranslation(fullText, srcLang, tgtLang, apiKey);

      if (res.ok) {
        // Distribute the translated text back into the original node structure
        distributeTranslation(nodes, res.translated);
        count++;
      } else {
        // Auth/key errors → abort immediately
        if (res.error?.toLowerCase().includes("api key") ||
            res.error?.toLowerCase().includes("token") ||
            res.error?.toLowerCase().includes("invalid")) {
          chrome.runtime.sendMessage({ type: "TMT_PAGE_TRANSLATE_DONE", ok: false, error: res.error });
          return;
        }
        // Other errors → skip this block, continue with the rest
        if (!firstError) firstError = res.error;
      }
    }

    chrome.runtime.sendMessage({
      type: "TMT_PAGE_TRANSLATE_DONE",
      ok: true,
      count,
      warning: firstError ?? null,
    });
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TMT_CONTEXT_RESULT") {
      showToast(msg.result);
    }

    if (msg.type === "TMT_TRANSLATE_PAGE") {
      translatePage(msg.srcLang, msg.tgtLang, msg.apiKey).catch((err) => {
        chrome.runtime.sendMessage({
          type: "TMT_PAGE_TRANSLATE_DONE",
          ok: false,
          error: err.message,
        });
      });
    }
  });

})();
