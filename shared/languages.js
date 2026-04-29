/**
 * shared/languages.js
 * Central source of truth for all language definitions, codes, and utilities.
 * Used by popup, background, and content scripts alike.
 */

/** Full language definitions recognized by the TMT API */
export const LANGUAGES = [
  {
    code: "en",       // Canonical API code
    name: "English",
    nativeName: "English",
    aliases: ["en", "eng", "english"],
  },
  {
    code: "ne",
    name: "Nepali",
    nativeName: "नेपाली",
    aliases: ["ne", "nep", "nepali"],
  },
  {
    code: "tmg",
    name: "Tamang",
    nativeName: "तामाङ",
    aliases: ["tmg", "tamang"],
  },
];

/** Default language pair shown on first open */
export const DEFAULT_SRC = "en";
export const DEFAULT_TGT = "ne";

/**
 * Normalize any user-supplied language string to a canonical API code.
 * Returns null if unrecognized.
 * @param {string} input - Raw language string (e.g. "eng", "Nepali", "ne")
 * @returns {string|null}
 */
export function normalizeLanguageCode(input) {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  for (const lang of LANGUAGES) {
    if (lang.aliases.includes(lower)) return lang.code;
  }
  return null;
}

/**
 * Look up a full language object by canonical code.
 * @param {string} code
 * @returns {object|null}
 */
export function getLanguageByCode(code) {
  return LANGUAGES.find((l) => l.code === code) ?? null;
}

/**
 * Returns all codes except the excluded one — useful for building target lists.
 * @param {string} excludeCode
 * @returns {object[]}
 */
export function getOtherLanguages(excludeCode) {
  return LANGUAGES.filter((l) => l.code !== excludeCode);
}
