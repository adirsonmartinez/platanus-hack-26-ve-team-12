// Services the project uses: one chat card per project and session, the robot's suggestion, the
// connect modal and "Ya lo conecté" (docs/features/servicios/README.md).
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectModel } from '../../renderer/models/projectModel.js';
import { ServicesViewModel, servicesApi } from '../../renderer/viewmodels/servicesViewModel.js';
import { ChatViewModel } from '../../renderer/viewmodels/chatViewModel.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { strings } from '../../renderer/i18n/es.js';
import { createRequire } from 'node:module';

// main's own catalog (CommonJS): the shape the window really gets from services:catalog
const { publicCatalog } = createRequire(import.meta.url)('../../electron/serviceCatalog.js');

const S = strings.services;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

const CATALOG = {
  stripe: {
    name: 'Stripe',
    cli: { bin: 'stripe', install: 'brew install stripe/stripe-cli/stripe', login: 'stripe login', docs: 'https://docs.stripe.com/stripe-cli' },
    // the shape of main's publicCatalog(): one command per agent under mcp.commands
    mcp: { name: 'stripe', docs: 'https://docs.stripe.com/mcp', url: 'https://mcp.stripe.com/', commands: { claude: 'claude mcp add --transport http stripe https://mcp.stripe.com/', codex: 'codex mcp add stripe', grok: null, opencode: null } },
    dashboard: 'https://dashboard.stripe.com',
  },
  supabase: { name: 'Supabase', cli: { bin: 'supabase', install: 'npm i -g supabase', login: 'supabase login', docs: 'https://supabase.com/docs' }, mcp: null, dashboard: 'https://supabase.com/dashboard' },
};

// A project on disk whose services main reports; `states` can change between detections
function setup({ name = 'tienda', root = `/tmp/${name}`, states = { supabase: 'connected', stripe: 'disconnected' }, selected = 'claude', clipboard, vmFirst = false } = {}) {
  const calls = { detect: 0, refresh: 0, catalog: 0, links: [] };
  const current = { states };
  const services = {
    detect: async () => {
      calls.detect += 1;
      return { ok: true, data: Object.entries(current.states).map(([key, state]) => ({ key, name: CATALOG[key]?.name ?? key, state, via: state === 'connected' ? ['cli'] : [], evidence: [`package.json: ${key}`] })) };
    },
  };
  const workspace = {
    choose: async () => ({ ok: true, data: { name, root } }),
    openRecent: async (r) => ({ ok: true, data: { name: r.split('/').at(-1), root: r } }),
    tree: async () => ({ ok: true, data: [] }),
    read: async () => ({ ok: false }),
    close: async () => ({ ok: true }),
  };
  const projectModel = new ProjectModel(workspace, { services });
  const bus = createEventBus();
  // like main.js: a project that opens announces itself on the bus (before or after the view model hears it)
  const announce = () => projectModel.store.subscribe((state, previous) => {
    if (previous && state.session !== previous.session && state.open) bus.emit(EVENTS.projectOpened, { name: state.name });
  });
  if (!vmFirst) announce();
  const chat = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus });
  const said = [];
  const api = {
    available: true,
    catalog: async () => { calls.catalog += 1; return { ok: true, data: CATALOG }; },
    refresh: async () => { calls.refresh += 1; return { ok: true }; },
    openLink: async (url) => { calls.links.push(url); return { ok: true }; },
  };
  const connection = { store: { state: { selected } } };
  const copied = [];
  const vm = new ServicesViewModel({
    projectModel, bus, chat, api, connection,
    say: (text, actions) => said.push({ text, actions }),
    clipboard: clipboard ?? { writeText: async (text) => { copied.push(text); } },
  });
  if (vmFirst) announce();
  return { vm, projectModel, chat, bus, said, calls, current, copied };
}
const cards = (chat) => chat.store.state.messages.filter((m) => m.card?.kind === 'services');

