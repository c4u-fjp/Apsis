/**
 * APSIS - bilingual Spanish / English interface.
 * Only presentation strings are translated. Data IDs, physics, event timings,
 * coordinates, CSS classes, API schemas, and game-control actions are untouched.
 */
import english from './es-en.json';

const STORAGE_KEY = 'apsis.language';
let stored = 'es';
try { stored = localStorage.getItem(STORAGE_KEY) || 'es'; } catch { /* private mode */ }
const requested = new URLSearchParams(location.search).get('lang');
export const language = requested === 'en' || requested === 'es' ? requested : stored === 'en' ? 'en' : 'es';
export const isEnglish = language === 'en';
document.documentElement.setAttribute('lang', language);

// Longer expressions first, preserving HTML markup, numbers, URLs and code IDs.
const phrases = Object.keys(english).sort((a, b) => b.length - a.length);
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRegex = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${phrases.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gu'
);
const cache = new Map();
export function t(value) {
  if (!isEnglish || value == null) return value;
  const original = String(value);
  if (cache.has(original)) return cache.get(original);
  const exact = english[original];
  if (exact !== undefined) { cache.set(original, exact); return exact; }
  // Translate known fragments in composite logs while leaving physics/data intact.
  const result = original.replace(phraseRegex, (_match, prefix, phrase) => prefix + english[phrase]);
  if (cache.size > 2500) cache.clear();
  cache.set(original, result);
  return result;
}

// Translate Canvas2D text, including the mission-control monitors and VR panels.
// measureText receives the same translation so right-aligned labels remain aligned.
if (isEnglish && typeof CanvasRenderingContext2D !== 'undefined') {
  const proto = CanvasRenderingContext2D.prototype;
  for (const method of ['fillText', 'strokeText', 'measureText']) {
    const native = proto[method];
    if (typeof native !== 'function') continue;
    proto[method] = function (text, ...args) { return native.call(this, t(text), ...args); };
  }
}

const originalText = new WeakMap();
const lastText = new WeakMap();
const attrOriginals = new WeakMap();
const TRANSLATED_ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

function translateNode(node) {
  if (!isEnglish) return;
  if (node.nodeType === Node.TEXT_NODE) {
    if (!node.parentElement || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(node.parentElement.tagName)) return;
    let raw = originalText.get(node);
    if (raw === undefined || node.nodeValue !== lastText.get(node)) {
      raw = node.nodeValue;
      originalText.set(node, raw);
    }
    const translated = t(raw);
    lastText.set(node, translated);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    let originalAttrs = attrOriginals.get(node);
    if (!originalAttrs) { originalAttrs = {}; attrOriginals.set(node, originalAttrs); }
    for (const attr of TRANSLATED_ATTRS) {
      if (!node.hasAttribute(attr)) continue;
      const current = node.getAttribute(attr);
      if (!originalAttrs[attr] || current !== originalAttrs[attr].display) {
        originalAttrs[attr] = { raw: current, display: current };
      }
      const translated = t(originalAttrs[attr].raw);
      originalAttrs[attr].display = translated;
      if (translated !== current) node.setAttribute(attr, translated);
    }
  }
}
function translateTree(root) {
  translateNode(root);
  if (!isEnglish || root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateNode(walker.currentNode);
}
function initTranslations() {
  translateTree(document.body);
  if (isEnglish) {
    const observer = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === 'characterData') translateNode(change.target);
        else if (change.type === 'attributes') translateNode(change.target);
        else for (const n of change.addedNodes) translateTree(n);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: TRANSLATED_ATTRS });
  }

  const switcher = document.getElementById('language-switcher');
  if (!switcher) return;
  for (const button of switcher.querySelectorAll('[data-lang]')) {
    const active = button.dataset.lang === language;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      const target = button.dataset.lang;
      if (target === language) return;
      try { localStorage.setItem(STORAGE_KEY, target); } catch { /* private mode */ }
      const url = new URL(location.href);
      url.searchParams.set('lang', target);
      // Reload once to recreate 3D labels and VR textures in the chosen language.
      location.assign(url.toString());
    });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTranslations, { once: true });
else initTranslations();
