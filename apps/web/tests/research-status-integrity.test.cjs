const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const web = process.env.RESEARCH_STATUS_SOURCE || path.resolve(__dirname, '..');
const options = { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 };
function load(relative) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(web, relative), 'utf8'), { compilerOptions: options }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name.startsWith('@/')) return {};
    return require(name);
  } });
  return module.exports;
}
const { researchEventStatus: eventStatus, canApplyResearchSnapshot: accepts } = load('components/research-run-detail.tsx');
const { stagesForStatus, ResearchTimeline } = load('components/ocean/research-timeline.tsx');
const earlier = '2026-11-14T00:00:00Z';
const later = '2026-11-14T00:00:01Z';
const run = (status, updated_at = earlier) => ({ id: 'owned-run', name: 'Research', status, created_at: earlier, updated_at });

test('the server completion envelope preserves degraded research', () => {
  assert.equal(eventStatus('run.completed', { verified: false, degraded: true }), 'degraded');
  assert.equal(eventStatus('run.completed', { status: 'degraded' }), 'degraded');
  assert.equal(eventStatus('run.completed', { status: 'completed', degraded: true }), 'degraded');
  assert.equal(eventStatus('run.completed', { verified: true, degraded: false }), 'completed');
  assert.equal(eventStatus('run.completed', { status: 'completed' }), 'completed');
});

test('completion without a quality outcome waits for a detail read', () => {
  assert.equal(eventStatus('run.completed', {}), null);
  assert.equal(eventStatus('unknown.future.event', { status: 'completed' }), null);
  assert.equal(eventStatus('run.state', { status: 'future-state' }), null);
});

test('timeouts keep their distinct terminal state in current and legacy streams', () => {
  assert.equal(eventStatus('run.failed', { status: 'timed_out', message: 'provider timed out' }), 'timed_out');
  assert.equal(eventStatus('run.failed', { message: 'timed out' }), 'timed_out');
  assert.equal(eventStatus('run.failed', { message: 'provider failed' }), 'failed');
  assert.equal(eventStatus('run.canceled', {}), 'canceled');
});

test('a terminal run cannot regress even when an old response has a later timestamp', () => {
  for (const terminal of ['completed', 'degraded', 'failed', 'timed_out', 'canceled']) {
    assert.equal(accepts(run(terminal), run('running', later)), false, terminal);
    assert.equal(accepts(run(terminal), run(terminal, later)), true, `${terminal} metadata refresh`);
  }
  assert.equal(accepts(run('degraded'), run('completed', later)), false);
  assert.equal(accepts(run('timed_out'), run('failed', later)), false);
});

test('old phase and timestamp snapshots cannot replace newer state', () => {
  assert.equal(accepts(run('validating', later), run('running', later)), false);
  assert.equal(accepts(run('running', later), run('running', earlier)), false);
  assert.equal(accepts(run('running', earlier), run('validating', later)), true);
  assert.equal(accepts(null, run('running')), true);
});

test('a retry with a different run identity has its own lifecycle', () => {
  assert.equal(accepts(run('failed'), { ...run('queued'), id: 'new-retry-run' }), true);
});

test('terminal status alone cannot establish that sources, evidence or validation succeeded', () => {
  for (const status of ['completed', 'degraded', 'failed', 'timed_out', 'canceled']) {
    const nodes = stagesForStatus(status);
    for (const id of ['planner', 'sources', 'evidence', 'validation', 'artifact']) {
      assert.equal(nodes.find(node => node.id === id).status, 'unknown', `${status}/${id}`);
    }
  }
});

test('recorded content confirms only its own stages, not factual verification', () => {
  const nodes = stagesForStatus('degraded', { evidenceRecorded: true, artifactRecorded: true });
  for (const id of ['sources', 'evidence', 'artifact']) assert.equal(nodes.find(node => node.id === id).status, 'done', id);
  for (const id of ['planner', 'validation']) assert.equal(nodes.find(node => node.id === id).status, 'unknown', id);
  assert.ok(stagesForStatus('unknown-state').every(node => node.status === 'unknown'));
});

test('uncertain stages are explicitly readable in both interface languages', () => {
  for (const [locale, label] of [['en', 'Not confirmed'], ['zh', '未确认']]) {
    const html = renderToStaticMarkup(React.createElement(ResearchTimeline, { locale, nodes: stagesForStatus('failed') }));
    assert.equal(html.split(label).length - 1, 5);
  }
});