test('opening a project with something offline adds one services card and the robot suggests connecting it', async () => {
  const { vm, projectModel, chat, said } = setup();
  await projectModel.choose();
  await flush();
  assert.deepEqual(vm.store.state.services.map((s) => [s.key, s.name, s.state]), [['supabase', 'Supabase', 'connected'], ['stripe', 'Stripe', 'disconnected']]);
  const list = cards(chat);
  assert.equal(list.length, 1);
  const card = list[0].card;
  assert.equal(card.project, 'tienda');
  assert.deepEqual(card.services.map((s) => [s.key, s.name, s.state]), [['supabase', 'Supabase', 'connected'], ['stripe', 'Stripe', 'disconnected']]);
  // only what is missing gets a "Conectar" button, and it opens its modal
  assert.equal(card.services[0].connect, undefined);
  assert.equal(card.services[1].connect.label, S.connect);
  assert.equal(card.services[1].connect.quiet, true);
  card.services[1].connect.run();
  await flush();
  assert.equal(vm.store.state.open, 'stripe');
  // the robot's bubble: short, with its button
  assert.equal(said.length, 1);
  assert.equal(said[0].text, S.bubble(['Stripe']));
  assert.equal(said[0].actions[0].label, S.connect);
});

test('one card per project per session: reopening the same project does not repeat it', async () => {
  const { projectModel, chat, said } = setup();
  await projectModel.choose();
  await flush();
  await projectModel.openRecent('/tmp/tienda');
  await flush();
  assert.equal(cards(chat).length, 1);
  assert.equal(said.length, 1);
  // another project with something offline does get its own
  await projectModel.openRecent('/tmp/otra');
  await flush();
  assert.equal(cards(chat).length, 2);
  assert.equal(said.length, 2);
});

test('nothing offline: no card and no bubble', async () => {
  const { projectModel, chat, said } = setup({ states: { supabase: 'connected' } });
  await projectModel.choose();
  await flush();
  assert.equal(cards(chat).length, 0);
  assert.equal(said.length, 0);
});

test('a project that adds an offline service later gets its card then, once', async () => {
  const { projectModel, chat, said, current } = setup({ states: { supabase: 'connected' } });
  await projectModel.choose();
  await flush();
  assert.equal(cards(chat).length, 0);
  current.states = { supabase: 'connected', stripe: 'disconnected' }; // the person added Stripe
  await projectModel.reload();
  await projectModel.reload();
  assert.equal(cards(chat).length, 1);
  assert.equal(said.length, 1);
});

test('the card comes after the greeting even if the view model hears about the project first', async () => {
  const { projectModel, chat, said } = setup({ vmFirst: true });
  // the greeting ("Abriste …") is posted by the chat on projectOpened; the card must follow it
  await projectModel.choose();
  await flush();
  const kinds = chat.store.state.messages.map((m) => m.card?.kind ?? m.role);
  assert.deepEqual(kinds, ['sys', 'services']);
  assert.equal(said.length, 1);
});

test('"could not check" alone does not nag, but the card shows it when it appears', async () => {
  const { projectModel, chat, said } = setup({ states: { sentry: 'unknown' } });
  await projectModel.choose();
  await flush();
  assert.equal(cards(chat).length, 0);
  assert.equal(said.length, 0);
  const both = setup({ states: { sentry: 'unknown', stripe: 'disconnected' } });
  await both.projectModel.choose();
  await flush();
  const card = cards(both.chat)[0].card;
  assert.equal(card.services.find((s) => s.key === 'sentry').state, 'unknown');
  assert.ok(card.services.find((s) => s.key === 'sentry').connect); // it can still be connected by hand
  assert.equal(both.said[0].text, S.bubble(['Stripe'])); // the bubble names only what is offline
});

test('several offline: the bubble names them all and its button opens the first one', async () => {
  const { vm, projectModel, said } = setup({ states: { stripe: 'disconnected', supabase: 'disconnected' } });
  await projectModel.choose();
  await flush();
  assert.equal(said[0].text, S.bubble(['Stripe', 'Supabase']));
  said[0].actions[0].run();
  await flush();
  assert.equal(vm.store.state.open, 'stripe');
});

test('openConnect loads the catalog once; close empties the modal', async () => {
  const { vm, projectModel, calls } = setup();
  await projectModel.choose();
  await vm.openConnect('stripe');
  await vm.openConnect('supabase');
  assert.equal(calls.catalog, 1);
  assert.equal(vm.store.state.open, 'supabase');
  assert.equal(vm.store.state.catalog.stripe.name, 'Stripe');
  vm.close();
  assert.equal(vm.store.state.open, null);
});

