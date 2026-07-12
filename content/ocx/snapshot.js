// content/ocx/snapshot.js — page snapshot (Claude-style accessibility tree,
// with a legacy DOM-walk fallback) and simple text/page-info readers.
// Part 3 of content.js.

(() => {
  const lib = window.__ocxLib;
  if (!lib) return;
  const { refs, dom } = lib;

  // ---------- snapshot (Claude-style accessibility tree) ----------
  function snapshot({ maxChars = 50000, viewportOnly = true, filter = 'interactive', refId = null } = {}) {
    const gen = refs.resetRefs();

    // Use __generateAccessibilityTree if available (injected by accessibility-tree.js)
    if (typeof window.__generateAccessibilityTree === 'function') {
      try {
        const result = window.__generateAccessibilityTree(
          viewportOnly ? filter : 'all',
          15,           // maxDepth
          maxChars,     // maxChars
          refId         // refId (for focused tree on specific element)
        );
        if (result.error) {
          return { ok: false, error: result.error };
        }

        refs.importAccessibilityRefs();

        const header = [
          `URL: ${location.href}`,
          `TITLE: ${dom.clean(document.title, 200)}`,
        ];
        const scrollPct = document.documentElement.scrollHeight <= innerHeight ? 100 :
          Math.round((scrollY + innerHeight) / document.documentElement.scrollHeight * 100);
        header.push(`VIEWPORT: scrolled to ${scrollPct}% (scrollY=${Math.round(scrollY)}, pageHeight=${document.documentElement.scrollHeight})`);
        header.push('');

        const fullSnapshot = header.join('\n') + result.pageContent;
        return { ok: true, snapshot: fullSnapshot, gen };
      } catch (e) {
        // Fall through to legacy snapshot
        console.warn('[OCX] Accessibility tree failed, falling back to legacy:', e.message);
      }
    }

    return legacySnapshot({ maxChars, viewportOnly, gen });
  }

  // ---------- legacy snapshot (fallback when no accessibility tree) ----------
  function legacySnapshot({ maxChars, viewportOnly, gen }) {
    const lines = [];
    const push = (s) => lines.push(s);

    push(`URL: ${location.href}`);
    push(`TITLE: ${dom.clean(document.title, 200)}`);
    push("");
    push("ELEMENTS (ref | element | state):");

    const seen = new Set();
    const all = document.querySelectorAll(`h1, h2, h3, ${dom.INTERACTIVE_SEL}`);
    let count = 0;
    for (const el of all) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!dom.isVisible(el)) continue;
      if (viewportOnly && !dom.inViewport(el)) continue;

      const tag = el.tagName.toLowerCase();
      if (/^h[1-3]$/.test(tag)) {
        const t = dom.clean(el.textContent, 120);
        if (t) push(`── ${tag.toUpperCase()}: ${t}`);
        continue;
      }

      if (!el.matches(dom.INTERACTIVE_SEL)) continue;
      if (tag === "div" || tag === "span") {
        const role = el.getAttribute("role");
        const editable = el.isContentEditable;
        const clickable = el.hasAttribute("onclick") || role;
        if (!editable && !clickable) continue;
      }

      const ref = refs.refFor(el);
      let line = `${ref} | ${dom.describeEl(el)}`;

      const states = [];
      if (el.disabled) states.push("disabled");
      if (el.checked) states.push("checked");
      if (el.selected) states.push("selected");
      if (el.getAttribute("aria-expanded")) states.push(`expanded=${el.getAttribute("aria-expanded")}`);
      if (tag === "input" || tag === "textarea") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (type === "password") states.push("value=•••");
        else if (el.value) states.push(`value="${dom.clean(el.value, 60)}"`);
      }
      if (el.isContentEditable && el.textContent.trim()) states.push(`text="${dom.clean(el.textContent, 60)}"`);
      if (tag === "select") {
        const opts = [...el.options].slice(0, 12).map(o => (o.selected ? "*" : "") + dom.clean(o.textContent, 30));
        states.push(`options=[${opts.join(", ")}]${el.options.length > 12 ? "…" : ""}`);
      }
      if (tag === "a") {
        const href = el.getAttribute("href");
        if (href && !href.startsWith("javascript:")) states.push(`href=${dom.clean(href, 80)}`);
      }
      if (!dom.inViewport(el)) states.push("off-screen");
      if (states.length) line += ` | ${states.join(", ")}`;
      push(line);

      if (++count > 500) { push(`… (element list truncated, there were more)`); break; }
      if (lines.join("\n").length > maxChars) { push("… (truncated — page has too many elements)"); break; }
    }

    let out = lines.join("\n");
    if (out.length > maxChars) out = out.slice(0, maxChars) + "\n… (truncated)";
    return { ok: true, snapshot: out, gen };
  }

  function getText({ maxChars = 20000 } = {}) {
    let text = document.body?.innerText || "";
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    const truncated = text.length > maxChars;
    if (truncated) text = text.slice(0, maxChars) + "\n… (truncated)";
    return { ok: true, url: location.href, title: document.title, text, truncated };
  }

  function pageInfo() {
    return {
      ok: true,
      url: location.href,
      title: document.title,
      scrollY: Math.round(scrollY),
      pageHeight: document.documentElement.scrollHeight,
      viewport: { w: innerWidth, h: innerHeight }
    };
  }

  lib.snapshot = { snapshot, getText, pageInfo };
})();
