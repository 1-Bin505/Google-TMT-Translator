/**
 * shared/api.js
 * TMT Translation API client.
 *
 * Responsibilities:
 *  - Load API key from chrome.storage.sync
 *  - Send translate requests sentence-by-sentence (API requirement)
 *  - Cache results in-memory (keyed by text+src+tgt)
 *  - Debounce rapid calls
 *  - Return typed result objects for easy consumption
 */

const API_ENDPOINT = "https://tmt.ilprl.ku.edu.np/lang-translate";

// ─── In-memory cache ──────────────────────────────────────────────────────────
const translationCache = new Map();

function cacheKey(text, src, tgt) {
  return `${src}|${tgt}|${text}`;
}

// ─── Sentence splitter ────────────────────────────────────────────────────────
/**
 * Split text into sentences for sentence-by-sentence translation.
 * Handles English and Devanagari sentence endings.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoSentences(text) {
  // Split on ., !, ?, ।  (Devanagari danda) followed by whitespace or end
  const parts = text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}

// ─── Core API call ────────────────────────────────────────────────────────────
/**
 * Translate a single sentence via the TMT API.
 * @param {string} sentence
 * @param {string} srcLang  - canonical code (en | ne | tmg)
 * @param {string} tgtLang  - canonical code (en | ne | tmg)
 * @param {string} apiKey
 * @returns {Promise<{ok: boolean, translated?: string, error?: string}>}
 */
async function translateSentence(sentence, srcLang, tgtLang, apiKey) {
  const key = cacheKey(sentence, srcLang, tgtLang);

  // Return from cache if available
  if (translationCache.has(key)) {
    return { ok: true, translated: translationCache.get(key) };
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text: sentence,
        src_lang: srcLang,
        tgt_lang: tgtLang,
      }),
    });

    // Per the API docs, always parse JSON first — the body contains the real
    // error message even on non-200 responses (401, 400, 500).
    let data;
    try {
      data = await response.json();
    } catch {
      return { ok: false, error: `API error: HTTP ${response.status} (no JSON body)` };
    }

    // BUG FIX #2 & #3:
    // Per the API docs:
    //   - Success: message_type === "SUCCESS"
    //   - Error responses do NOT include message_type at all — only "message"
    // So we check for SUCCESS explicitly; anything else is a failure.
    if (data.message_type !== "SUCCESS") {
      // The "message" field is always present and human-readable per the docs.
      const reason = data.message || `HTTP ${response.status}`;

      // Surface auth errors clearly
      if (response.status === 401 || reason.toLowerCase().includes("token") || reason.toLowerCase().includes("auth")) {
        return { ok: false, error: `Invalid API key: ${reason}` };
      }
      return { ok: false, error: `Translation failed: ${reason}` };
    }

    // BUG FIX #1:
    // Per Section 4 of the API docs, the translated text is ALWAYS in "output".
    // No other field name is used. Previous code incorrectly prioritised
    // "translated_text", "translation", "result" before "output".
    const translated = data.output;

    if (translated === undefined || translated === null) {
      return { ok: false, error: "API returned SUCCESS but the 'output' field was missing." };
    }

    // Store in cache
    translationCache.set(key, translated);

    return { ok: true, translated };
  } catch (err) {
    // Network-level error
    if (err.name === "TypeError" && err.message.includes("Failed to fetch")) {
      return { ok: false, error: "Network error: Could not reach the TMT API. Check your connection." };
    }
    return { ok: false, error: `Unexpected error: ${err.message}` };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Translate a full block of text (may be multiple sentences).
 * Validates inputs, splits sentences, translates each, rejoins.
 *
 * @param {string} text
 * @param {string} srcLang
 * @param {string} tgtLang
 * @param {string} apiKey
 * @returns {Promise<{ok: boolean, translated?: string, error?: string}>}
 */
export async function translate(text, srcLang, tgtLang, apiKey) {
  // ── Validation ──────────────────────────────────────────────────────────────
  if (!text || !text.trim()) {
    return { ok: false, error: "Please enter some text to translate." };
  }
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: "No API key set. Please add your API key in Settings." };
  }
  if (srcLang === tgtLang) {
    return { ok: false, error: "Source and target languages must be different." };
  }

  const sentences = splitIntoSentences(text);
  const results = [];

  for (let i = 0; i < sentences.length; i++) {
    // API docs say: "Add a short delay between requests to avoid overloading
    // the server." Apply 150 ms between sentences (not before the first one).
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const result = await translateSentence(sentences[i], srcLang, tgtLang, apiKey);
    if (!result.ok) return result; // Propagate first error immediately
    results.push(result.translated);
  }

  return { ok: true, translated: results.join(" ") };
}

/**
 * Load the API key from extension storage.
 * @returns {Promise<string|null>}
 */
export async function loadApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiKey"], (result) => {
      // Guard against empty strings that may have been stored previously
      const key = result.apiKey;
      resolve(key && key.trim() ? key.trim() : null);
    });
  });
}

/**
 * Save the API key to extension storage.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function saveApiKey(key) {
  // Normalize blank/empty strings to null so loadApiKey never returns ""
  // which would incorrectly pass the Boolean() check in updateKeyBanner.
  const normalized = key && key.trim() ? key.trim() : null;
  return new Promise((resolve) => {
    if (normalized === null) {
      // Remove the key entirely from storage rather than storing an empty string
      chrome.storage.sync.remove("apiKey", resolve);
    } else {
      chrome.storage.sync.set({ apiKey: normalized }, resolve);
    }
  });
}

/**
 * Load saved language preferences.
 * @returns {Promise<{srcLang: string, tgtLang: string}>}
 */
export async function loadLanguagePrefs() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["srcLang", "tgtLang"], (result) => {
      resolve({
        srcLang: result.srcLang ?? "en",
        tgtLang: result.tgtLang ?? "ne",
      });
    });
  });
}

/**
 * Save language preferences.
 * @param {string} srcLang
 * @param {string} tgtLang
 * @returns {Promise<void>}
 */
export async function saveLanguagePrefs(srcLang, tgtLang) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ srcLang, tgtLang }, resolve);
  });
}

/** Clear the in-memory translation cache. */
export function clearCache() {
  translationCache.clear();
}
