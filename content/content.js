// content/content.js — message router: performs actions on the page on
// behalf of the side panel by dispatching to the handlers assembled in
// content/ocx/{refs,dom-utils,snapshot,actions}.js (loaded before this file
// — see manifest.json content_scripts order).
//
// Split out of what used to be one large file so each concern (ref registry,
// DOM helpers, snapshotting, action execution) is easy to find and read.

(() => {
  const lib = window.__ocxLib;
  if (!lib || window.__ocxRouterInstalled) return;
  window.__ocxRouterInstalled = true;

  const { refs, dom, snapshot, actions } = lib;

  // ---------- router ----------
  const HANDLERS = {
    ping: () => ({ ok: true, pong: true }),
    working_indicator: actions.workingIndicator,
    snapshot: snapshot.snapshot,
    get_text: snapshot.getText,
    page_info: snapshot.pageInfo,
    click: actions.doClick,
    fill: actions.doFill,
    press: actions.doPress,
    select_option: actions.doSelect,
    scroll: actions.doScroll,
    find: actions.doFind,
    wait_for: actions.doWaitFor,
    eval_js: actions.evalJs,
    hover: actions.doHover,
    show_indicators: () => {
      chrome.runtime.sendMessage({ __ocx: true, cmd: 'SHOW_INDICATORS' }).catch(() => {});
      return actions.workingIndicator({ on: true });
    },
    hide_indicators: () => {
      chrome.runtime.sendMessage({ __ocx: true, cmd: 'HIDE_INDICATORS' }).catch(() => {});
      return actions.workingIndicator({ on: false });
    },
    update_cursor: ({ x, y }) => {
      chrome.runtime.sendMessage({ __ocx: true, cmd: 'UPDATE_CURSOR', x, y }).catch(() => {});
      return { ok: true };
    },
    show_pill: () => {
      chrome.runtime.sendMessage({ __ocx: true, cmd: 'SHOW_PILL' }).catch(() => {});
      return { ok: true };
    },
    hide_pill: () => {
      chrome.runtime.sendMessage({ __ocx: true, cmd: 'HIDE_PILL' }).catch(() => {});
      return { ok: true };
    },
    highlight: ({ ref, selector, label }) => {
      const el = refs.resolveTarget({ ref, selector });
      if (!el) return { ok: false, error: "Element not found." };
      el.scrollIntoView({ block: "center", behavior: "instant" });
      dom.flashHighlight(el, label || "");
      return { ok: true };
    }
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.__ocx !== true) return false;
    const handler = HANDLERS[msg.cmd];
    if (!handler) { sendResponse({ ok: false, error: `Unknown command: ${msg.cmd}` }); return false; }
    Promise.resolve()
      .then(() => handler(msg.args || {}))
      .then(sendResponse)
      .catch(e => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true; // async response
  });
})();
