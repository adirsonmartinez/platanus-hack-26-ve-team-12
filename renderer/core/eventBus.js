// App-wide events between view models (e.g. "a folder was opened" -> the chat comments on it).
// Event names live in EVENTS so a typo fails loudly instead of silently never firing.
export const EVENTS = Object.freeze({
  projectOpened: 'project:opened',     // { name }
  projectClosed: 'project:closed',
  projectCreated: 'project:created',   // { name } a new, empty project (after project:opened)
  projectCreateFailed: 'project:create-failed', // { error }
  diskChanged: 'disk:changed',         // { paths }
  folderOpened: 'folder:opened',       // { name, files, floors, counts }
  fileSelected: 'file:selected',       // { path, level, reason, by }
  tableSelected: 'table:selected',     // { name, columns, rlsEnabled }
  supabaseVulnerable: 'supabase:vulnerable',
  commitSelected: 'commit:selected',   // { sha, short, subject, author, date, files, risk, lane, laneLive }
  repairStarted: 'repair:started',     // { path, agent }
  repairText: 'repair:text',           // { path, delta } the agent's explanation, streaming
  repairTool: 'repair:tool',           // { path, name }
  repairChanged: 'repair:changed',     // { path, change } the agent wrote a file (approved)
  repairFinished: 'repair:finished',   // { entry } history entry with its final status
  agentAwaiting: 'agent:awaiting',     // { path, waiting, diff? } the agent waits for the person to approve a change
  robotLanded: 'robot:landed',         // { path, kind: 'folder'|'project', name, files?, red, yellow } the person dropped the robot there
  tourStarted: 'tour:started',         // {} the tour of the open project is being prepared
  tourStep: 'tour:step',               // { index, total, step, writing, source, agent, architecture }
  tourEnded: 'tour:ended',
  agentChanged: 'agent:changed',       // { path, reason, diff, … } the agent saved a change (approved or by the permissions mode)
});

export function createEventBus() {
  const handlers = new Map();
  const known = new Set(Object.values(EVENTS));

  const check = (type) => {
    if (!known.has(type)) throw new Error(`Unknown event: ${type}`);
  };

  return {
    on(type, handler) {
      check(type);
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type).delete(handler);
    },
    emit(type, payload) {
      check(type);
      for (const handler of handlers.get(type) ?? []) handler(payload);
    },
  };
}
