// Git service: bridges the renderer to the git IPC channels exposed by the preload.
// In a plain browser (no Electron) every write call returns desktop-only so the UI still works.
// Reads use the existing gitHistory IPC. Writes use the new channels added in this feature branch.

import { DEMO_GIT } from '../models/demoGit.js';

export function createGitService(bridge = window.platanus) {
  if (!bridge?.gitCommit) {
    // Browser demo mode: interactive in-memory git store backed by DEMO_GIT.
    let nextId = 50;
    const listeners = new Set();
    const notify = (payload) => listeners.forEach((fn) => fn(payload));

    return {
      isDesktop: true, // Allows agentModel to execute git commands seamlessly
      isDemo: true,
      commit: async (message) => {
        const id = ++nextId;
        const sha = id.toString(16).padStart(7, '0').repeat(6).slice(0, 40);
        const parentSha = DEMO_GIT.head.sha || DEMO_GIT.commits[0]?.sha;
        const newCommit = {
          sha,
          parents: parentSha ? [parentSha] : [],
          refs: `HEAD -> ${DEMO_GIT.head.branch || 'develop'}`,
          subject: message,
          author: 'Tú',
          date: Date.now(),
          files: [{ status: 'M', path: 'src/app.js' }],
        };
        DEMO_GIT.commits.unshift(newCommit);
        DEMO_GIT.head.sha = sha;
        notify({ op: 'commit', data: newCommit });
        return { ok: true, data: { sha, message } };
      },
      revert: async (targetSha) => {
        const target = DEMO_GIT.commits.find((c) => c.sha.startsWith(targetSha));
        const id = ++nextId;
        const sha = id.toString(16).padStart(7, '0').repeat(6).slice(0, 40);
        const parentSha = DEMO_GIT.head.sha || DEMO_GIT.commits[0]?.sha;
        const subject = target ? `Revert "${target.subject}"` : `Revert ${targetSha.slice(0, 7)}`;
        const newCommit = {
          sha,
          parents: parentSha ? [parentSha] : [],
          refs: `HEAD -> ${DEMO_GIT.head.branch || 'develop'}`,
          subject,
          author: 'Tú',
          date: Date.now(),
          files: [],
        };
        DEMO_GIT.commits.unshift(newCommit);
        DEMO_GIT.head.sha = sha;
        notify({ op: 'revert', sha, targetSha });
        return { ok: true, data: { sha, reverted: targetSha } };
      },
      reset: async (targetSha) => {
        const target = DEMO_GIT.commits.find((c) => c.sha.startsWith(targetSha));
        if (!target) return { ok: false, error: 'Commit no encontrado' };
        DEMO_GIT.head.sha = target.sha;
        notify({ op: 'reset', sha: target.sha });
        return { ok: true, data: { sha: target.sha } };
      },
      createBranch: async (name) => {
        DEMO_GIT.branches.push({ name, sha: DEMO_GIT.head.sha, remote: false });
        DEMO_GIT.head.branch = name;
        notify({ op: 'createBranch', name });
        return { ok: true, data: { name } };
      },
      checkout: async (target) => {
        const branch = DEMO_GIT.branches.find((b) => b.name === target);
        if (branch) {
          DEMO_GIT.head.branch = target;
          DEMO_GIT.head.sha = branch.sha;
        } else {
          const commit = DEMO_GIT.commits.find((c) => c.sha.startsWith(target));
          if (!commit) return { ok: false, error: `No se encontró rama o commit "${target}"` };
          DEMO_GIT.head.branch = null;
          DEMO_GIT.head.sha = commit.sha;
        }
        notify({ op: 'checkout', target });
        return { ok: true, data: { target } };
      },
      onChanged: (callback) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    };
  }

  return {
    isDesktop: true,
    commit: (message) => bridge.gitCommit(message),
    revert: (sha) => bridge.gitRevert(sha),
    reset: (sha) => bridge.gitReset(sha),
    createBranch: (name) => bridge.gitCreateBranch(name),
    checkout: (target) => bridge.gitCheckout(target),
    // Returns an unsubscribe fn. Fires ({ op, sha?, name?, target?, data }) on any git write.
    onChanged: (callback) => bridge.onGitChanged ? bridge.onGitChanged(callback) : () => {},
  };
}
