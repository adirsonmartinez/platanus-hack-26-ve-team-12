// Plays every simulator scenario in the running app and records what the chat did.
//   1. Start the app with the simulator and a debugging port:
//        PLATANUS_SIM=1 npx electron . --remote-debugging-port=9223 --open=<project>
//   2. node scripts/sim/run.mjs [port] [outDir] [project]
//      (project: the folder the app has open; the change scenarios create and delete platanus-sim/ there)
// For each scenario it reloads the window, picks "Simulador", sends the message (or presses the button
// the scenario needs), samples the status pill while it works and saves two screenshots of the chat
// (while working, at the end) plus report.json. The agent that was selected is restored at the end.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { FIXTURE } = createRequire(import.meta.url)('./scenarios.js');

const port = Number(process.argv[2] ?? 9223);
const outDir = path.resolve(process.argv[3] ?? 'sim-report');
const project = path.resolve(process.argv[4] ?? process.cwd());
const fixture = path.join(project, FIXTURE.path);
fs.mkdirSync(outDir, { recursive: true });

const SCENARIOS = [
  { name: 'revision', title: 'Revisión simple', send: '[sim:revision] ¿Mi vercel.json es seguro?' },
  { name: 'ayudantes', title: 'Ayudantes (subagente con pasos)', send: '[sim:ayudantes] Audita mi configuración' },
  { name: 'error', title: 'Una herramienta falla', send: '[sim:error] Revisa no-existe.js' },
  { name: 'secreto', title: 'Archivo secreto rechazado', send: '[sim:secreto] Lee mi .env' },
  { name: 'aprobacion', title: 'Cambio que espera tu aprobación (Manual)', send: '[sim:aprobacion] Actualiza la nota de prueba', midState: 'listening', fixture: true },
  { name: 'cambio', title: 'Cambio aplicado en vivo (Dev, permisos en Auto)', send: '[sim:cambio] Actualiza la nota de prueba', fixture: true, mode: 'tech', approval: 'auto' },
  { name: 'largo', title: 'Respuesta larga con código', send: '[sim:largo] ¿Cómo agrego una lista de sitios permitidos?' },
  { name: 'caida', title: 'El agente se cae a mitad de camino', send: '[sim:caida] Revisa todo' },
  { name: 'reparacion', title: 'Reparación con Qubi (falsa alarma)', button: 'Reparar lo más grave' },
  { name: 'mejorar', title: 'Mejorar mi mensaje', improve: 'arregla vercel.json para que sea mas seguro' },
];

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
});
const call = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (fn, ...args) => {
  const r = await call('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result?.result?.value;
};
async function shot(file) {
  const rect = await evaluate(() => { const r = document.getElementById('chat').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const r = await call('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
  fs.writeFileSync(path.join(outDir, file), Buffer.from(r.result.data, 'base64'));
}

await call('Runtime.enable');
await call('Page.enable');
const before = await evaluate(() => localStorage.getItem('platanus.agent.choice.v1'));
const report = [];

for (const sc of SCENARIOS) {
  await call('Page.reload', { ignoreCache: true });
  await sleep(5000);
  // pick the simulator in "Quién responde"
  const picked = await evaluate(async () => {
    document.querySelector('.picker-pill').click();
    await new Promise((r) => setTimeout(r, 300));
    // it may be folded under "Ver más agentes"
    document.querySelectorAll('.picker-menu details').forEach((d) => { d.open = true; });
    await new Promise((r) => setTimeout(r, 200));
    const option = [...document.querySelectorAll('.picker-menu .pick-agent:not(.external)')].find((b) => /Simulador/.test(b.textContent));
    option?.querySelector('.pick-agent-main')?.click();
    document.body.click();
    return Boolean(option);
  });
  if (!picked) { report.push({ ...sc, error: 'No aparece "Simulador": inicia la app con PLATANUS_SIM=1' }); break; }
  await sleep(400);
  if (sc.fixture) { fs.mkdirSync(path.dirname(fixture), { recursive: true }); fs.writeFileSync(fixture, FIXTURE.before); }
  // the scenario's mode and permissions (put back afterwards)
  await evaluate(async (s) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector(`#chat .voice-switch [data-mode="${s.mode ?? 'vibe'}"]`)?.click();
    if (s.approval) {
      document.querySelector('.picker-pill').click();
      await wait(250);
      [...document.querySelectorAll('.segmented.permissions button')].find((b) => b.classList.contains(s.approval))?.click();
      await wait(250);
      document.body.click();
    }
  }, sc);
  await sleep(300);
  const start = Date.now();
  await evaluate(async (s) => {
    const ta = document.querySelector('#chat-text');
    if (s.button) [...document.querySelectorAll('#chat button')].find((b) => b.textContent.trim() === s.button)?.click();
    else if (s.improve) {
      ta.value = s.improve; ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.composer-improve').click();
    } else {
      ta.value = s.send; ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#chat-form').requestSubmit();
    }
  }, sc);

  // sample what the chat shows while it works
  const timeline = [];
  let midTaken = false;
  for (let i = 0; i < 160; i++) {
    await sleep(200);
    const now = await evaluate(() => {
      const pill = [...document.querySelectorAll('#chat .orb-pill, #chat .assist-row.working, #chat .msg.typing .typing-orb')].pop();
      const running = Boolean(document.querySelector('#chat .msg.run .orb-pill, #chat .assist-row.working, #chat .msg.typing'));
      return { state: pill?.dataset.state ?? (pill ? 'orb' : null), text: pill?.textContent ?? '', running };
    });
    if (now.state && timeline.at(-1)?.text !== now.text) timeline.push({ at: Date.now() - start, state: now.state, text: now.text });
    if (!midTaken && now.state && (sc.midState ? now.state === sc.midState : timeline.length >= 2)) { await shot(`${sc.name}-1.png`); midTaken = true; }
    if (i > 8 && !now.running) break;
  }
  if (!midTaken) await shot(`${sc.name}-1.png`);
  await sleep(700);
  await evaluate(() => { document.querySelector('#chat .chat-body').scrollTop = 1e6; });
  await sleep(300);
  await shot(`${sc.name}-2.png`);
  const end = await evaluate(() => ({
    cards: [...document.querySelectorAll('#chat .chat-body > .msg')].map((m) => m.className.replace(/^msg /, '')),
    steps: [...document.querySelectorAll('#chat .story-step, #chat .run-step')].map((s) => `${s.className.split(' ').at(-1)} · ${s.textContent.trim()}`),
    status: document.querySelector('#chat .msg.run:last-of-type .story-now, #chat .msg.run:last-of-type .run-state')?.textContent ?? '',
    error: document.querySelector('#chat .run-error')?.textContent ?? '',
    chips: [...document.querySelectorAll('#chat .chips .chip')].map((c) => c.textContent),
    draft: document.querySelector('#chat-text').value.slice(0, 400),
  }));
  end.diff = await evaluate(() => [...document.querySelectorAll('#chat .run-diff')].map((d) => `${d.className} · ${d.querySelector('summary')?.textContent}`));
  end.fixtureAfter = sc.fixture && fs.existsSync(fixture) ? fs.readFileSync(fixture, 'utf8') : null;
  // put back Vibe and Manual
  await evaluate(async (s) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('#chat .voice-switch [data-mode="vibe"]')?.click();
    if (s.approval) {
      document.querySelector('.picker-pill').click();
      await wait(250);
      [...document.querySelectorAll('.segmented.permissions button')].find((b) => b.classList.contains('manual'))?.click();
      await wait(250);
      document.body.click();
    }
  }, sc);
  if (sc.fixture) fs.rmSync(path.dirname(fixture), { recursive: true, force: true });
  report.push({ ...sc, ms: Date.now() - start, timeline, ...end });
  console.log(`${sc.name}: ${timeline.map((t) => t.state).join(' → ') || '(sin orbe)'} · ${end.status || end.error}`);
}

// put back the agent the person had chosen
await evaluate((choice) => { if (choice) localStorage.setItem('platanus.agent.choice.v1', choice); }, before);
await call('Page.reload', { ignoreCache: true });
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ errors, report }, null, 2));
console.log(`\n${report.length} escenarios · errores de la ventana: ${errors.length} · ${outDir}`);
ws.close();