test('connectInfo: the CLI steps and the MCP command for the agent chosen in the chat', async () => {
  const { vm, projectModel } = setup({ selected: 'codex' });
  await projectModel.choose();
  await vm.openConnect('stripe');
  const info = vm.connectInfo('stripe');
  assert.equal(info.name, 'Stripe');
  assert.equal(info.title, S.modal.title('Stripe'));
  assert.equal(info.intro, S.modal.intro('Stripe'));
  assert.deepEqual(info.cli.steps.map((s) => [s.id, s.label, s.command]), [['install', S.steps.install, 'brew install stripe/stripe-cli/stripe'], ['login', S.steps.login, 'stripe login']]);
  assert.equal(info.cli.docs, 'https://docs.stripe.com/stripe-cli');
  assert.equal(info.mcp.agent, 'codex');
  assert.equal(info.mcp.agentName, S.agents.codex);
  assert.equal(info.mcp.command, 'codex mcp add stripe');
  assert.deepEqual(info.mcp.agents, ['claude', 'codex', 'grok', 'opencode']);
  assert.deepEqual(info.mcp.ready, ['claude', 'codex']);
  // another agent with no ready command: no command, the MCP page instead
  vm.setAgent('grok');
  const grok = vm.connectInfo('stripe');
  assert.equal(grok.mcp.command, null);
  assert.equal(grok.mcp.missing, S.noCommand(S.agents.grok));
  assert.equal(grok.mcp.docs, 'https://docs.stripe.com/mcp');
  // a service with no official MCP says so
  assert.equal(vm.connectInfo('supabase').mcp, null);
  assert.deepEqual(vm.connectInfo('supabase').evidence, ['package.json: supabase']);
});

test('connectInfo reads the catalog exactly as main sends it (publicCatalog)', async () => {
  const real = publicCatalog();
  const { vm, projectModel } = setup({ selected: 'claude' });
  vm.store.set({ catalog: real });
  await projectModel.choose();
  for (const key of ['stripe', 'supabase', 'vercel']) {
    const info = vm.connectInfo(key);
    assert.equal(info.mcp.command, real[key].mcp.commands.claude, key);
    assert.ok(info.mcp.command, `${key} has a command to copy`);
    assert.deepEqual(info.mcp.ready, ['claude', 'codex', 'grok', 'opencode'].filter((a) => real[key].mcp.commands[a]));
    assert.equal(info.mcp.missing, null);
  }
});

test('connectInfo: an agent that is not one of the four (the Simulator) falls back to Claude Code', async () => {
  const { vm, projectModel } = setup({ selected: 'sim' });
  await projectModel.choose();
  await vm.openConnect('stripe');
  assert.equal(vm.connectInfo('stripe').mcp.agent, 'claude');
});

test('connectInfo: "could not check" explains it differently; unknown keys still get a name', async () => {
  const { vm, projectModel } = setup({ states: { sentry: 'unknown' } });
  await projectModel.choose();
  await vm.openConnect('sentry');
  const info = vm.connectInfo('sentry');
  assert.equal(info.name, 'sentry');
  assert.equal(info.intro, S.modal.unknown('sentry'));
  assert.equal(info.cli, null);
  assert.equal(info.mcp, null);
});

test('"Ya lo conecté": refresh asks main again, the card and the map update, and the modal closes', async () => {
  const { vm, projectModel, chat, current, calls, said } = setup();
  await projectModel.choose();
  await flush();
  await vm.openConnect('stripe');
  current.states = { supabase: 'connected', stripe: 'connected' };
  const checking = vm.refresh();
  assert.equal(vm.store.state.checking, true);
  await checking;
  assert.equal(calls.refresh, 1);
  assert.equal(vm.store.state.checking, false);
  assert.equal(vm.store.state.services.find((s) => s.key === 'stripe').state, 'connected');
  assert.equal(projectModel.store.state.integrationStatus.stripe, 'connected');
  const card = cards(chat);
  assert.equal(card.length, 1); // the same card, updated in place
  assert.equal(card[0].card.services.find((s) => s.key === 'stripe').state, 'connected');
  assert.equal(card[0].card.services.find((s) => s.key === 'stripe').connect, undefined);
  assert.equal(vm.store.state.open, null);
  assert.equal(vm.store.state.notice.text, S.nowConnected('Stripe'));
  assert.equal(said.at(-1).text, S.nowConnected('Stripe'));
});

