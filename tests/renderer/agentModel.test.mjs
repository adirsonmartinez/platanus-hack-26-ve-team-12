import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentModel } from '../../renderer/models/agentModel.js';
import { strings } from '../../renderer/i18n/es.js';

const W = strings.map.welcome;

function setup({ live = true } = {}) {
  const asked = [];
  const commits = [];
  const model = new AgentModel({
    workspace: { isDesktop: true, current: async () => ({ data: { root: '/p' } }) },
    projectModel: { store: { state: { open: true } } },
    supabaseModel: { vulnerable: false },
    connection: { live, ask: async (text) => { asked.push(text); return { text: 'agent' }; } },
    modeModel: { tech: false },
    gitService: { isDesktop: true, commit: async (message) => { commits.push(message); return { ok: true }; } },
  });
  return { model, asked, commits };
}

test('with an agent connected, a git command typed in the chat still runs git (the agent has no git tools)', async () => {
  const { model, asked, commits } = setup();
  const reply = await model.reply('haz un commit que se llame primera versión');
  assert.deepEqual(commits, ['primera versión']);
  assert.deepEqual(asked, []);
  assert.match(reply.text, /primera versión/);
});

test('the robot\'s "save my progress" phrase is a commit with a plain name', async () => {
  const { model, commits } = setup();
  await model.reply(W.saveProgressPhrase);
  assert.deepEqual(commits, ['Primera versión']);
});

test('with an agent connected, everyday requests that only sound like git go to the agent', async () => {
  const { model, asked, commits } = setup();
  for (const text of [
    'deshaz el último cambio que hiciste en el CSS',
    'quiero que el botón guarde todos los cambios del formulario en la base de datos y muestre un mensaje',
    '¿qué es un commit?',
  ]) await model.reply(text);
  assert.deepEqual(commits, []);
  assert.equal(asked.length, 3);
});

test('the robot\'s requests to the agent are never mistaken for git commands', async () => {
  const { model, asked, commits } = setup();
  for (const text of [
    W.scaffoldPrompt(['nextjs', 'vercel', 'supabase'], ['Next.js', 'Vercel', 'Supabase']), W.scaffoldPrompt(['nextjs'], ['Next.js']),
    W.tips.gitignore.prompt, W.tips.readme.prompt,
  ]) await model.reply(text);
  assert.deepEqual(commits, []);
  assert.equal(asked.length, 4);
});

test('without an agent, the scripted chat keeps understanding git as before', async () => {
  const { model, commits } = setup({ live: false });
  await model.reply('guarda mis cambios con el nombre login listo');
  assert.deepEqual(commits, ['login listo']);
});
