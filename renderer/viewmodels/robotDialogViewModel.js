// The welcome robot's speech bubble. It starts on a new, empty project (MapViewModel.welcome) and has two phases:
//   interview: first how much the person programs. "Ya programo" -> a goodbye, then the robot steps aside, the
//              chat opens and the app switches to Dev. "Estoy empezando" -> cards with the technologies to start
//              with (models/stackCatalog.js, all chosen by default); "¡Empecemos!" records the integrations
//              left to connect and hands the agent a request for a base project. "back" undoes the answer
//   coach:     tips that react to the project while it grows (first file, risky files, .gitignore, README),
//              until everything basic is in place and the person says goodbye
// The view only renders `bubble` and calls press(id) with the id of the clicked button or card.
import { Observable } from '../core/observable.js';
import { allFiles, baseName } from '../models/fileTree.js';
import { LEVEL_RANK } from '../models/securityModel.js';
import { STACK_CATALOG, defaultSelection, toggleStack, integrationsOf } from '../models/stackCatalog.js';
import { strings } from '../i18n/es.js';

const W = strings.map.welcome;
const TIPS = W.tips;
const INTERVIEW_LENGTH = 2; // experience, technologies
const FAREWELL_MS = 2600;   // the goodbye stays this long before the robot steps aside

const isRisk = (level) => level === 'red' || level === 'yellow';
const OFF = { phase: 'off', stepId: 'experience', history: [], selection: defaultSelection(), building: false, seen: [], collapsed: false, unread: false, bubble: null };

export class RobotDialogViewModel {
  #project;
  #security;
  #actions;
  #session = null;
  #farewellTimer = null;

  // `seq` changes every time the bubble shows something new (the view replays its entrance);
  // `history`: the answers so far (chips); `selection`: the chosen technologies (catalog ids);
  // `building`: the base project went to an agent and its first file has not arrived yet;
  // `seen`: coach tips already dismissed; `unread`: a new tip arrived while the bubble was collapsed
  store = new Observable({ ...OFF, seq: 0 });

  constructor({ mapViewModel, projectModel, securityModel, actions = {} }) {
    this.#project = projectModel;
    this.#security = securityModel;
    this.#actions = actions;

    mapViewModel.store.subscribe(({ status, session, welcome }) => {
      if (status !== 'ready') return this.#turnOff();
      // Once per new project: after the goodbye or ×, the robot does not come back on the map's next change
      if (welcome && session !== this.#session) {
        this.#session = session;
        return this.#show({ ...OFF, phase: 'interview' });
      }
      if (session !== this.#session) this.#turnOff();
    }, { immediate: true });
    projectModel.store.subscribe(() => this.#refreshCoach());
    securityModel.store.subscribe(() => this.#refreshCoach());
  }

  press(id) {
    const state = this.store.state;
    if (state.phase === 'off' || state.phase === 'farewell') return;
    if (id === 'close') return this.#turnOff();
    if (id === 'collapse') return this.store.set({ collapsed: true });
    if (id === 'expand') return this.store.set({ collapsed: false, unread: false });
    if (state.phase === 'interview') return this.#pressInterview(id);
    this.#pressCoach(id);
  }

  #pressInterview(id) {
    const { history, stepId, selection } = this.store.state;
    if (id === 'skip') return this.#show({ phase: 'coach' });
    if (id === 'back' || id.startsWith('rewind:')) {
      if (stepId === 'stack') this.#show({ stepId: 'experience', history: [] });
      return;
    }
    if (id === 'exp:dev') {
      this.#show({ phase: 'farewell' });
      this.#actions.devMode?.();
      this.#actions.openChat?.();
      clearTimeout(this.#farewellTimer);
      this.#farewellTimer = setTimeout(() => this.#turnOff(), FAREWELL_MS);
      return;
    }
    if (id === 'exp:beginner') return this.#show({ stepId: 'stack', history: [W.experience.beginner], selection: defaultSelection() });
    if (stepId !== 'stack') return;
    if (id.startsWith('pick:')) return this.#show({ selection: toggleStack(selection, id.slice(5)) });
    if (id === 'start') {
      this.#actions.prepareSetup?.(integrationsOf(selection));
      const names = selection.map((key) => W.catalog[key]?.name ?? key);
      // askAgent says whether an agent got it (false: none yet, it waits until the person picks one)
      const sent = this.#actions.askAgent?.(W.scaffoldPrompt(selection, names)) === true;
      return this.#show({ phase: 'coach', building: sent });
    }
    if (id === 'dismiss') this.#show({ phase: 'coach', collapsed: true });
  }

  #pressCoach(id) {
    const tip = this.store.state.bubble;
    if (id === 'next') return this.#show({ seen: [...this.store.state.seen, tip.id] });
    if (id === 'ask') return this.#actions.askAgent?.(tip.prompt);
    if (id === 'openChat') return this.#actions.openChat?.();
    if (id === 'repair') return this.#actions.repair?.(tip.path);
    if (id === 'locate') return this.#actions.locate?.(tip.path);
    // Back to the technology cards with the same choice, to change it
    if (id === 'reopen') return this.#show({ phase: 'interview', stepId: 'stack', collapsed: false });
    if (id === 'save') {
      this.#actions.saveProgress?.();
      return this.#show({ seen: [...this.store.state.seen, tip.id] });
    }
  }

  #refreshCoach() {
    if (this.store.state.phase === 'coach') this.#show({});
  }

  #turnOff() {
    clearTimeout(this.#farewellTimer);
    if (this.store.state.phase !== 'off') this.store.set({ ...OFF, seq: this.store.state.seq + 1 });
  }

  // Applies the patch and recomputes the bubble; only a different bubble bumps seq
  #show(patch) {
    const next = { ...this.store.state, ...patch };
    const bubble = next.phase === 'interview' ? this.#question(next)
      : next.phase === 'farewell' ? { id: 'farewell', kind: 'tip', tone: 'success', title: W.farewell.title, text: W.farewell.text, buttons: [] }
      : this.#tip(next);
    const previous = this.store.state.bubble;
    const changed = previous?.id !== bubble.id;
    // A new problem always opens the bubble; calmer news just lights the pill
    const alarm = changed && (bubble.tone === 'danger' || bubble.tone === 'warn');
    const collapsed = alarm ? false : next.collapsed;
    this.store.set({
      ...next,
      bubble,
      collapsed,
      unread: collapsed && (next.unread || (changed && patch.collapsed === undefined)),
      seq: changed ? this.store.state.seq + 1 : this.store.state.seq,
    });
  }

