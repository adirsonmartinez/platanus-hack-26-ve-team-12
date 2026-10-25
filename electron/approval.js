// Which agent changes the person approves one by one. Pure; tested in approval.test.js.
//   manual  every change asks (default; also what the app starts in)
//   auto    ordinary edits and new files are saved on their own; it still asks for files that can break
//           installs, deploys, CI or run code, and for changes that delete most of a file
//   bypass  nothing asks
// In every mode secrets are refused before this runs (refuseSecretTarget) and the previous version is
// backed up so the change can be undone.

const APPROVAL_MODES = ['manual', 'auto', 'bypass'];

// Dependencies, deploy and CI configuration, database migrations and scripts that run on a computer
const SENSITIVE = /(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|\.github\/|\.gitlab-ci\.ya?ml|\.husky\/|Dockerfile[^/]*|docker-compose[^/]*|vercel\.json|netlify\.toml|render\.yaml|fly\.toml|firebase\.json|supabase\/|Makefile|[^/]+\.(?:sh|bash|zsh|ps1|bat|cmd))$|(?:^|\/)(?:\.github|\.husky|supabase)\//i;
// Keeping less than this share of a file counts as deleting most of it
const MIN_KEPT = 0.5;

const approvalMode = (mode) => (APPROVAL_MODES.includes(mode) ? mode : 'manual');

// change: { path, exists, oldBytes, newBytes }
function needsApproval(mode, { path, exists, oldBytes = 0, newBytes = 0 }) {
  const m = approvalMode(mode);
  if (m === 'bypass') return false;
  if (m === 'manual') return true;
  if (SENSITIVE.test(String(path).replace(/\\/g, '/'))) return true; // Windows paths too
  return Boolean(exists && oldBytes > 0 && newBytes < oldBytes * MIN_KEPT);
}

module.exports = { APPROVAL_MODES, approvalMode, needsApproval };
