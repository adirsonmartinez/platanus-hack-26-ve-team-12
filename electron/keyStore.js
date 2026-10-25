// API keys the person chose to use instead of a subscription login (Claude, ChatGPT · Codex, Grok) and
// the voice keys of the call with Qubi (ElevenLabs; xAI's is the same `grok` key). Saved encrypted with
// the OS keychain (Electron safeStorage) in a 0600 file; the values never leave the main process: the
// window only learns which providers have one and its last four characters. A key reaches its agent CLI
// only as an environment variable of that run (agents.js), and the voice only through keyFor (voiceCall.js).
// Tested in keyStore.test.js.
const fs = require('node:fs');
const path = require('node:path');

// provider -> the variable its CLI reads (verified: `claude --help`, the codex and grok binaries).
// elevenlabs: today's keys are `sk_` + 48 hex characters (checked by shape only, never printed); the
// rule is a bit wider so a future format of the same family still fits.
const KEY_PROVIDERS = {
  claude: { env: 'ANTHROPIC_API_KEY', shape: /^sk-ant-[\w-]{16,}$/ },
  codex: { env: 'OPENAI_API_KEY', shape: /^sk-(?!ant-)[\w-]{16,}$/ },
  grok: { env: 'XAI_API_KEY', shape: /^xai-[\w-]{16,}$/ },
  elevenlabs: { env: 'ELEVENLABS_API_KEY', shape: /^sk_[A-Za-z0-9]{20,200}$/ },
};

// safeStorage's synchronous API is deprecated in Electron 45: the async one is used when it exists,
// and the sync one stays as the fallback (older Electron, test fakes). Data written by the sync API can
// be read by the async one, so keys saved before keep working.
function createCipher(safeStorage) {
  const hasAsync = typeof safeStorage?.encryptStringAsync === 'function';
  return {
    async available() {
      try {
        if (typeof safeStorage?.isAsyncEncryptionAvailable === 'function') return Boolean(await safeStorage.isAsyncEncryptionAvailable());
        return Boolean(safeStorage?.isEncryptionAvailable?.());
      } catch { return false; }
    },
    async encrypt(text) {
      return hasAsync ? safeStorage.encryptStringAsync(text) : safeStorage.encryptString(text);
    },
    // -> { value, reEncrypt } or null
    async decrypt(buffer) {
      if (typeof safeStorage?.decryptStringAsync === 'function') {
        try {
          const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(buffer);
          if (typeof result === 'string') return { value: result, reEncrypt: Boolean(shouldReEncrypt) };
        } catch { /* falls back to the sync API below */ }
      }
      try {
        // read with the old API: written again with the new one so the next read needs no fallback
        const value = safeStorage.decryptString(buffer);
        return typeof value === 'string' ? { value, reEncrypt: hasAsync } : null;
      } catch { return null; }
    },
  };
}

// On Linux without a keyring, safeStorage "encrypts" with a fixed password (basic_text): anyone who reads
// the file reads the key. Then the key lives only in memory for this session and the window is told so.
function weakBackend(safeStorage, platform) {
  if (platform !== 'linux') return false;
  try { return safeStorage?.getSelectedStorageBackend?.() === 'basic_text'; } catch { return false; }
}

// devEnv: the voice variables read in development from .env.local by main (a private object, never
// process.env, so agent CLIs never inherit them). Used only by keyFor.
function createKeyStore({ file, safeStorage, platform = process.platform, env = process.env, devEnv = {} }) {
  const cipher = createCipher(safeStorage);
  const memory = new Map(); // provider -> key, only when the keychain is weak
  const read = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch { return {}; }
  };
  const write = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  };
  const entry = async (key) => ({ data: (await cipher.encrypt(key)).toString('base64'), last4: key.slice(-4) });

  // The saved key of one provider, or null
  async function saved(provider) {
    if (memory.has(provider)) return memory.get(provider);
    const stored = read()[provider];
    if (!stored || typeof stored.data !== 'string') return null;
    const plain = await cipher.decrypt(Buffer.from(stored.data, 'base64'));
    if (!plain?.value) return null;
    if (plain.reEncrypt) {
      try {
        const data = read();
        data[provider] = await entry(plain.value);
        write(data);
      } catch { /* the key still works this time; it is written again on the next read */ }
    }
    return plain.value;
  }

  return {
    // { provider: { last4 } } (never the key)
    list() {
      const listed = Object.entries(read()).filter(([p]) => KEY_PROVIDERS[p]).map(([p, e]) => [p, { last4: e.last4 }]);
      for (const [p, key] of memory) listed.push([p, { last4: key.slice(-4) }]);
      return Object.fromEntries(listed);
    },
    // -> { ok: true, last4, reason?: 'weak-keychain' } or { ok: false, error: 'unknown' | 'shape' | 'no-keychain' }
    // 'weak-keychain': saved only in memory for this session (Linux without a keyring)
    async set(provider, value) {
      const spec = KEY_PROVIDERS[provider];
      if (!spec) return { ok: false, error: 'unknown' };
      const key = String(value ?? '').trim();
      if (!spec.shape.test(key)) return { ok: false, error: 'shape' };
      const last4 = key.slice(-4);
      if (weakBackend(safeStorage, platform)) {
        memory.set(provider, key);
        const data = read();
        if (data[provider]) { delete data[provider]; write(data); } // an older copy would be the weak one
        return { ok: true, last4, reason: 'weak-keychain' };
      }
      if (!(await cipher.available())) return { ok: false, error: 'no-keychain' };
      let saved;
      try { saved = await entry(key); } catch { return { ok: false, error: 'no-keychain' }; }
      const data = read();
      data[provider] = saved;
      write(data);
      memory.delete(provider);
      return { ok: true, last4 };
    },
    remove(provider) {
      memory.delete(provider);
      const data = read();
      delete data[provider];
      write(data);
      return { ok: true };
    },
    // The environment of one run of that provider's CLI (async: the keychain answers asynchronously)
    async envFor(provider) {
      const spec = KEY_PROVIDERS[provider];
      const key = spec && (await saved(provider));
      return key ? { [spec.env]: key } : {};
    },
    // The key for the voice: the keychain first, then the environment, then .env.local (development).
    // -> the key or null. Main hands it only to voiceCall, which never returns or logs it.
    async keyFor(provider) {
      const spec = KEY_PROVIDERS[provider];
      if (!spec) return null;
      const fromStore = await saved(provider);
      if (fromStore) return fromStore;
      const fromEnv = env?.[spec.env] || devEnv?.[spec.env];
      return typeof fromEnv === 'string' && fromEnv.trim() ? fromEnv.trim() : null;
    },
  };
}

module.exports = { createKeyStore, KEY_PROVIDERS };
