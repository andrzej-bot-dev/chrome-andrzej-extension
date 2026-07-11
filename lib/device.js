// Device identity for the OpenClaw gateway (protocol v4).
// Ed25519: deviceId = sha256(hex) of the raw public key (32 B),
// public key as base64url, signature base64url over payload "v3".
// Keys are stored in chrome.storage.local (JWK), so the identity is persistent —
// the gateway pairs the device once and remembers it.

const te = new TextEncoder();

function b64uFromBytes(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function bytesFromB64u(b64u) {
  const b64 = b64u.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - b64u.length % 4) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generate() {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pubJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privJwk, pubJwk };
}

/** Loads (or creates and stores) a device identity. */
export async function loadOrCreateDeviceIdentity() {
  let { deviceIdentity } = await chrome.storage.local.get("deviceIdentity");
  if (!deviceIdentity?.privJwk?.x || !deviceIdentity?.pubJwk?.x) {
    deviceIdentity = await generate();
    await chrome.storage.local.set({ deviceIdentity });
  }
  const publicKeyRaw = bytesFromB64u(deviceIdentity.pubJwk.x); // OKP: x = raw key
  const deviceId = await sha256Hex(publicKeyRaw);
  const privateKey = await crypto.subtle.importKey(
    "jwk", deviceIdentity.privJwk, "Ed25519", false, ["sign"]
  );
  return {
    deviceId,
    publicKeyB64u: deviceIdentity.pubJwk.x,
    privateKey,
  };
}

/**
 * Signature payload in v3 format (packages/gateway-client/src/device-auth.ts):
 * v3|deviceId|clientId|clientMode|role|scope1,scope2|signedAtMs|token|nonce|platform|deviceFamily
 * (platform and deviceFamily in lowercase)
 */
export function buildDeviceAuthPayloadV3({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce, platform, deviceFamily }) {
  const lc = (s) => (s || "").trim().toLowerCase();
  return [
    "v3", deviceId, clientId, clientMode, role,
    (scopes || []).join(","), String(signedAtMs), token ?? "", nonce,
    lc(platform), lc(deviceFamily),
  ].join("|");
}

export async function signDevicePayload(privateKey, payload) {
  const sig = await crypto.subtle.sign("Ed25519", privateKey, te.encode(payload));
  return b64uFromBytes(sig);
}
