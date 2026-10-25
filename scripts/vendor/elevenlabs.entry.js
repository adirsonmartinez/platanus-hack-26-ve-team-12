// Entry bundled by scripts/vendor-ui.js into renderer/vendor/elevenlabs.js: the ElevenLabs Agents client for
// the call with Remi (renderer/models/callSession.js). Resolved with the package's "browser" condition, so the
// web audio setup (microphone, AudioWorklets) is included. The worklets are copied next to it as files and
// passed as workletPaths, so the window's CSP needs no blob: or data: for scripts.
export { Conversation, SessionConnectionError } from '@elevenlabs/client';
