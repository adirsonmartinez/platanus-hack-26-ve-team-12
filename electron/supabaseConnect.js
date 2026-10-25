// "Conectar mi cuenta" for Supabase: Platanus itself (not the agent) talks to Supabase's official MCP server
// (https://mcp.supabase.com/mcp) as an OAuth client. Signing in opens the person's browser; Supabase sends
// the code back to a loopback address (127.0.0.1) that only lives while waiting for it. The client
// registration and the tokens are kept encrypted (secretStore.js). The calls are fixed and few: list the
// organizations and projects, ask what a new project costs and confirm it (only after the person agreed),
// create the project, check it, read its URL and public key, and the database panel's numbers (two fixed,
// read-only queries). main.js asks the
// person before creating or connecting anything and writes the keys itself.
const http = require('node:http');
const crypto = require('node:crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { UnauthorizedError } = require('@modelcontextprotocol/sdk/client/auth.js');
const { readToolJson, readToolUrl, readSqlRows, readStats, STATS_SQL, listOf, itemOf, readCost, pickPublicKey, REGION } = require('./supabaseLink');

const MCP_URL = 'https://mcp.supabase.com/mcp';
const CALLBACK = { host: '127.0.0.1', port: 45789, path: '/supabase/callback' };
const REDIRECT_URL = `http://${CALLBACK.host}:${CALLBACK.port}${CALLBACK.path}`;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const STORE_KEY = 'supabase';

// store: secretStore; openExternal(url): the default browser; page(ok): the HTML shown after signing in
function createSupabaseConnector({ store, openExternal, page, version = '0.0.0' }) {
  let client = null;
  let verifier = null;
  let state = null;
  let waiting = null; // { promise } while a sign-in waits for its code

  const saved = () => store.get(STORE_KEY) ?? {};
  const save = (patch) => store.set(STORE_KEY, { ...saved(), ...patch });

  // The loopback page that receives ?code=…&state=… once; it closes itself after the answer or the timeout
  function waitForCode() {
    let server;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { server?.close(); reject(new Error('timeout')); }, SIGN_IN_TIMEOUT_MS);
      server = http.createServer((req, res) => {
        const url = new URL(req.url, REDIRECT_URL);
        if (url.pathname !== CALLBACK.path) { res.writeHead(404).end(); return; }
        const code = url.searchParams.get('code');
        const ok = Boolean(code) && url.searchParams.get('state') === state;
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(ok));
        clearTimeout(timer);
        server.close();
        if (ok) resolve(code);
        else reject(new Error(url.searchParams.get('error_description') || url.searchParams.get('error') || 'denied'));
      });
      server.on('error', (err) => { clearTimeout(timer); reject(err); });
      server.listen(CALLBACK.port, CALLBACK.host);
    });
    return { promise };
  }

  const provider = {
    get redirectUrl() { return REDIRECT_URL; },
    get clientMetadata() {
      return {
        client_name: 'Platanus',
        redirect_uris: [REDIRECT_URL],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none', // a desktop app keeps no client secret
      };
    },
    state: () => (state = crypto.randomBytes(16).toString('hex')),
    clientInformation: () => saved().client,
    saveClientInformation: (info) => save({ client: info }),
    tokens: () => saved().tokens,
    saveTokens: (tokens) => save({ tokens }),
    redirectToAuthorization: async (url) => {
      waiting = waitForCode(); // listen before the browser can come back
      await openExternal(url.toString());
    },
    saveCodeVerifier: (v) => { verifier = v; },
    codeVerifier: () => verifier,
    invalidateCredentials: (scope) => {
      const { client: c, tokens } = saved();
      if (scope === 'all') store.remove(STORE_KEY);
      else if (scope === 'tokens') store.set(STORE_KEY, { client: c });
      else if (scope === 'client') store.set(STORE_KEY, { tokens });
    },
  };

  const transport = () => new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  const newClient = () => new Client({ name: 'platanus', version });

  // Connected client; signs in first when there are no valid tokens (opens the browser)
  async function connected() {
    if (client) return client;
    let c = newClient();
    const t = transport();
    try {
      await c.connect(t);
    } catch (err) {
      if (!(err instanceof UnauthorizedError) || !waiting) throw err;
      const code = await waiting.promise.finally(() => { waiting = null; });
      await t.finishAuth(code);
      c = newClient();
      await c.connect(transport());
    }
    client = c;
    return client;
  }

  const call = async (name, args = {}) => (await connected()).callTool({ name, arguments: args });

  return {
    signedIn: () => Boolean(saved().tokens),
    signIn: () => connected().then(() => true),
    async organizations() {
      return listOf(readToolJson(await call('list_organizations')), 'organizations').map((o) => ({ id: String(o.id), name: String(o.name ?? o.id) }));
    },
    async projects() {
      return listOf(readToolJson(await call('list_projects')), 'projects').map((p) => ({
        id: String(p.id), name: String(p.name ?? p.id), organizationId: String(p.organization_id ?? ''), status: String(p.status ?? ''), region: String(p.region ?? ''),
      }));
    },
    // What a new project costs in that organization ({ type, amount, recurrence }); shown to the person first
    cost: async (organizationId) => readCost(readToolJson(await call('get_cost', { type: 'project', organization_id: organizationId }))),
    // Only after the person agreed: the confirmation create_project needs
    async confirmCost(cost) {
      const { confirmation_id: id } = readToolJson(await call('confirm_cost', cost));
      if (typeof id !== 'string') throw new Error('Supabase did not confirm the cost');
      return id;
    },
    async create({ name, organizationId, confirmCostId }) {
      const project = itemOf(readToolJson(await call('create_project', { name, organization_id: organizationId, region: REGION, confirm_cost_id: confirmCostId })), 'project');
      return { id: String(project.id ?? project.ref), name: String(project.name ?? name) };
    },
    project: async (id) => itemOf(readToolJson(await call('get_project', { id })), 'project'),
    url: async (id) => readToolUrl(await call('get_project_url', { project_id: id })),
    publicKey: async (id) => pickPublicKey(readToolJson(await call('get_publishable_keys', { project_id: id }))),
    // The database panel: the project (status, region, Postgres), its organization's plan and the numbers
    async stats(id) {
      const project = itemOf(readToolJson(await call('get_project', { id })), 'project');
      const organization = project.organization_id
        ? readToolJson(await call('get_organization', { id: project.organization_id })) : {};
      const totals = readSqlRows(await call('execute_sql', { project_id: id, query: STATS_SQL.totals }));
      const tables = readSqlRows(await call('execute_sql', { project_id: id, query: STATS_SQL.tables }));
      return {
        project: { id, name: String(project.name ?? id), status: String(project.status ?? ''), region: String(project.region ?? ''), postgres: String(project.database?.version ?? ''), createdAt: String(project.created_at ?? '') },
        plan: String(organization.plan ?? ''),
        ...readStats(totals, tables),
      };
    },
    async signOut() {
      await client?.close().catch(() => {});
      client = null;
      store.remove(STORE_KEY);
    },
  };
}

module.exports = { createSupabaseConnector, MCP_URL, REDIRECT_URL };
