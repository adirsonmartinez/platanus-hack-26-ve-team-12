// What the chat menus offer ("+" in the composer, the floating button): pure, so it is tested on its own
// (tests/renderer/chatMenu.test.mjs); renderer/views/ui/chatMenuView.js draws it.
import { strings } from '../i18n/es.js';

const M = strings.chat.menu;

// ctx: { actions, modeModel, chatViewModel, openChat?, info? }
// info(): { agent: { id, name } | null, working, worst: { path, level } | null, counts: { red, yellow }, pending,
//          projectOpen, empty, trust: true | false | undefined (undefined: nothing to trust, the web demo) }
// -> items: a header (the floating button only: who answers and how the project is), tiles (the main
//    actions, with an icon; "Reparar" names the worst file and only shows when there is one) and a foot
//    (connect agents, Vibe / Dev, trust the folder or stop trusting it)
export function chatMenuItems({ actions, modeModel, chatViewModel, openChat, info = () => ({}) }) {
  const i = info() ?? {};
  const counts = i.counts ?? { red: 0, yellow: 0 };
  const name = (path) => String(path).split('/').filter(Boolean).pop();
  const status = i.working ? M.working
    : counts.red || counts.yellow ? [counts.red && M.risk(counts.red), counts.yellow && M.review(counts.yellow)].filter(Boolean).join(' · ')
      : M.allGreen;
  return [
    openChat && { kind: 'header', id: 'open', title: i.agent?.name ?? M.agentless, detail: status, working: Boolean(i.working), agent: i.agent?.id ?? 'bot', run: openChat },
    i.worst && { kind: 'tile', id: 'repair', icon: 'wrench', label: M.repairFile(name(i.worst.path)), accent: i.worst.level, run: (b) => actions.repairWorst(b) },
    i.projectOpen && !i.empty && { kind: 'tile', id: 'tour', icon: 'route', label: strings.tour.menu, run: () => actions.startTour() },
    { kind: 'tile', id: 'new', icon: 'plus', label: M.newChat, run: () => chatViewModel.newChat() },
    { kind: 'tile', id: 'history', icon: 'shieldOk', label: M.historyShort, badge: i.pending ?? 0, run: () => actions.showRepairs() },
    { kind: 'foot', id: 'connect', icon: 'plug', label: M.connectAgents, run: () => actions.showConnect() },
    { kind: 'foot', id: 'mode', icon: modeModel.tech ? 'vibe' : 'dev', label: M.modeShort(modeModel.tech), run: () => modeModel.toggle() },
    i.projectOpen && typeof i.trust === 'boolean' && (i.trust
      ? { kind: 'foot', id: 'trust', icon: 'shieldOk', label: M.untrust, run: () => actions.untrustFolder() }
      : { kind: 'foot', id: 'trust', icon: 'shieldOk', label: M.trust, run: () => actions.trustFolder() }),
  ].filter(Boolean);
}

