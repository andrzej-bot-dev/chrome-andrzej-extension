// Backend management — handles OpenClaw gateway and direct LLM connections.
// Extracted from background.js for clarity.

import { loadSettings, DEFAULTS } from "./settings.js";
import { OpenClawGateway } from "./gateway.js";
import { DirectBackend } from "./direct.js";
import { PROVIDER_PRESETS, getPreset } from "./providers.js";

export class BackendManager {
  constructor({ getSettings, broadcastAll }) {
    this.getSettings = getSettings;
    this.broadcastAll = broadcastAll || (() => {});
    this.gateway = null;
    this.direct = null;
    this.connState = { state: "offline", reason: "" };
    this.keepaliveTimer = null;
    this.connectPromise = null;
  }

  getBackend() {
    const settings = this.getSettings();
    return settings.backendMode === "direct" ? this.direct : this.gateway;
  }

  buildDirect() {
    const settings = this.getSettings();
    const gw = new DirectBackend({
      getSettings: this.getSettings,
      debug: (dir, frame) => {
        if (!settings.debug) return;
        this.broadcastAll({ t: "debug", line: `${dir} ${typeof frame === "string" ? frame : JSON.stringify(frame)}`.slice(0, 1500) });
      },
    });
    gw.addEventListener("status", (e) => {
      if (this.getSettings().backendMode !== "direct") return;
      this.connState = e.detail;
      this.broadcastAll({ t: "conn", ...this.connState });
    });
    return gw;
  }

  buildGateway() {
    const settings = this.getSettings();
    const gw = new OpenClawGateway({
      urls: [settings.gatewayUrl, settings.gatewayUrlRemote].filter(Boolean),
      token: settings.gatewayToken,
      displayName: `Chrome — ${settings.assistantName}`,
      debug: (dir, frame) => {
        if (!settings.debug) return;
        this.broadcastAll({ t: "debug", line: `${dir} ${typeof frame === "string" ? frame : JSON.stringify(frame)}`.slice(0, 1500) });
      },
    });
    gw.addEventListener("status", (e) => {
      if (this.getSettings().backendMode !== "openclaw") return;
      this.connState = e.detail;
      this.broadcastAll({ t: "conn", ...this.connState });
      if (e.detail.state === "online") this.startKeepalive(); else this.stopKeepalive();
    });
    return gw;
  }

  /** Ensures a ready active backend. */
  async ensureBackend(settingsReady) {
    if (settingsReady) await settingsReady;
    const settings = this.getSettings();

    if (settings.backendMode === "direct") {
      this.stopKeepalive();
      if (this.gateway?.connected) this.gateway.close();
      if (!this.direct) this.direct = this.buildDirect();
      this.direct.setSelection(settings.directProvider, settings.directModel);
      const ok = this.direct.ready();
      const label = getPreset(settings.directProvider)?.label || "model";
      this.connState = ok ? { state: "online", reason: label } : { state: "offline", reason: "Add a provider API key in settings." };
      this.broadcastAll({ t: "conn", ...this.connState });
      if (!ok) throw new Error(this.connState.reason);
      return this.direct;
    }

    // openclaw
    this.direct?.close();
    if (this.gateway?.connected) return this.gateway;
    if (this.connectPromise) { await this.connectPromise.catch(() => {}); if (this.gateway?.connected) return this.gateway; }
    if (!settings.gatewayUrl && !settings.gatewayUrlRemote) {
      this.connState = { state: "offline", reason: "Set the OpenClaw gateway address or switch to a model with an API key." };
      this.broadcastAll({ t: "conn", ...this.connState });
      throw new Error(this.connState.reason);
    }
    if (!this.gateway) this.gateway = this.buildGateway();
    this.connectPromise = this.gateway.connect().finally(() => { this.connectPromise = null; });
    await this.connectPromise;
    return this.gateway;
  }

  /** Switch backend/model — immediately in memory + persistently. */
  async applySelection(sel) {
    const settings = this.getSettings();
    const patch = {};
    if (sel.mode) patch.backendMode = sel.mode;
    if (sel.mode === "openclaw") patch.selectedModel = sel.model || "";
    if (sel.mode === "direct") { patch.directProvider = sel.provider || ""; patch.directModel = sel.model || ""; }
    Object.assign(settings, patch);
    await chrome.storage.local.set(patch);
    try { await this.ensureBackend(); } catch { /* status went via broadcast */ }
  }

  /** Model catalog for the panel. */
  async buildCatalog() {
    const s = this.getSettings();
    const groupsOut = [];

    if (s.gatewayUrl || s.gatewayUrlRemote) {
      let models = [];
      if (s.backendMode === "openclaw" && this.gateway?.connected) {
        try { models = await this.gateway.listModels(); } catch { /* offline */ }
      }
      groupsOut.push({ key: "openclaw", label: "OpenClaw 🦞", models: models.map((m) => ({ id: m.id, label: m.alias || m.name || m.id })) });
    }
    for (const p of PROVIDER_PRESETS) {
      if (!s.providerKeys?.[p.id]) continue;
      let models = p.models.map((id) => ({ id, label: id }));
      if (s.backendMode === "direct" && s.directProvider === p.id && this.direct) {
        try { const live = await this.direct.listModels(); if (live.length) models = live.map((m) => ({ id: m.id, label: m.name || m.id })); } catch { /* preset fallback */ }
      }
      groupsOut.push({ key: `direct:${p.id}`, label: p.label, models });
    }

    const active = s.backendMode === "openclaw"
      ? { group: "openclaw", model: s.selectedModel || "" }
      : { group: `direct:${s.directProvider}`, model: s.directModel || s.providerModels?.[s.directProvider] || "" };
    return { groups: groupsOut, active };
  }

  startKeepalive() {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.getSettings().backendMode === "openclaw") this.gateway?.ping();
    }, 25000);
  }

  stopKeepalive() { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }

  closeGateway() {
    this.gateway?.close();
    this.gateway = null;
    this.stopKeepalive();
  }
}