test('"Ya lo conecté" while it is still offline: the modal stays with a hint', async () => {
  const { vm, projectModel } = setup();
  await projectModel.choose();
  await flush();
  await vm.openConnect('stripe');
  await vm.refresh();
  assert.equal(vm.store.state.open, 'stripe');
  assert.deepEqual(vm.store.state.notice, { tone: 'warn', text: S.stillOffline('Stripe') });
  // opening another one clears the hint
  await vm.openConnect('supabase');
  assert.equal(vm.store.state.notice, null);
});

test('copy writes to the clipboard and marks what was copied for a moment', async () => {
  const { vm, copied } = setup();
  assert.equal(await vm.copy('stripe login'), true);
  assert.deepEqual(copied, ['stripe login']);
  assert.equal(vm.store.state.copied, 'stripe login');
  const failing = setup({ clipboard: { writeText: async () => { throw new Error('denied'); } } });
  assert.equal(await failing.vm.copy('x'), false);
  assert.equal(failing.vm.store.state.copied, null);
});

test('openLink goes through main (it only opens the catalog URLs) and says so when it cannot', async () => {
  const { vm, calls } = setup();
  assert.equal(await vm.openLink('https://docs.stripe.com/mcp'), true);
  assert.deepEqual(calls.links, ['https://docs.stripe.com/mcp']);
  const refused = setup();
  const api = { catalog: async () => ({ ok: true, data: {} }), refresh: async () => ({ ok: true }), openLink: async () => ({ ok: false }) };
  const vm2 = new ServicesViewModel({ projectModel: refused.projectModel, bus: createEventBus(), chat: refused.chat, api });
  assert.equal(await vm2.openLink('https://evil.example'), false);
  assert.deepEqual(vm2.store.state.notice, { tone: 'warn', text: strings.voiceConnect.errors.link });
});

test('closing the project empties the list and closes the modal', async () => {
  const { vm, projectModel } = setup();
  await projectModel.choose();
  await vm.openConnect('stripe');
  await projectModel.close();
  assert.deepEqual(vm.store.state.services, []);
  assert.equal(vm.store.state.open, null);
});

test('a new chat dropped the card: a later change does not bring it back', async () => {
  const { vm, projectModel, chat, current } = setup();
  await projectModel.choose();
  await flush();
  chat.newChat();
  current.states = { supabase: 'connected', stripe: 'connected' };
  await vm.refresh();
  assert.equal(cards(chat).length, 0);
});

test('servicesApi: the desktop bridge, or safe answers in the web version', async () => {
  const opened = [];
  const bridge = {
    services: { catalog: async () => ({ ok: true, data: CATALOG }), refresh: async () => ({ ok: true }) },
    links: { open: async (url) => { opened.push(url); return { ok: true }; } },
  };
  const desktop = servicesApi(bridge);
  assert.equal(desktop.available, true);
  assert.equal((await desktop.catalog()).data.stripe.name, 'Stripe');
  assert.deepEqual(await desktop.openLink('https://docs.stripe.com/mcp'), { ok: true });
  assert.deepEqual(opened, ['https://docs.stripe.com/mcp']);
  const web = servicesApi(null);
  assert.equal(web.available, false);
  assert.deepEqual((await web.catalog()).data, {});
  assert.equal((await web.refresh()).ok, true);
  // the web version never opens anything that is not https
  assert.equal((await web.openLink('javascript:alert(1)')).ok, false);
});

test('a catalog that fails to load is asked again next time', async () => {
  const { projectModel, chat } = setup();
  let fail = true;
  const api = { catalog: async () => (fail ? { ok: false } : { ok: true, data: CATALOG }), refresh: async () => ({ ok: true }), openLink: async () => ({ ok: true }) };
  const vm = new ServicesViewModel({ projectModel, bus: createEventBus(), chat, api });
  await vm.openConnect('stripe');
  assert.deepEqual(vm.store.state.catalog, {});
  assert.equal(vm.connectInfo('stripe').cli, null);
  fail = false;
  await vm.openConnect('stripe');
  assert.equal(vm.store.state.catalog.stripe.name, 'Stripe');
});
