// content/ocx/actions.js — DOM interaction actions: click, fill, press,
// select, scroll, find, wait, hover, eval. Part 4 of content.js.

(() => {
  const lib = window.__ocxLib;
  if (!lib) return;
  const { refs, dom } = lib;
  const { resolveTarget } = refs;
  const { flashHighlight, firePointer, setNativeValue, pressKeyOn, describeEl, accName, INTERACTIVE_SEL, isVisible, inViewport } = dom;

  async function doClick({ ref, selector, dblclick = false }) {
    const el = resolveTarget({ ref, selector });
    if (!el) return { ok: false, error: `Element not found (${ref || selector}). Take a new snapshot.` };
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    await new Promise(r => setTimeout(r, 120));

    // Prevent target="_blank" from stealing focus — temporarily remove it
    // so the link opens in the same tab (or we handle it via background onCreated)
    const wasTargetBlank = el.tagName === 'A' && (el.target === '_blank' || el.getAttribute('target') === '_blank');
    const savedTarget = el.target;
    if (wasTargetBlank) {
      el.target = '_self';
    }
    // Also prevent window.open() calls from stealing focus
    const origOpen = window.open;
    window.open = function(url, name, features) {
      // Replace _blank with _self to keep focus
      if (name === '_blank' || !name) name = '_self';
      return origOpen.call(window, url, name, features);
    };
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    flashHighlight(el, "click");

    // the element may be covered — click what's actually on top, if it's a descendant
    let target = el;
    const top = document.elementFromPoint(x, y);
    if (top && el.contains(top)) target = top;

    try {
      firePointer(target, "pointerover", x, y);
      firePointer(target, "mouseover", x, y);
      firePointer(target, "pointerdown", x, y);
      firePointer(target, "mousedown", x, y);
      target.focus?.({ preventScroll: true });
      firePointer(target, "pointerup", x, y);
      firePointer(target, "mouseup", x, y);
      firePointer(target, "click", x, y);
      if (dblclick) firePointer(target, "dblclick", x, y);
    } catch (e) {
      // Restore originals even on error
      if (wasTargetBlank) el.target = savedTarget;
      window.open = origOpen;
      return { ok: false, error: `Click failed: ${e.message}` };
    }

    // Restore originals after click
    if (wasTargetBlank) el.target = savedTarget;
    window.open = origOpen;

    return { ok: true, clicked: describeEl(el) };
  }

  async function doFill({ ref, selector, value = "", clear = true, pressEnter = false }) {
    const el = resolveTarget({ ref, selector });
    if (!el) return { ok: false, error: `Element not found (${ref || selector}). Take a new snapshot.` };
    el.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(r => setTimeout(r, 80));
    flashHighlight(el, "typing");
    el.focus?.({ preventScroll: true });

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (clear) setNativeValue(el, "");
      setNativeValue(el, clear ? value : el.value + value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.isContentEditable) {
      if (clear) {
        const sel = getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.addRange(range);
        document.execCommand("delete", false);
      }
      document.execCommand("insertText", false, value);
    } else {
      return { ok: false, error: "This element is not a text field." };
    }

    if (pressEnter) {
      await new Promise(r => setTimeout(r, 60));
      pressKeyOn(el, "Enter");
    }
    return { ok: true, filled: describeEl(el), valueLength: value.length, pressedEnter: !!pressEnter };
  }

  function doPress({ key, ref, selector }) {
    const el = resolveTarget({ ref, selector }) || document.activeElement || document.body;
    flashHighlight(el, key);
    pressKeyOn(el, key);
    return { ok: true, pressed: key, on: describeEl(el) };
  }

  function doSelect({ ref, selector, value, label }) {
    const el = resolveTarget({ ref, selector });
    if (!(el instanceof HTMLSelectElement)) return { ok: false, error: "This is not a <select>." };
    let opt = null;
    if (value !== undefined) opt = [...el.options].find(o => o.value === String(value));
    if (!opt && label) opt = [...el.options].find(o => o.textContent.trim().toLowerCase().includes(String(label).toLowerCase()));
    if (!opt) return { ok: false, error: `Option not found (value=${value}, label=${label}). Available: ${[...el.options].map(o => o.textContent.trim()).slice(0, 20).join(" | ")}` };
    el.value = opt.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    flashHighlight(el, "selected");
    return { ok: true, selected: dom.clean(opt.textContent, 60) };
  }

  // Smooth, continuous, human-like scrolling (small steps when the tab is visible; fast
  // jumps + a hard time cap when hidden, so background-tab throttling can't cause a hang).
  async function doScroll({ ref, selector, to, dy }) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    if (ref || selector) {
      const el = resolveTarget({ ref, selector });
      if (!el) return { ok: false, error: "Element not found for scrolling." };
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      await sleep(500);
      return lib.snapshot.pageInfo();
    }
    const docH = () => document.documentElement.scrollHeight;
    const atBottom = () => Math.ceil(scrollY + innerHeight) >= docH() - 2;
    const smallStep = () => Math.max(10, Math.round(innerHeight * 0.02)); // ~human, smooth
    const t0 = Date.now(), HARD_MS = 45000;

    if (to === "top") {
      let g = 0;
      while (scrollY > 0 && g++ < 8000 && (Date.now() - t0) < HARD_MS) {
        const smooth = !document.hidden;
        const before = scrollY;
        scrollBy(0, -(smooth ? smallStep() : Math.round(innerHeight * 0.5)));
        await sleep(smooth ? 22 : 90);
        if (scrollY === before) break;
      }
      await sleep(150);
      return lib.snapshot.pageInfo();
    }
    if (to === "bottom") {
      // Descend continuously; pause at the bottom so lazy-loaded / virtualized content
      // renders, and keep going while the page height grows — stop once it's stable.
      let lastH = -1, stable = 0, g = 0;
      while (g++ < 16000 && (Date.now() - t0) < HARD_MS) {
        const smooth = !document.hidden;
        const before = scrollY;
        scrollBy(0, smooth ? smallStep() : Math.round(innerHeight * 0.5));
        await sleep(smooth ? 22 : 90);
        if (atBottom()) {
          await sleep(750);
          if (docH() === lastH) { if (++stable >= 2) break; } else { stable = 0; }
          lastH = docH();
        } else if (scrollY === before) {
          break;
        }
      }
      await sleep(300);
      return { ...lib.snapshot.pageInfo(), reachedBottom: atBottom() };
    }
    // scroll down by a chunk (dy px, or ~0.6 viewport)
    const target = scrollY + (dy ?? Math.round(innerHeight * 0.6));
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
    return lib.snapshot.pageInfo();
  }

  function doFind({ query, max = 15 }) {
    const q = String(query || "").toLowerCase();
    if (!q) return { ok: false, error: "Provide text to search for." };
    const results = [];
    for (const el of document.querySelectorAll(INTERACTIVE_SEL)) {
      if (!isVisible(el)) continue;
      const name = (accName(el) || "").toLowerCase();
      if (name.includes(q)) {
        results.push(`${refs.refFor(el)} | ${describeEl(el)}${inViewport(el) ? "" : " | off-screen"}`);
        if (results.length >= max) break;
      }
    }
    return { ok: true, matches: results, count: results.length };
  }

  async function doWaitFor({ selector, text, timeoutMs = 8000 }) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (selector) {
        try { if (document.querySelector(selector)) return { ok: true, found: selector, waitedMs: Date.now() - t0 }; } catch {
          return { ok: false, error: "Invalid CSS selector." };
        }
      }
      if (text && document.body?.innerText?.toLowerCase().includes(String(text).toLowerCase())) {
        return { ok: true, found: `text: ${text}`, waitedMs: Date.now() - t0 };
      }
      if (!selector && !text) { await new Promise(r => setTimeout(r, Math.min(timeoutMs, 2000))); return { ok: true, waitedMs: Date.now() - t0 }; }
      await new Promise(r => setTimeout(r, 200));
    }
    return { ok: false, error: `Timed out waiting for (${selector || text}) in ${timeoutMs}ms.` };
  }

  async function doHover({ ref, selector }) {
    const el = resolveTarget({ ref, selector });
    if (!el) return { ok: false, error: `Element not found (${ref || selector}). Take a new snapshot.` };
    el.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(r => setTimeout(r, 80));
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    el.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: "mouse" }));
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: "mouse" }));
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
    flashHighlight(el, "hover");
    return { ok: true, hovered: describeEl(el) };
  }

  // ---------- edge glow / visual indicators (agent working) ----------
  function workingIndicator({ on }) {
    // Send to visual-indicator.js which manages full Claude-style indicators
    if (on) {
      chrome.runtime.sendMessage({ __ocx: true, cmd: 'SHOW_INDICATORS' }).catch(() => {});
    } else {
      chrome.runtime.sendMessage({ __ocx: true, cmd: 'HIDE_INDICATORS' }).catch(() => {});
    }
    // Also keep the legacy glow as a fallback
    let glow = document.getElementById("__ocx_glow");
    if (on && !glow) {
      glow = document.createElement("div");
      glow.id = "__ocx_glow";
      glow.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;
        box-shadow: inset 0 0 26px 6px rgba(232,101,79,.38);
        animation: __ocx_pulse 1.6s ease-in-out infinite;`;
      const style = document.createElement("style");
      style.id = "__ocx_glow_style";
      style.textContent = `@keyframes __ocx_pulse { 50% { opacity: .45; } }`;
      document.documentElement.append(style, glow);
    } else if (!on) {
      glow?.remove();
      document.getElementById("__ocx_glow_style")?.remove();
    }
    return { ok: true };
  }

  // ---------- eval_js ----------
  function evalJs({ code }) {
    if (!code) return { ok: false, error: "No code provided." };
    try {
      const result = new Function(code)();
      return { ok: true, result: result ?? null };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  lib.actions = {
    doClick, doFill, doPress, doSelect, doScroll, doFind, doWaitFor, doHover,
    workingIndicator, evalJs,
  };
})();
