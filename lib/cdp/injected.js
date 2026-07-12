// String-building helpers for JS snippets injected into the page via
// CDP Runtime.evaluate. Extracted from cdp.js so CDPController itself stays
// focused on the CDP command flow rather than embedded JS source strings.

/**
 * Builds an in-page async IIFE (a string, for CDP Runtime.evaluate with awaitPromise)
 * that scrolls smoothly and CONTINUOUSLY — like a person dragging the scrollbar — instead
 * of teleporting in big jumps.
 *   mode "bottom": scroll all the way down, pausing at the end so lazy/virtualized content
 *                  can render, and continuing while the page keeps growing.
 *   mode "top":    scroll all the way up.
 *   mode "by":     scroll down by `dy` px (or ~0.6 viewport when dy is null).
 * When the tab is VISIBLE it steps ~2% of the viewport every ~22ms (~45fps) for smooth,
 * moderate, human-paced motion. When HIDDEN (nobody is watching) it uses big fast jumps and
 * a hard time cap, so background-tab timer throttling can't turn a scroll into a long hang.
 */
export function SMOOTH_SCROLL_JS(mode, dy = null) {
  const distExpr = mode === "by"
    ? (dy != null ? String(Number(dy)) : "Math.round(innerHeight * 0.6)")
    : "0";
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const docH = () => document.documentElement.scrollHeight;
    const atBottom = () => Math.ceil(scrollY + innerHeight) >= docH() - 2;
    const smallStep = () => Math.max(10, Math.round(innerHeight * 0.02)); // ~human, smooth
    const t0 = Date.now(), HARD_MS = 45000;
    const mode = ${JSON.stringify(mode)};

    if (mode === 'top') {
      let g = 0;
      while (scrollY > 0 && g++ < 8000 && (Date.now() - t0) < HARD_MS) {
        const smooth = !document.hidden;
        const before = scrollY;
        scrollBy(0, -(smooth ? smallStep() : Math.round(innerHeight * 0.5)));
        await sleep(smooth ? 22 : 90);
        if (scrollY === before) break;
      }
      await sleep(150);
      return true;
    }

    if (mode === 'by') {
      const target = scrollY + (${distExpr});
      let g = 0;
      while (scrollY < target && g++ < 8000 && (Date.now() - t0) < HARD_MS) {
        const smooth = !document.hidden;
        const stepMax = smooth ? smallStep() : Math.round(innerHeight * 0.4);
        const before = scrollY;
        scrollBy(0, Math.min(stepMax, target - scrollY));
        await sleep(smooth ? 22 : 90);
        if (scrollY === before) break;
      }
      await sleep(200);
      return true;
    }

    // mode 'bottom'
    let lastH = -1, stable = 0, g = 0;
    while (g++ < 16000 && (Date.now() - t0) < HARD_MS) {
      const smooth = !document.hidden;
      const before = scrollY;
      scrollBy(0, smooth ? smallStep() : Math.round(innerHeight * 0.5));
      await sleep(smooth ? 22 : 90);
      if (atBottom()) {
        await sleep(750);                            // let lazy content load at the bottom
        if (docH() === lastH) { if (++stable >= 2) break; } else { stable = 0; }
        lastH = docH();
      } else if (scrollY === before) {
        break;                                       // couldn't move (fixed/overflow container)
      }
    }
    await sleep(300);
    return true;
  })()`;
}

/**
 * JS snippet (function body as a string, no wrapping) that resolves a ref
 * ("ref_N" from the accessibility tree, or legacy "eN") to its DOM element.
 * Meant to be embedded inside a larger expression via FOCUS_GUARD_SNIPPET-style
 * inlining — see resolveRefExpr() for the ready-to-use expression form.
 */
export function resolveRefFnSource() {
  return `function resolveRef(r) {
          if (window.__ocxElementMap && r.startsWith('ref_')) {
            const weak = window.__ocxElementMap[r];
            return weak ? weak.deref() : null;
          }
          if (window.__ocxRefs) return window.__ocxRefs.get(r);
          return null;
        }`;
}

/** Anti-focus-hijack patch: neutralizes target="_blank" and window.open() focus stealing. */
export function focusGuardSource() {
  return `(() => {
          if (window.__ocxFocusGuard) return;
          window.__ocxFocusGuard = true;
          const _origOpen = window.open;
          window.open = function(url, name, features) {
            if (name === '_blank' || !name) name = '_self';
            return _origOpen.call(window, url, name, features);
          };
          // Strip target="_blank" from all existing links
          document.querySelectorAll('a[target="_blank"]').forEach(a => a.target = '_self');
          // Watch for dynamically added links
          new MutationObserver(muts => {
            for (const m of muts)
              for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (n.tagName === 'A' && n.target === '_blank') n.target = '_self';
                n.querySelectorAll?.('a[target="_blank"]')?.forEach(a => a.target = '_self');
              }
          }).observe(document.documentElement, { childList: true, subtree: true });
        })()`;
}

/** Same guard, but as a bare function body (no self-invocation) for addScriptToEvaluateOnNewDocument. */
export function focusGuardSourceForNewDocument() {
  return `(() => {
          if (window.__ocxFocusGuard) return;
          window.__ocxFocusGuard = true;
          const _origOpen = window.open;
          window.open = function(url, name, features) {
            if (name === '_blank' || !name) name = '_self';
            return _origOpen.call(window, url, name, features);
          };
          new MutationObserver(muts => {
            for (const m of muts)
              for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (n.tagName === 'A' && n.target === '_blank') n.target = '_self';
                n.querySelectorAll?.('a[target="_blank"]')?.forEach(a => a.target = '_self');
              }
          }).observe(document.documentElement, { childList: true, subtree: true });
        })()`;
}

/** Legacy (non-accessibility-tree) inline snapshot builder, used as a fallback. */
export function legacySnapshotSource() {
  return `function legacySnapshot(maxChars) {
          const lines = [];
          const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[role=combobox],[contenteditable=true],[onclick],[tabindex]';
          let count = 0;
          for (const el of document.querySelectorAll('h1,h2,h3,' + INTERACTIVE)) {
            if (el.offsetParent === null && el.tagName !== 'BODY') continue;
            if (el.offsetWidth < 2 && el.offsetHeight < 2) continue;
            const tag = el.tagName.toLowerCase();
            if (/^h[1-3]$/.test(tag)) {
              const t = (el.textContent || '').replace(/\\s+/g, ' ').trim().substring(0, 120);
              if (t) lines.push('── ' + tag.toUpperCase() + ': ' + t);
              continue;
            }
            if (!el.matches(INTERACTIVE)) continue;
            count++;
            const ref = 'e' + count;
            let desc = tag;
            if (tag === 'input') desc += '[' + (el.type || 'text') + ']';
            const aria = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.textContent || '';
            if (aria) desc += ' "' + String(aria).replace(/\\s+/g, ' ').trim().substring(0, 60) + '"';
            const states = [];
            if (el.disabled) states.push('disabled');
            if (el.checked) states.push('checked');
            if (tag === 'input' || tag === 'textarea') {
              if (el.type === 'password') states.push('value=•••');
              else if (el.value) states.push('value="' + String(el.value).substring(0, 60) + '"');
            }
            if (tag === 'a') {
              const href = el.getAttribute('href');
              if (href && !href.startsWith('javascript:')) states.push('href=' + href.substring(0, 80));
            }
            let line = ref + ' | ' + desc;
            if (states.length) line += ' | ' + states.join(', ');
            lines.push(line);
            if (count > 500) { lines.push('… (truncated)'); break; }
            if (lines.join('\\n').length > maxChars) { lines.push('… (truncated — page has too many elements)'); break; }
          }
          return 'ELEMENTS (ref | element | state):\\n' + lines.join('\\n');
        }`;
}

/** Builds the legacy ref registry (window.__ocxRefs) used as a fallback when
 *  the accessibility tree ref map isn't available yet. */
export function buildLegacyRefsSource() {
  return `if (!window.__ocxRefs && !_ref.startsWith('ref_')) {
          window.__ocxRefs = new Map();
          const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[role=combobox],[contenteditable=true],[onclick],[tabindex]';
          let counter = 0;
          for (const el of document.querySelectorAll('h1,h2,h3,' + INTERACTIVE)) {
            if (el.offsetParent === null && el.tagName !== 'BODY') continue;
            if (el.offsetWidth < 2 && el.offsetHeight < 2) continue;
            const tag = el.tagName.toLowerCase();
            if (/^h[1-3]$/.test(tag)) continue;
            if (!el.matches(INTERACTIVE)) continue;
            counter++;
            window.__ocxRefs.set('e' + counter, el);
          }
        }`;
}
