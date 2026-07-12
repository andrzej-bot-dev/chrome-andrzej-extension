// content/ocx/dom-utils.js — element visibility/description helpers, shared
// by the snapshot builder and the action handlers. Part 2 of content.js.

(() => {
  const lib = window.__ocxLib;
  if (!lib) return; // refs.js failed to load / already-installed guard tripped

  const INTERACTIVE_SEL = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]",
    "[role=checkbox]", "[role=radio]", "[role=switch]", "[role=combobox]",
    "[role=option]", "[role=searchbox]", "[role=textbox]",
    "[contenteditable=true]", "[contenteditable=plaintext-only]", "[onclick]", "[tabindex]"
  ].join(",");

  function isVisible(el) {
    if (!el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return false;
    return true;
  }

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  function clean(s, max = 90) {
    if (!s) return "";
    s = s.replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function accName(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const t = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || "").join(" ");
      if (t.trim()) return t;
    }
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab?.textContent?.trim()) return lab.textContent;
    }
    const closestLabel = el.closest("label");
    if (closestLabel?.textContent?.trim()) return closestLabel.textContent;
    return el.getAttribute("placeholder") || el.getAttribute("title") ||
           el.getAttribute("alt") || el.textContent || el.getAttribute("name") || "";
  }

  function describeEl(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const type = el.getAttribute("type");
    let kind = tag;
    if (tag === "input") kind = `input[${type || "text"}]`;
    else if (role) kind = `${tag}(${role})`;
    let desc = `${kind}`;
    const name = clean(accName(el));
    if (name) desc += ` "${name}"`;
    return desc;
  }

  // ---------- highlight / flash feedback ----------
  function flashHighlight(el, label = "") {
    try {
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.style.cssText = `
        position: fixed; z-index: 2147483647; pointer-events: none;
        left: ${r.left - 4}px; top: ${r.top - 4}px;
        width: ${r.width + 8}px; height: ${r.height + 8}px;
        border: 2px solid #e8654f; border-radius: 8px;
        box-shadow: 0 0 0 4px rgba(232,101,79,.25), 0 0 18px rgba(232,101,79,.5);
        transition: opacity .4s ease; opacity: 1;`;
      if (label) {
        const tag = document.createElement("div");
        tag.textContent = label;
        tag.style.cssText = `
          position: absolute; top: -26px; left: 0; background: #e8654f; color: #fff;
          font: 600 11px/1.6 -apple-system, system-ui, sans-serif; padding: 1px 8px;
          border-radius: 6px; white-space: nowrap;`;
        box.appendChild(tag);
      }
      document.documentElement.appendChild(box);
      setTimeout(() => { box.style.opacity = "0"; }, 700);
      setTimeout(() => box.remove(), 1200);
    } catch { /* ignore */ }
  }

  // ---------- low-level event dispatch ----------
  function firePointer(el, type, x, y) {
    const common = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, button: 0, buttons: type.includes("down") ? 1 : 0,
      pointerId: 1, isPrimary: true, pointerType: "mouse"
    };
    if (type.startsWith("pointer")) el.dispatchEvent(new PointerEvent(type, common));
    else el.dispatchEvent(new MouseEvent(type, common));
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
  }

  const KEYMAP = {
    "enter": ["Enter", 13], "tab": ["Tab", 9], "escape": ["Escape", 27], "esc": ["Escape", 27],
    "backspace": ["Backspace", 8], "delete": ["Delete", 46], "space": [" ", 32],
    "arrowup": ["ArrowUp", 38], "arrowdown": ["ArrowDown", 40],
    "arrowleft": ["ArrowLeft", 37], "arrowright": ["ArrowRight", 39],
    "pageup": ["PageUp", 33], "pagedown": ["PageDown", 34],
    "home": ["Home", 36], "end": ["End", 35]
  };

  function pressKeyOn(el, keyName) {
    const norm = String(keyName || "").toLowerCase().replace(/\s/g, "");
    const [key, keyCode] = KEYMAP[norm] || [keyName, 0];
    const opts = { key, code: key === " " ? "Space" : key, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
    // Enter in a form: if the page didn't handle the event, try submitting the form
    if (key === "Enter" && (el instanceof HTMLInputElement) && el.form) {
      const form = el.form;
      setTimeout(() => {
        if (document.contains(form)) form.requestSubmit?.();
      }, 150);
    }
  }

  lib.dom = {
    INTERACTIVE_SEL,
    isVisible, inViewport, clean, accName, describeEl,
    flashHighlight, firePointer, setNativeValue, pressKeyOn,
  };
})();