  #question({ stepId, history, selection }) {
    const base = {
      kind: 'question',
      tone: 'info',
      progress: { step: stepId === 'stack' ? 2 : 1, of: INTERVIEW_LENGTH },
      answers: history,
      canBack: history.length > 0,
    };
    if (stepId === 'stack') {
      return {
        ...base,
        id: 'q:stack',
        kind: 'stack',
        title: W.stack.title,
        text: W.stack.question,
        cards: STACK_CATALOG.map((item) => ({
          id: item.id,
          logo: item.logo,
          name: W.catalog[item.id]?.name ?? item.id,
          text: W.catalog[item.id]?.text ?? '',
          chosen: selection.includes(item.id),
          locked: Boolean(item.base),
        })),
        buttons: [
          { id: 'start', label: W.stack.start, kind: 'primary' },
          { id: 'dismiss', label: W.stack.dismiss, kind: 'ghost' },
        ],
      };
    }
    const E = W.experience;
    return {
      ...base,
      id: 'q:experience',
      title: E.title,
      text: E.question,
      hint: E.hint,
      buttons: [
        { id: 'exp:beginner', label: E.beginner, kind: 'option' },
        { id: 'exp:dev', label: E.dev, kind: 'option' },
        { id: 'skip', label: W.ui.skip, kind: 'ghost' },
      ],
    };
  }

  // The most useful tip for the project as it is now: risks first, then the basics
  #tip({ seen, history, building }) {
    const files = allFiles(this.#project.store.state.tree ?? []);
    const has = (re) => files.some((f) => !f.path.includes('/') && re.test(f.path));
    const tip = (id, tone, title, text, buttons, extra = {}) => ({ id, kind: 'tip', tone, title, text, buttons, ...extra });
    const next = { id: 'next', label: TIPS.next, kind: 'ghost' };

    const risk = files
      .map((f) => ({ path: f.path, ...this.#security.scoreOf(f.path) }))
      .filter((f) => isRisk(f.level) && !seen.includes(`risk:${f.path}:${f.level}`))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.path.localeCompare(b.path))[0];
    if (risk) {
      const reason = risk.reason || strings.security.reasons[risk.reasonKey] || '';
      return tip(`risk:${risk.path}:${risk.level}`, risk.level === 'red' ? 'danger' : 'warn',
        TIPS.risk.title[risk.level], TIPS.risk.text(risk.path, reason), [
          { id: 'repair', label: TIPS.risk.repair, kind: 'primary' },
          { id: 'locate', label: TIPS.risk.locate, kind: 'option' },
          next,
        ], { path: risk.path });
    }

    if (!files.length && building) {
      return tip('building', 'info', TIPS.building.title, TIPS.building.text, [
        { id: 'openChat', label: TIPS.building.watch, kind: 'option' },
      ], { loading: true });
    }
    if (!files.length) {
      return tip('waiting', 'info', TIPS.waiting.title, TIPS.waiting.text, [
        { id: 'openChat', label: TIPS.waiting.ask, kind: 'option' },
        // Nothing was created yet, so the answers can still change (not after skipping the questions)
        ...(history.length ? [{ id: 'reopen', label: TIPS.waiting.change, kind: 'option' }] : []),
      ]);
    }
    if (!seen.includes('firstFile')) {
      return tip('firstFile', 'success', TIPS.firstFile.title, TIPS.firstFile.text(baseName(files[0].path)), [{ ...next, kind: 'primary' }]);
    }
    if (!seen.includes('gitignore') && !has(/^\.gitignore$/)) {
      return tip('gitignore', 'info', TIPS.gitignore.title, TIPS.gitignore.text,
        [{ id: 'ask', label: TIPS.gitignore.ask, kind: 'primary' }, next], { prompt: TIPS.gitignore.prompt });
    }
    if (!seen.includes('readme') && !has(/^readme(\.\w+)?$/i)) {
      return tip('readme', 'info', TIPS.readme.title, TIPS.readme.text,
        [{ id: 'ask', label: TIPS.readme.ask, kind: 'primary' }, next], { prompt: TIPS.readme.prompt });
    }
    if (!seen.includes('saveProgress')) {
      return tip('saveProgress', 'info', TIPS.saveProgress.title, TIPS.saveProgress.text,
        [{ id: 'save', label: TIPS.saveProgress.save, kind: 'primary' }, next]);
    }
    return tip('allSet', 'success', TIPS.allSet.title, TIPS.allSet.text, [{ id: 'close', label: TIPS.allSet.bye, kind: 'primary' }]);
  }
}
