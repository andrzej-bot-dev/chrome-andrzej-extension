// Gateway helpers — URL normalization, text extraction, error classification,
// frame redaction. Shared between gateway-connection.js and gateway-chat.js.

export function normalizeUrl(url) {
  let u = String(url || "").trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(u)) u = "wss://" + u.slice(8);
  else if (/^http:\/\//i.test(u)) u = "ws://" + u.slice(7);
  if (!/^wss?:\/\//i.test(u)) u = "ws://" + u;
  return u;
}

export function shortUrl(u) {
  return String(u || "").replace(/^wss?:\/\//, "");
}

export function stripDataUrl(dataUrl) {
  const m = /^data:[^;,]+;base64,(.*)$/s.exec(dataUrl || "");
  return m ? m[1] : (dataUrl || "");
}

export function extractText(msg) {
  if (!msg) return null;
  if (typeof msg === "string") return msg;
  if (typeof msg.text === "string") return msg.text;
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    const parts = msg.content.filter(c => c?.type === "text" && typeof c.text === "string").map(c => c.text);
    if (parts.length) return parts.join("\n");
  }
  return null;
}

export function makeGatewayError(error) {
  const e = new Error(error?.message || error?.code || "Unknown gateway error.");
  e.code = error?.code;
  e.details = error?.details;
  e.retryable = error?.retryable;
  return e;
}

export function classifyConnectError(e) {
  const detailsCode = e?.details?.code || "";
  const msg = String(e?.message || e);
  if (e?.code === "NOT_PAIRED" || /PAIRING_REQUIRED|pairing/i.test(detailsCode + " " + msg)) {
    return {
      state: "pairing",
      message: "Device waiting for approval in OpenClaw. On the Raspberry Pi run:  openclaw devices approve --latest  — I'll connect automatically after approval.",
    };
  }
  if (/CONTROL_UI_ORIGIN_NOT_ALLOWED|origin not allowed/i.test(detailsCode + " " + msg)) {
    return {
      state: "offline",
      message: `Gateway rejected the extension Origin. Add "chrome-extension://${chrome.runtime?.id || "<ID>"}" to gateway.controlUi.allowedOrigins in openclaw.json and restart the gateway (see README).`,
    };
  }
  if (/AUTH_TOKEN_MISMATCH|unauthorized|invalid token|auth/i.test(detailsCode + " " + msg)) {
    return {
      state: "offline",
      message: `Wrong gateway token (${msg}). Check: openclaw config get gateway.auth.token`,
    };
  }
  if (/PROTOCOL_MISMATCH|protocol/i.test(detailsCode + " " + msg)) {
    return {
      state: "offline",
      message: `Protocol version mismatch (${msg}). Update OpenClaw on the Raspberry Pi or this extension.`,
    };
  }
  return { state: "offline", message: msg };
}

export function closeReason(ev) {
  if (ev.code === 1006) return "Connection lost (1006) — wrong address/port, gateway not listening on LAN, or firewall blocking the port.";
  if (ev.code === 1008) return `Gateway rejected connection (1008${ev.reason ? ": " + ev.reason : ""}).`;
  return `Connection closed (code ${ev.code}${ev.reason ? ": " + ev.reason : ""}).`;
}

export function redactFrame(frame) {
  try {
    const clone = JSON.parse(JSON.stringify(frame));
    if (clone?.params?.auth?.token) clone.params.auth.token = "•••";
    if (clone?.params?.device?.signature) clone.params.device.signature = "•••";
    if (clone?.params?.attachments) clone.params.attachments = `[${clone.params.attachments.length} attachment(s)]`;
    return clone;
  } catch { return frame; }
}
