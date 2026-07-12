// content/ocx/refs.js — element reference registry + focus guard.
// Part 1 of content.js, split for readability. Classic (non-module) script:
// loaded before the other content/ocx/*.js files and shares scope via
// window.__ocxLib (see content.js for the assembly / message router).
//
// Must run once per page (idempotent via window.__ocxInstalled, checked here
// since this is the first file in the load order).

(() => {
  if (window.__ocxInstalled) return;
  window.__ocxInstalled = true;

  // ---------- GLOBAL FOCUS GUARD (runs at document_start) ----------
  // Prevent target="_blank" from stealing focus when agent clicks links.
  // This runs BEFORE any page scripts, catching all <a> elements and window.open().
  if (!window.__ocxFocusGuard) {
    window.__ocxFocusGuard = true;

    // Intercept window.open — replace _blank with _self
    const _origOpen = window.open;
    window.open = function(url, name, features) {
      if (name === '_blank' || !name) name = '_self';
      return _origOpen.call(window, url, name, features);
    };

    // Strip target="_blank" from all existing and future links
    const stripBlank = (el) => {
      if (!el) return;
      if (el.tagName === 'A' && el.target === '_blank') el.target = '_self';
      el.querySelectorAll?.('a[target="_blank"]')?.forEach(a => a.target = '_self');
    };
    // Process existing DOM — documentElement may not exist yet at document_start
    const docEl = document.documentElement;
    if (docEl) stripBlank(docEl);
    document.addEventListener('DOMContentLoaded', () => {
      if (document.documentElement) stripBlank(document.documentElement);
    }, { once: true });

    // Watch for dynamically added links
    new MutationObserver(muts => {
      for (const m of muts)
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'A' && n.target === '_blank') n.target = '_self';
          n.querySelectorAll?.('a[target="_blank"]')?.forEach(a => a.target = '_self');
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------- shared namespace for the other content/ocx/*.js files ----------
  const lib = window.__ocxLib = {};

  // ---------- reference registry ----------
  let refToEl = new Map();   // "e12" -> Element
  let elToRef = new WeakMap();
  let refCounter = 0;
  let snapshotGen = 0;

  function refFor(el) {
    let ref = elToRef.get(el);
    if (!ref) {
      ref = "e" + (++refCounter);
      elToRef.set(el, ref);
    }
    refToEl.set(ref, el);
    return ref;
  }

  function resolveTarget({ ref, selector }) {
    if (ref) {
      // Try our local refToEl map first
      let el = refToEl.get(ref);
      if (el && el.isConnected) return el;
      // Try accessibility tree's ref map (ref_N format)
      if (window.__ocxElementMap && ref.startsWith('ref_')) {
        const weakRef = window.__ocxElementMap[ref];
        if (weakRef) {
          el = weakRef.deref();
          if (el && el.isConnected) {
            refToEl.set(ref, el);
            elToRef.set(el, ref);
            return el;
          }
        }
      }
      return null;
    }
    if (selector) {
      try { return document.querySelector(selector); } catch { return null; }
    }
    return null;
  }

  function resetRefs() {
    snapshotGen++;
    refToEl = new Map(); // old refs cleared
    return snapshotGen;
  }

  function importAccessibilityRefs() {
    // Build refToEl map from the accessibility tree's refs so actions resolve.
    // The accessibility tree uses ref_N format; content.js runs in the same
    // isolated world, so it can access the WeakRefs directly.
    if (!window.__ocxElementMap) return;
    for (const [refId, weakRef] of Object.entries(window.__ocxElementMap)) {
      const el = weakRef.deref();
      if (el && el.isConnected) {
        refToEl.set(refId, el);
        elToRef.set(el, refId);
      }
    }
  }

  lib.refs = {
    refFor,
    resolveTarget,
    resetRefs,
    importAccessibilityRefs,
    getGen: () => snapshotGen,
  };
})();
