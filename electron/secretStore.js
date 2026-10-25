// Small encrypted store for the main process (the accounts connected with "Conectar mi cuenta": OAuth
// tokens and client registration). Encrypted with the OS keychain (Electron safeStorage) in a 0600 file;
// nothing here ever reaches the window. Tested in secretStore.test.js.
const fs = require('node:fs');
const path = require('node:path');

function createSecretStore({ file, safeStorage }) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  const write = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  };
  return {
    get(name) {
      const entry = read()[name];
      if (!entry) return null;
      try { return JSON.parse(safeStorage.decryptString(Buffer.from(entry, 'base64'))); } catch { return null; }
    },
    // false when the keychain is not available (nothing is saved in plain text)
    set(name, value) {
      if (!safeStorage?.isEncryptionAvailable?.()) return false;
      const data = read();
      data[name] = safeStorage.encryptString(JSON.stringify(value)).toString('base64');
      write(data);
      return true;
    },
    remove(name) {
      const data = read();
      if (!(name in data)) return;
      delete data[name];
      write(data);
    },
  };
}

module.exports = { createSecretStore };
