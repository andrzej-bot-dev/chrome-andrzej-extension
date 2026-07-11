// Transcript storage — manages conversation history in chrome.storage.local.
// Each session has its own transcript with messages and metadata.
// Extracted from ChatController for clarity.

const MAX_MESSAGES = 200;
const MAX_SESSIONS = 30;

export class TranscriptStore {
  constructor() {
    this._cache = null;
  }

  async loadAll() {
    if (!this._cache) {
      const { transcripts = {} } = await chrome.storage.local.get("transcripts");
      this._cache = transcripts;
    }
    return this._cache;
  }

  async get(sessionKey) {
    const all = await this.loadAll();
    return all[sessionKey] || { title: "", updatedAt: 0, messages: [] };
  }

  async append(sessionKey, entry) {
    if (!sessionKey) return;
    const transcripts = await this.loadAll();
    const t = transcripts[sessionKey] || { title: "", updatedAt: 0, messages: [] };
    t.messages.push(entry);
    if (t.messages.length > MAX_MESSAGES) t.messages = t.messages.slice(-MAX_MESSAGES);
    if (!t.title && entry.role === "user") t.title = String(entry.text || "").slice(0, 60);
    t.updatedAt = Date.now();
    transcripts[sessionKey] = t;
    // Prune old sessions
    const keys = Object.keys(transcripts).sort((a, b) => transcripts[b].updatedAt - transcripts[a].updatedAt);
    for (const k of keys.slice(MAX_SESSIONS)) delete transcripts[k];
    await chrome.storage.local.set({ transcripts });
  }

  async delete(sessionKey) {
    const transcripts = await this.loadAll();
    delete transcripts[sessionKey];
    await chrome.storage.local.set({ transcripts });
  }

  async list() {
    const transcripts = await this.loadAll();
    return Object.entries(transcripts)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([key, t]) => ({ key, title: t.title || "(untitled)", updatedAt: t.updatedAt }));
  }
}
