import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityModel, demoScore, worstLevel, securityScore, scoreLevel } from '../../renderer/models/securityModel.js';

test('demo rules: secrets are red, templates yellow, plain code green', () => {
  assert.equal(demoScore('.env').level, 'red');
  assert.equal(demoScore('.env.example').level, 'yellow');
  assert.equal(demoScore('src/app.js').level, 'green');
});

test('an override keeps the original rule (reasonKey) and who set it', () => {
  const m = new SecurityModel();
  m.setScore('.env', 'yellow', 'plan listo', 'qubi');
  const s = m.scoreOf('.env');
  assert.equal(s.level, 'yellow');
  assert.equal(s.by, 'qubi');
  assert.equal(s.reasonKey, 'envFile');
});

test('invalid levels are rejected and worstLevel ranks red highest', () => {
  const m = new SecurityModel();
  assert.equal(m.setScore('a.js', 'purple'), false);
  assert.equal(worstLevel(['green', 'red', 'yellow']), 'red');
});

test('the security score follows the risks, not the share of files: each fix moves it', () => {
  assert.equal(securityScore({ red: 0, yellow: 0 }), 100);
  assert.equal(securityScore({ red: 1, yellow: 2 }), 75);
  assert.equal(securityScore({ red: 0, yellow: 2 }), 90); // the red one is fixed: +15
  assert.equal(securityScore({ red: 0, yellow: 3 }), 85); // a red one went to "to review": +10
  assert.equal(securityScore({ red: 9, yellow: 0 }), 0); // never below zero
  assert.equal(scoreLevel({ red: 1, yellow: 0 }), 'red');
  assert.equal(scoreLevel({ red: 0, yellow: 3 }), 'yellow');
  assert.equal(scoreLevel({ red: 0, yellow: 0 }), 'green');
});

test('with an audit the lights come from what the files say, for the whole project', () => {
  const m = new SecurityModel();
  m.applyAudit({
    at: '2026-10-24T10:00:00.000Z', score: 80, counts: { red: 1, yellow: 1, green: 2, grey: 0 }, history: [{ at: 'x', score: 80, red: 1, yellow: 1, cause: 'open', paths: [] }],
    files: {
      'src/orders.ts': { level: 'red', findings: [{ rule: 'sqlInjection', level: 'red', line: 12 }, { rule: 'evalUse', level: 'yellow', line: 20 }] },
      'db/001_init.sql': { level: 'green', findings: [] },
      Dockerfile: { level: 'green', findings: [{ rule: 'dockerRoot', level: 'yellow', line: 1 }], accepted: true },
    },
  });
  assert.equal(m.audited, true);
  const orders = m.scoreOf('src/orders.ts');
  assert.equal(orders.level, 'red');
  assert.equal(orders.by, 'audit');
  assert.equal(orders.reasonKey, 'sqlInjection');
  assert.match(orders.reason, /^Línea 12: .*inyección SQL.*\(y 1 cosa más\)$/);
  assert.equal(m.scoreOf('db/001_init.sql').level, 'green', 'a .sql file is not yellow just for its name');
  assert.equal(m.scoreOf('Dockerfile').by, 'accepted');
  assert.equal(m.store.state.score, 80);
  assert.deepEqual(m.findingsOf('src/orders.ts').map((f) => f.line), [12, 20]);
});

test('an agent may raise a light over the audit, never lower it', () => {
  const m = new SecurityModel();
  m.applyAudit({ files: { 'a.ts': { level: 'red', findings: [{ rule: 'sqlInjection', level: 'red', line: 1 }] }, 'b.ts': { level: 'green', findings: [] } }, score: 85, counts: {}, history: [] });
  m.setScore('a.ts', 'green', 'Todo bien', 'agent');
  assert.equal(m.scoreOf('a.ts').level, 'red', 'the agent saying "fine" does not hide the finding');
  m.setScore('b.ts', 'yellow', 'Falta validar la entrada', 'agent');
  assert.deepEqual([m.scoreOf('b.ts').level, m.scoreOf('b.ts').by], ['yellow', 'agent']);
  m.setScore('a.ts', 'green', 'plan', 'qubi');
  assert.equal(m.scoreOf('a.ts').level, 'red', 'nor does Qubi\'s plan');
  m.applyAudit(null);
  assert.equal(m.audited, false);
  assert.equal(m.scoreOf('a.ts').by, 'demo', 'no audit: the demo rules again');
});
