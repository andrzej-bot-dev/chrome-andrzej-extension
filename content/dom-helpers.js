// Content script helpers — element discovery, accessibility, and interaction utilities.
// Extracted from content.js for clarity.

const INTERACTIVE_SEL = [
  "a[href]", "button", "input", "select", "textarea", "summary",
  "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]",
  "[role=checkbox]", "[role=radio]", "[role=switch]", "[role=combobox]",
  "[role=option]", "[role=searchbox]", "[role=textbox]",
  "[contenteditable=true]", "[contenteditable=plaintext-only]", "[onclick]", "[tabindex]"
].join(",");

export { INTERACTIVE_SEL };

export function isVisible(el) {
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return false;
  return true;
}

export function inViewport(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}

export function clean(s, max = 90) {
  if (!s) return "";
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function accName(el) {
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

export function describeEl(el) {
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

// ---------- key mapping ----------
const KEYMAP = {
  "enter": ["Enter", 13], "tab": ["Tab", 9], "escape": ["Escape", 27], "esc": ["Escape", 27],
  "backspace": ["Backspace", 8], "delete": ["Delete", 46], "space": [" ", 32],
  "arrowup": ["ArrowUp", 38], "arrowdown": ["ArrowDown", 40],
  "arrowleft": ["ArrowLeft", 37], "arrowright": ["ArrowRight", 39],
  "pageup": ["PageUp", 33], "pagedown": ["PageDown", 34],
  "home": ["Home", 36], "end": ["End", 35]
};

export function pressKeyOn(el, keyName) {
  const norm = String(keyName || "").toLowerCase().replace(/\s/g, "");
  const [key, keyCode] = KEYMAP[norm] || [keyName, 0];
  const opts = { key, code: key === " " ? "Space" : key, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
  if (key === "Enter" && (el instanceof HTMLInputElement) && el.form) {
    const form = el.form;
    setTimeout(() => { if (document.contains(form)) form.requestSubmit?.(); }, 150);
  }
}

export function firePointer(el, type, x, y) {
  const common = {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX: x, clientY: y, button: 0, buttons: type.includes("down") ? 1 : 0,
    pointerId: 1, isPrimary: true, pointerType: "mouse"
  };
  if (type.startsWith("pointer")) el.dispatchEvent(new PointerEvent(type, common));
  else el.dispatchEvent(new MouseEvent(type, common));
}

export function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value); else el.value = value;
}
