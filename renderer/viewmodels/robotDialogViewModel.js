// The welcome robot's speech bubble. It starts on a new, empty project (MapViewModel.welcome) and has two phases:
//   interview: questions about the idea, never about technology (strings.map.welcome.steps); the last step
//              recommends a stack and hands it to the agent. Answers can be undone with "back" or their chips
//   coach:     tips that react to the project while it grows (first file, risky files, .gitignore, README,
//              first commit), until everything basic is in place and the person says goodbye
// It talks at the person's level (UserLevelModel): it asks for it first when unknown, shows it on every bubble
// (tap to change), and learns from what the person does; when the evidence points elsewhere it asks before
// changing. The view only renders `bubble` and calls press(id) with the id of the clicked button.
import { Observable } from '../core/observable.js';
import { allFiles, baseName } from '../models/fileTree.js';
import { LEVEL_RANK } from '../models/securityModel.js';
import { LEVELS, UserLevelModel } from '../models/userLevelModel.js';
import { strings } from '../i18n/es.js';

const W = strings.map.welcome;
const TIPS = W.tips;
const byId = Object.fromEntries(W.steps.map((s) => [s.id, s]));

// Questions on any path from the first step to the last one (every branch has the same depth)
const INTERVIEW_LENGTH = (() => {
  let n = 0;
  for (let step = W.steps[0]; step; step = byId[step.options[0].next]) n++;
  return n;
})();

const isRisk = (level) => level === 'red' || level === 'yellow';
// The stack the answers lead to (the last answer that names one)
const stackOf = (history) => W.stacks[history.findLast((a) => a.stack)?.stack] ?? W.stacks.site;
// A tip's texts for a level: a programmer gets its `pro` version where there is one
const tipFor = (key, level) => (level === 'pro' && TIPS[key].pro ? { ...TIPS[key], ...TIPS[key].pro } : TIPS[key]);
const OFF = { phase: 'off', stepId: 'start', history: [], explained: false, picker: false, seen: [], collapsed: false, unread: false, bubble: null };

export class RobotDialogViewModel {
  #project;
  #security;
  #actions;
  #level;
  #session = null;

  // `seq` changes every time the bubble shows something new (the view replays its entrance);
  // `seen`: coach tips already dismissed; `unread`: a new tip arrived while the bubble was collapsed;
  // `picker`: the level picker is open (over whatever the robot was saying)
  store = new Observable({ ...OFF, seq: 0 });

