// External services a project may use (docs/features/servicios/README.md): how to spot them in the files,
// how the person connects them (their CLI or an MCP server for their agent) and their official pages.
// Pure data. Every URL and command was checked against the service's official docs on 2026-10-24; an MCP
// whose address or command could not be confirmed keeps only its docs page (no command to copy).
// LINKS is the only list of pages links:open may open. Tested in serviceCatalog.test.js.

// detect.deps: package.json dependency names; one ending in "/" is a scope prefix ("@supabase/"), any
// other must match exactly. envNames are variable NAMES from .env.example / .env.sample, never values.
// cli.whoami: [bin, ...args] that exits 0 only with a signed-in session (never one that opens a browser).
// mcp.url: a remote server (OAuth in the browser); mcp.stdio: a local one; mcp.token: it needs a personal
// token in a header, so no command is offered (the person follows its page).
const SERVICES = {
  supabase: {
    name: 'Supabase',
    detect: { deps: ['@supabase/'], files: ['supabase/config.toml'], dirs: ['supabase'], envNames: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL'] },
    cli: { bin: 'supabase', install: 'npm install supabase --save-dev', login: 'npx supabase login', whoami: null, docs: 'https://supabase.com/docs/guides/local-development/cli/getting-started' },
    mcp: { name: 'supabase', docs: 'https://supabase.com/docs/guides/getting-started/mcp', url: 'https://mcp.supabase.com/mcp' },
    dashboard: 'https://supabase.com/dashboard',
  },
  vercel: {
    name: 'Vercel',
    detect: { deps: ['@vercel/'], files: ['vercel.json'], dirs: ['.vercel'], envNames: [] },
    cli: { bin: 'vercel', install: 'npm i -g vercel', login: 'vercel login', whoami: ['vercel', 'whoami'], docs: 'https://vercel.com/docs/cli' },
    mcp: { name: 'vercel', docs: 'https://vercel.com/docs/agent-resources/vercel-mcp', url: 'https://mcp.vercel.com' },
    dashboard: 'https://vercel.com/dashboard',
  },
  github: {
    name: 'GitHub',
    detect: { deps: [], files: [], dirs: ['.github'], envNames: [] },
    // `gh auth status` exits 1 when there is no valid session (cli.github.com/manual/gh_auth_status)
    cli: { bin: 'gh', install: 'brew install gh', login: 'gh auth login', whoami: ['gh', 'auth', 'status'], docs: 'https://cli.github.com/manual/' },
    mcp: { name: 'github', docs: 'https://github.com/github/github-mcp-server', url: 'https://api.githubcopilot.com/mcp', token: true },
    dashboard: 'https://github.com',
  },
  stripe: {
    name: 'Stripe',
    detect: { deps: ['stripe', '@stripe/'], files: [], dirs: [], envNames: ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'] },
    cli: { bin: 'stripe', install: 'npm install -g @stripe/cli', login: 'stripe login', whoami: null, docs: 'https://docs.stripe.com/stripe-cli' },
    mcp: { name: 'stripe', docs: 'https://docs.stripe.com/mcp', url: 'https://mcp.stripe.com' },
    dashboard: 'https://dashboard.stripe.com',
  },
  firebase: {
    name: 'Firebase',
    detect: { deps: ['firebase', 'firebase-admin', '@firebase/'], files: ['firebase.json', '.firebaserc'], dirs: [], envNames: ['FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'VITE_FIREBASE_API_KEY'] },
    cli: { bin: 'firebase', install: 'npm install -g firebase-tools', login: 'firebase login', whoami: null, docs: 'https://firebase.google.com/docs/cli' },
    mcp: { name: 'firebase', docs: 'https://firebase.google.com/docs/ai-assistance/mcp-server', stdio: 'npx -y firebase-tools@latest mcp' },
    dashboard: 'https://console.firebase.google.com',
  },
  render: {
    name: 'Render',
    detect: { deps: [], files: ['render.yaml'], dirs: [], envNames: [] },
    // `render login` opens the browser when there is no session, so it is not used as a check
    cli: { bin: 'render', install: null, login: 'render login', whoami: null, docs: 'https://render.com/docs/cli' },
    mcp: { name: 'render', docs: 'https://render.com/docs/mcp-server' },
    dashboard: 'https://dashboard.render.com',
  },
  netlify: {
    name: 'Netlify',
    detect: { deps: ['@netlify/'], files: ['netlify.toml'], dirs: ['.netlify'], envNames: [] },
    cli: { bin: 'netlify', install: 'npm install -g netlify-cli', login: 'netlify login', whoami: null, docs: 'https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/' },
    mcp: { name: 'netlify', docs: 'https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/', url: 'https://netlify-mcp.netlify.app/mcp' },
    dashboard: 'https://app.netlify.com',
  },
  openai: {
    name: 'OpenAI',
    detect: { deps: ['openai', '@ai-sdk/openai'], files: [], dirs: [], envNames: ['OPENAI_API_KEY'] },
    cli: null,
    mcp: null,
    dashboard: 'https://platform.openai.com',
  },
  anthropic: {
    name: 'Anthropic',
    detect: { deps: ['@anthropic-ai/', '@ai-sdk/anthropic'], files: [], dirs: [], envNames: ['ANTHROPIC_API_KEY'] },
    cli: null,
    mcp: null,
    dashboard: 'https://console.anthropic.com',
  },
  elevenlabs: {
    name: 'ElevenLabs',
    detect: { deps: ['@elevenlabs/', 'elevenlabs'], files: [], dirs: [], envNames: ['ELEVENLABS_API_KEY'] },
    cli: { bin: 'elevenlabs', install: 'npm install -g @elevenlabs/cli', login: 'elevenlabs auth login', whoami: null, docs: 'https://elevenlabs.io/docs/eleven-agents/operate/cli' },
    // the hosted server (OAuth) the official repository recommends
    mcp: { name: 'elevenlabs', docs: 'https://github.com/elevenlabs/elevenlabs-mcp', url: 'https://api.elevenlabs.io/v1/mcp' },
    dashboard: 'https://elevenlabs.io/app',
  },
  resend: {
    name: 'Resend',
    detect: { deps: ['resend'], files: [], dirs: [], envNames: ['RESEND_API_KEY'] },
    cli: null,
    mcp: { name: 'resend', docs: 'https://resend.com/docs/mcp-server', url: 'https://mcp.resend.com/mcp' },
    dashboard: 'https://resend.com/emails',
  },
  sentry: {
    name: 'Sentry',
    detect: { deps: ['@sentry/'], files: ['sentry.properties', '.sentryclirc'], dirs: [], envNames: ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_AUTH_TOKEN'] },
    cli: { bin: 'sentry-cli', install: 'npm install -g @sentry/cli', login: 'sentry-cli login', whoami: null, docs: 'https://docs.sentry.io/cli/' },
    mcp: { name: 'sentry', docs: 'https://mcp.sentry.dev', url: 'https://mcp.sentry.dev/mcp' },
    dashboard: 'https://sentry.io',
  },
  clerk: {
    name: 'Clerk',
    detect: { deps: ['@clerk/'], files: [], dirs: [], envNames: ['CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY'] },
    cli: null,
    mcp: { name: 'clerk', docs: 'https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server', url: 'https://mcp.clerk.com/mcp' },
    dashboard: 'https://dashboard.clerk.com',
  },
  posthog: {
    name: 'PostHog',
    detect: { deps: ['posthog-js', 'posthog-node', 'posthog-react-native'], files: [], dirs: [], envNames: ['NEXT_PUBLIC_POSTHOG_KEY', 'POSTHOG_KEY', 'VITE_POSTHOG_KEY'] },
    cli: null,
    mcp: { name: 'posthog', docs: 'https://posthog.com/docs/model-context-protocol', url: 'https://mcp.posthog.com/mcp' },
    dashboard: 'https://app.posthog.com',
  },
  neon: {
    name: 'Neon',
    detect: { deps: ['@neondatabase/'], files: [], dirs: [], envNames: ['NEON_API_KEY'] },
    // its commands fall back to a browser sign-in without a session, so none is used as a check
    cli: { bin: 'neon', install: 'npm i -g neon', login: 'neon login', whoami: null, docs: 'https://neon.com/docs/reference/neon-cli' },
    mcp: { name: 'neon', docs: 'https://neon.com/docs/ai/neon-mcp-server', url: 'https://mcp.neon.tech/mcp' },
    dashboard: 'https://console.neon.tech',
  },
  prisma: {
    name: 'Prisma',
    detect: { deps: ['prisma', '@prisma/'], files: ['prisma/schema.prisma'], dirs: ['prisma'], envNames: [] },
    cli: null,
    mcp: { name: 'prisma', docs: 'https://www.prisma.io/docs/ai/tools/mcp-server', url: 'https://mcp.prisma.io/mcp' },
    dashboard: 'https://console.prisma.io',
  },
  mongodb: {
    name: 'MongoDB',
    detect: { deps: ['mongodb', 'mongoose'], files: [], dirs: [], envNames: ['MONGODB_URI', 'MONGO_URL', 'MONGODB_URL'] },
    cli: { bin: 'atlas', install: 'brew install mongodb-atlas-cli', login: 'atlas auth login', whoami: ['atlas', 'auth', 'whoami'], docs: 'https://www.mongodb.com/docs/atlas/cli/current/' },
    // its server needs a connection string or Atlas credentials: only the page, no command to copy
    mcp: { name: 'mongodb', docs: 'https://www.mongodb.com/docs/mcp-server/get-started/', token: true },
    dashboard: 'https://cloud.mongodb.com',
  },
};

const ORDER = Object.keys(SERVICES);

// Pages of the voice connection (docs/features/llamada/VOZ.md): where to get each key
const VOICE_LINKS = ['https://elevenlabs.io/app/settings/api-keys', 'https://console.x.ai'];

// The command for each agent, built from the server's verified address with each agent's documented
// syntax (Claude Code: `claude mcp add --transport http`; Codex: `codex mcp add --url`; Grok: the form
// agents.js already uses). OpenCode has no one-line command (its `mcp add` asks questions): null.
function mcpCommands(mcp) {
  const none = { claude: null, codex: null, grok: null, opencode: null };
  if (!mcp || mcp.token) return none;
  if (mcp.url) {
    return {
      claude: `claude mcp add --transport http ${mcp.name} ${mcp.url}`,
      codex: `codex mcp add ${mcp.name} --url ${mcp.url}`,
      grok: `grok mcp add ${mcp.name} ${mcp.url} -t http`,
      opencode: null,
    };
  }
  if (mcp.stdio) return { ...none, claude: `claude mcp add ${mcp.name} -- ${mcp.stdio}`, codex: `codex mcp add ${mcp.name} -- ${mcp.stdio}` };
  return none;
}

// Every page of the catalog the person may open (docs, guides, dashboards). MCP server addresses are not
// pages: they go only into the agent's command.
function catalogUrls() {
  const urls = [];
  for (const s of Object.values(SERVICES)) {
    urls.push(s.dashboard);
    if (s.cli?.docs) urls.push(s.cli.docs);
    if (s.mcp?.docs) urls.push(s.mcp.docs);
  }
  return [...new Set(urls)];
}

const LINKS = new Set([...catalogUrls(), ...VOICE_LINKS]);

// What the window sees: no detection rules and no whoami, plus the ready-made commands. A fresh copy.
function publicCatalog() {
  return Object.fromEntries(ORDER.map((key) => {
    const { name, cli, mcp, dashboard } = SERVICES[key];
    return [key, {
      name,
      cli: cli ? { install: cli.install, login: cli.login, docs: cli.docs } : null,
      mcp: mcp ? { name: mcp.name, docs: mcp.docs, url: mcp.url ?? null, commands: mcpCommands(mcp) } : null,
      dashboard,
    }];
  }));
}

module.exports = { SERVICES, ORDER, LINKS, VOICE_LINKS, mcpCommands, catalogUrls, publicCatalog };
