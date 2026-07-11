// Common settings (chrome.storage.local) for the panel and options page.

export const DEFAULTS = {
  gatewayUrl: "ws://raspberrypi.local:18789",
  gatewayUrlRemote: "",        // e.g. wss://openclaw.codingwithdawid.com — tried when local doesn't respond
  gatewayToken: "",
  assistantName: "Andrzej",
  selectedModel: "",           // last selected OpenClaw model ("" = gateway default)
  actionMode: "auto",           // "ask" | "auto" — auto by default
  maxSteps: 15,
  allowScreenshots: true,
  debug: false,
  allowedSites: [],            // origins with autopilot enabled
  sessionKey: "",              // current session

  // backend mode: "openclaw" (gateway on Raspberry Pi) or "direct" (LLM via API)
  backendMode: "openclaw",
  directProvider: "",          // provider id in direct mode (e.g. "anthropic")
  directModel: "",             // provider model in direct mode
  directMaxTokens: 8192,       // response token limit in direct mode
  providerKeys: {},            // { providerId: apiKey }
  providerModels: {},          // { providerId: selected model } — from provider's model list
  providerBaseUrls: {},        // { providerId: overridden baseUrl } (advanced)
};

export async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}

export function onSettingsChanged(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") cb(changes);
  });
}