  constructor({ mapViewModel, projectModel, securityModel, actions = {}, userLevel = new UserLevelModel() }) {
    this.#project = projectModel;
    this.#security = securityModel;
    this.#actions = actions;
    this.#level = userLevel;

    mapViewModel.store.subscribe(({ status, session, welcome }) => {
      if (status !== 'ready') return this.#turnOff();
      if (welcome && (this.store.state.phase === 'off' || session !== this.#session)) {
        this.#session = session;
        return this.#show({ ...OFF, phase: 'interview', stepId: userLevel.store.state.confirmed ? 'start' : 'level' });
      }
      if (session !== this.#session) this.#turnOff();
    }, { immediate: true });
    projectModel.store.subscribe(() => this.#refreshCoach());
    securityModel.store.subscribe(() => this.#refreshCoach());
    // A new level (or a suggestion to change it) redraws whatever the robot is saying
    userLevel.store.subscribe(() => { if (this.store.state.phase !== 'off') this.#show({}); });
  }

  press(id) {
    const state = this.store.state;
    if (state.phase === 'off') return;
    if (id === 'close') return this.#turnOff();
    if (id === 'collapse') return this.store.set({ collapsed: true });
    if (id === 'expand') return this.store.set({ collapsed: false, unread: false });
    // The level: the robot's suggestion, the chip on the bubble and its picker
    if (id === 'acceptLevel') return this.#level.accept();
    if (id === 'declineLevel') return this.#level.decline();
    if (id === 'level') return this.#show({ picker: true });
    if (id === 'cancelPicker') return this.#show({ picker: false });
    if (id.startsWith('pick:')) {
      this.#level.set(id.slice(5));
      return this.#show({ picker: false });
    }
    if (state.phase === 'interview') return this.#pressInterview(id);
    this.#pressCoach(id);
  }

  #pressInterview(id) {
    const { history, stepId } = this.store.state;
    if (id === 'skip') {
      this.#level.signal(1); // skipping the questions: knows what they want
      return this.#show({ phase: 'coach' });
    }
    if (id === 'skipLevel') return this.#show({ stepId: 'start' });
    // Undo: "back" drops the last answer; tapping an answer chip ("rewind:i") goes back to that question
    const rewindTo = id === 'back' ? history.length - 1 : id.startsWith('rewind:') ? Number(id.slice(7)) : -1;
    if (rewindTo >= 0 && rewindTo < history.length) {
      return this.#show({ stepId: history[rewindTo].stepId, history: history.slice(0, rewindTo), explained: false });
    }
    if (id === 'back' || id.startsWith('rewind:')) return;
    const step = byId[stepId];
    const option = step.options[Number(id.replace('opt:', ''))];
    if (!option) return;
    if (option.level) this.#level.set(option.level);
    if (option.unsure) this.#level.signal(-1); // "I don't know yet": needs it simpler
    if (option.next) {
      const answer = { stepId, question: step.question, chosen: option.label, stack: option.stack };
      return this.#show({ stepId: option.next, history: [...history, answer], explained: false });
    }

    // The recommendation step
    const stack = stackOf(history);
    const voice = W.voice[this.#level.store.state.level];
    if (option.action === 'explain') {
      this.#level.signal(-1); // asked for an analogy
      return this.#show({ explained: true });
    }
    if (option.action === 'createFiles') this.#actions.askAgent?.(W.scaffoldPrompt(history, stack, voice));
    if (option.action === 'talk') this.#actions.askAgent?.(W.talkPrompt(history, stack, voice));
    this.#show({ phase: 'coach', collapsed: option.action === 'dismiss' });
  }

  #pressCoach(id) {
    const tip = this.store.state.bubble;
    if (id === 'next') return this.#show({ seen: [...this.store.state.seen, tip.id] });
    if (id === 'ask') return this.#actions.askAgent?.(tip.prompt);
    if (id === 'openChat') return this.#actions.openChat?.();
    if (id === 'repair') return this.#actions.repair?.(tip.path);
    if (id === 'locate') return this.#actions.locate?.(tip.path);
    // Back to the recommendation with the same answers, to change them
    if (id === 'reopen') return this.#show({ phase: 'interview', stepId: 'recommend', explained: false, collapsed: false });
    if (id === 'save') {
      this.#actions.saveProgress?.();
      return this.#show({ seen: [...this.store.state.seen, tip.id] });
    }
  }

  #refreshCoach() {
    if (this.store.state.phase === 'coach') this.#show({});
  }

  #turnOff() {
    if (this.store.state.phase !== 'off') this.store.set({ ...OFF, seq: this.store.state.seq + 1 });
  }

  // Applies the patch and recomputes the bubble; only a different bubble bumps seq
  #show(patch) {
    const next = { ...this.store.state, ...patch };
    const { level, suggestion } = this.#level.store.state;
    const bubble = {
      ...(suggestion ? this.#suggestion(level, suggestion)
        : next.picker ? this.#picker(level)
          : next.phase === 'interview' ? this.#question(next, level) : this.#tip(next, level)),
      level,
      levelLabel: W.levels[level],
    };
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

  // "¿Te hablo más simple?": the robot noticed something and asks before changing
  #suggestion(level, to) {
    const S = W.levels.suggest;
    const up = LEVELS.indexOf(to) > LEVELS.indexOf(level);
    return {
      id: `suggest:${to}`, kind: 'tip', tone: 'info', title: S.title[to], text: up ? S.up : S.down,
      buttons: [{ id: 'acceptLevel', label: S.yes, kind: 'primary' }, { id: 'declineLevel', label: S.no, kind: 'ghost' }],
    };
  }

  #picker(level) {
    return {
      id: 'levelPicker', kind: 'tip', tone: 'info', title: W.levels.pickerTitle, text: W.levels.pickerText,
      buttons: [
        ...LEVELS.map((l) => ({ id: `pick:${l}`, label: W.levels[l], kind: l === level ? 'primary' : 'option' })),
        { id: 'cancelPicker', label: W.levels.cancel, kind: 'ghost' },
      ],
    };
  }

  #question({ stepId, history, explained }, level) {
    const step = byId[stepId];
    const askedLevel = stepId === 'level' || history[0]?.stepId === 'level';
    const base = {
      kind: 'question',
      tone: 'info',
      progress: { step: history.length + 1, of: INTERVIEW_LENGTH + (askedLevel ? 1 : 0) },
      answers: history.map((a) => a.chosen),
      canBack: history.length > 0,
    };
    const pro = level === 'pro';
    const KIND = { createFiles: 'primary', dismiss: 'ghost' };
    const buttons = step.options
      .map((o, i) => ({ id: `opt:${i}`, label: (pro && o.pro) || o.label, kind: KIND[o.action] ?? 'option', action: o.action }))
      // A programmer is not offered the analogy; nobody is offered it twice
      .filter((b) => !(b.action === 'explain' && (explained || pro)))
      .map(({ action, ...b }) => b);

    if (stepId === 'recommend') {
      const stack = stackOf(history);
      const R = W.recommend;
      return {
        ...base,
        id: `q:recommend:${stack.tech}${explained ? ':explained' : ''}`,
        kind: 'recommend',
        title: explained ? R.explainedTitle : pro ? R.proTitle : R.title,
        text: explained ? stack.analogy : pro ? R.proText(stack) : level === 'some' ? R.someText(stack) : R.text(stack),
        stack: { inside: R.inside, tech: stack.tech, perks: stack.perks },
        buttons,
      };
    }
    const extra = stepId === 'level' ? [{ id: 'skipLevel', label: step.skip, kind: 'ghost' }]
      : stepId === 'start' ? [{ id: 'skip', label: W.ui.skip, kind: 'ghost' }] : [];
    return {
      ...base,
      id: `q:${stepId}`,
      title: step.title,
      text: step.question,
      ...(step.hint && !pro ? { hint: step.hint } : {}), // a programmer needs no reassurance
      buttons: [...buttons, ...extra],
    };
  }

  // The most useful tip for the project as it is now: risks first, then the basics
  #tip({ seen, history }, level) {
    const files = allFiles(this.#project.store.state.tree ?? []);
    const has = (re) => files.some((f) => !f.path.includes('/') && re.test(f.path));
    const tip = (id, tone, title, text, buttons, extra = {}) => ({ id, kind: 'tip', tone, title, text, buttons, ...extra });
    const next = { id: 'next', label: TIPS.next, kind: 'ghost' };

    const risk = files
      .map((f) => ({ path: f.path, ...this.#security.scoreOf(f.path) }))
      .filter((f) => isRisk(f.level) && !seen.includes(`risk:${f.path}:${f.level}`))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.path.localeCompare(b.path))[0];
    if (risk) {
      const R = tipFor('risk', level);
      // A programmer gets the rule and the fix (techReasons); everyone else the plain reason
      const reason = risk.reason || (level === 'pro' && strings.security.techReasons[risk.reasonKey]) || strings.security.reasons[risk.reasonKey] || '';
      return tip(`risk:${risk.path}:${risk.level}`, risk.level === 'red' ? 'danger' : 'warn',
        R.title[risk.level], R.text(risk.path, reason), [
          { id: 'repair', label: R.repair, kind: 'primary' },
          { id: 'locate', label: R.locate, kind: 'option' },
          next,
        ], { path: risk.path });
    }

    if (!files.length) {
      const T = tipFor('waiting', level);
      return tip('waiting', 'info', T.title, T.text, [
        { id: 'openChat', label: T.ask, kind: 'option' },
        // Nothing was created yet, so the answers can still change (not after skipping the questions)
        ...(history.length ? [{ id: 'reopen', label: T.change, kind: 'option' }] : []),
      ]);
    }
    if (!seen.includes('firstFile')) {
      const T = tipFor('firstFile', level);
      return tip('firstFile', 'success', T.title, T.text(baseName(files[0].path)), [{ ...next, kind: 'primary' }]);
    }
    for (const [key, re] of [['gitignore', /^\.gitignore$/], ['readme', /^readme(\.\w+)?$/i]]) {
      if (seen.includes(key) || has(re)) continue;
      const T = tipFor(key, level);
      return tip(key, 'info', T.title, T.text, [{ id: 'ask', label: T.ask, kind: 'primary' }, next], { prompt: T.prompt });
    }
    if (!seen.includes('saveProgress')) {
      const T = tipFor('saveProgress', level);
      return tip('saveProgress', 'info', T.title, T.text, [{ id: 'save', label: T.save, kind: 'primary' }, next]);
    }
    const T = tipFor('allSet', level);
    return tip('allSet', 'success', T.title, T.text, [{ id: 'close', label: T.bye, kind: 'primary' }]);
  }
}
