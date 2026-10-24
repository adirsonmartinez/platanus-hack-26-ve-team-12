// A tiny Chrome DevTools Protocol client for the app window (Electron started with
// --remote-debugging-port). Used by the video recorder (recordTour.mjs).
export async function connect(port = 9223) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error(`No hay una ventana de Platanus en el puerto ${port}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method) for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
  });
  const call = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  return {
    call,
    on(method, fn) { if (!listeners.has(method)) listeners.set(method, new Set()); listeners.get(method).add(fn); },
    // Runs `expression` in the page and returns its value (awaits promises)
    async evaluate(expression) {
      const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
      return r.result?.result?.value;
    },
    close: () => ws.close(),
  };
}
