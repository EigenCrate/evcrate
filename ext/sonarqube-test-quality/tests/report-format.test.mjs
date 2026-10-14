import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { convertReport } from '../scripts/convert-sonar-report.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(packageRoot, 'scripts', 'convert-sonar-report.mjs');
const issue = {
  key: 'AX-1', rule: 'javascript:S1874', message: 'Avoid deprecated API',
  component: 'app:src/api.js', severity: 'MAJOR', status: 'OPEN',
  impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'HIGH' }],
  textRange: { startLine: 12, endLine: 14, startOffset: 0, endOffset: 8 },
  flows: [{ locations: [{ component: 'app:src/caller.js', msg: 'Call site', line: 7 }] }],
  secondaryLocations: [{ file: 'src/other.js', textRange: { startLine: 9 }, message: 'Related' }],
  vendorAction: { explanation: 'Keep actionable extensions' },
};
const workItem = {
  id: 'AX-1', file: 'src/api.js', uncovered: { lines: ['12-14'], branches: ['12:false'] },
  detail: 'Fallback response is not exercised', testToAdd: 'Reject a failed request and assert fallback response',
  localStatus: 'tests passed; coverage not remeasured', serverVerification: 'unverified',
  scope: 'overall', cycle: 1, revision: 'abc123', inputDigest: 'sha-native-input',
  analysisId: 'analysis-17', evidence: { report: 'coverage/lcov.info', sourceInspection: 'src/api.js:12' },
  vendorNotes: [{ branch: '12:false', reason: 'rejection path' }, { branch: '14:true', reason: 'empty response' }],
};
const envelope = {
  run: { target: 'app', branch: 'feature/test', revision: 'abc123', N: 2, count: 0,
    sourceDigests: { app: 'sha-source' }, pendingTaskIds: ['task-17'] },
  issues: [{ paging: { pageIndex: 1, pageSize: 2, total: 1 }, issues: [issue],
    components: [{ key: 'app:src/api.js', path: 'src/api.js' }, { key: 'app:src/caller.js', path: 'src/full/caller.js' }],
    rules: [{ key: issue.rule, name: 'Deprecated API rule' }] }],
  hotspots: [{ paging: { pageIndex: 1, pageSize: 2, total: 1 }, hotspots: [{ key: 'HS-1',
    component: 'app:src/auth.js', line: 3, status: 'TO_REVIEW', message: 'Sensitive API',
    securityCategory: 'auth', vulnerabilityProbability: 'HIGH', author: 'owner@example.test' }] }],
  measures: [{ component: { key: 'app', measures: [
    { metric: 'coverage', value: '0' },
    { metric: 'new_coverage', period: { index: 1, value: '76.5' } },
    { metric: 'uncovered_lines', value: '19' },
    { metric: 'tests', value: '201' },
    { metric: 'custom_metric', periods: [] },
  ] }, periods: [{ index: 1, mode: 'previous_version', date: '2026-10-01' }] },
  { baseComponent: { key: 'app' }, paging: { pageIndex: 1, pageSize: 2, total: 1 },
    components: [{ key: 'app:src/api.js', path: 'src/api.js', qualifier: 'FIL', measures: [
      { metric: 'coverage', value: '54.2' }, { metric: 'uncovered_conditions', value: '8' },
      { metric: 'new_uncovered_lines', periods: [{ index: 1, value: '4' }] },
    ] }] }],
  qualityGate: { projectStatus: { status: 'ERROR', conditions: [{ metricKey: 'new_coverage',
    comparator: 'LT', errorThreshold: '80', actualValue: '76.5', status: 'ERROR', periodIndex: 1 }],
    ignoredConditions: false, caycStatus: 'non-compliant' } },
  coverageWorkItems: [workItem],
};
function run(args, input, executable = script, cwd = packageRoot) {
  return spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8', input, cwd });
}
function success(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout;
}
function failure(result, message) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, message);
}
// Read actual consumer cells; do not pin incidental prose, whitespace or ordering.
function rows(report) {
  return report.split('\n').filter((line) => line.startsWith('| '))
    .map((line) => line.slice(2, -2).split(' | '));
}
function sectionRows(report, heading) {
  const section = report.split(`## ${heading}\n`)[1];
  assert.notEqual(section, undefined, `Missing consumer section: ${heading}`);
  return rows(section.split('\n## ')[0]);
}
function finding(report, id) { return sectionRows(report, 'Issues and hotspots').find((row) => row.length === 6 && row[0].includes(id)); }
function metric(report, name, value) { return sectionRows(report, 'Coverage summary and checks').find((row) => row.length === 5 && row[1].includes(name) && row[2] === value); }
function workItems(report) { return sectionRows(report, 'Coverage work items').slice(2); }

describe('actionable offline report conversion', () => {
  let tempRoot;
  beforeEach(() => { tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-report-')); });
  afterEach(() => { fs.rmSync(tempRoot, { recursive: true, force: true }); });

  test('combined evidence includes findings, full locations, MQR, file coverage and observed gate', () => {
    const output = convertReport(JSON.stringify(envelope));
    const row = finding(output, 'AX-1');
    assert.equal(row.length, 6);
    assert.ok(row[1].includes('src/api.js (app:src/api.js)'));
    assert.ok(row[1].includes('lines 12–14') && row[1].includes('offsets 0–8'));
    for (const value of [issue.rule, 'MAJOR', 'MAINTAINABILITY', 'HIGH', 'app:src/caller.js',
      'Call site', '7', 'src/other.js', 'Related', 'Keep actionable extensions', 'Deprecated API rule']) assert.ok(row[2].includes(value), value);
    assert.match(row[3], /not supplied/);
    assert.equal(row[4], 'OPEN');
    const hotspot = finding(output, 'HS-1');
    assert.equal(hotspot[4], 'TO_REVIEW');
    assert.ok(hotspot[2].includes('owner@example.test'));
    assert.match(hotspot[5], /Owner review/);
    assert.ok(metric(output, 'coverage', '0'));
    assert.ok(metric(output, 'new_coverage', '76.5'));
    assert.ok(metric(output, 'uncovered_lines', '19'));
    assert.ok(metric(output, 'tests', '201'));
    assert.ok(metric(output, 'custom_metric', 'not supplied'));
    assert.ok(metric(output, 'coverage', '54.2')[0].includes('src/api.js'));
    assert.ok(metric(output, 'new_uncovered_lines', '4')[1].includes('period 1'));
    assert.ok(row[2].includes('src/full/caller.js'));
    assert.ok(metric(output, 'quality gate', 'ERROR'));
    const gateCondition = rows(output).find((r) => r.length === 5 && r[1].includes('new_coverage') && r[3].includes('80'));
    assert.equal(gateCondition[2], '76.5');
    assert.ok(output.includes('sha-source') && output.includes('task-17') && output.includes('abc123'));
    assert.ok(!output.includes('```'));
    const coverage = workItems(output);
    assert.equal(coverage.length, 1);
    assert.equal(coverage[0].length, 6);
    assert.equal(coverage[0][0], 'app / src/api.js');
    assert.equal(coverage[0][3], workItem.testToAdd);
    assert.equal(coverage[0][4], workItem.localStatus);
    assert.equal(coverage[0][5], workItem.serverVerification);
    assert.ok(coverage[0][2].includes('id: AX-1'));
    assert.ok(!sectionRows(output, 'Issues and hotspots').some((row) => row[2]?.includes(workItem.detail)));
    assert.ok(!sectionRows(output, 'Coverage summary and checks').some((row) => row.some((cell) => cell.includes(workItem.testToAdd))));
    assert.ok(output.indexOf('## Coverage summary and checks') < output.indexOf('## Coverage work items'));
    assert.ok(output.indexOf('## Coverage work items') < output.indexOf('## Cycle history'));
  });

  test('MQR and legacy server states remain distinct from local progress and bound to envelope target', () => {
    const report = convertReport(JSON.stringify({ projectKey: 'app', issues: { issues: [
      { key: 'MQR-1', component: 'app:src/a.js', issueStatus: 'FIXED' },
      { key: 'MIXED-1', component: 'app:src/b.js', issueStatus: 'ACCEPTED', status: 'RESOLVED',
        resolution: 'WONTFIX', localStatus: 'identified' },
    ], paging: { pageIndex: 1, pageSize: 500, total: 2 } } }));
    const mqr = finding(report, 'MQR-1');
    assert.equal(mqr[0], 'app / issue MQR-1');
    assert.equal(mqr[4], 'FIXED');
    assert.equal(mqr[3], 'not supplied');
    const mixed = finding(report, 'MIXED-1');
    assert.ok(mixed[4].includes('ACCEPTED') && mixed[4].includes('RESOLVED') && mixed[4].includes('WONTFIX'));
    assert.equal(mixed[3], 'identified');
  });

  test('work-item identities bind same-file gaps, targets and moved-line history without deduplication', () => {
    const observations = [
      { ...workItem, target: 'one', id: 'gap-1', localStatus: 'identified', evidence: { native: 'one-initial' } },
      { ...workItem, target: 'two', id: 'gap-1', localStatus: 'deferred', evidence: { native: 'two-initial' } },
      { ...workItem, target: 'one', id: 'gap-2', uncovered: ['19:true'], detail: 'Empty result', testToAdd: 'Return empty list', evidence: { native: 'one-empty' } },
      { ...workItem, target: 'one', id: 'gap-1', uncovered: { lines: ['22-24'], branches: ['22:false'] },
        cycle: 2, revision: 'def456', localStatus: 'new tests passed; native evidence pending', evidence: { native: 'one-moved' } },
    ];
    const input = { run: { target: 'fallback' }, coverageWorkItems: observations };
    const report = success(run(['--input', '-'], JSON.stringify(input)));
    assert.equal(report, convertReport(JSON.stringify(input)));
    const actual = workItems(report);
    assert.equal(actual.length, observations.length);
    observations.forEach((item, index) => {
      const row = actual[index];
      assert.equal(row.length, 6);
      assert.equal(row[0], `${item.target} / ${item.file}`);
      assert.ok(row[2].includes(`id: ${item.id}`) && row[2].includes(`native: ${item.evidence.native}`));
      assert.equal(row[3], item.testToAdd);
      assert.equal(row[4], item.localStatus);
      assert.equal(row[5], item.serverVerification);
      assert.ok(!row[2].includes('localStatus:') && !row[2].includes('serverVerification:'));
    });
    assert.ok(actual[0][1].includes('12-14') && !actual[0][1].includes('22-24'));
    assert.ok(actual[2][1].includes('19:true') && actual[2][2].includes('Empty result'));
    assert.ok(actual[3][1].includes('22-24') && actual[3][2].includes('cycle: 2') && actual[3][2].includes('revision: def456'));
    for (const value of ['scope: overall', 'analysisId: analysis-17', 'inputDigest: sha-native-input',
      'report: coverage/lcov.info', 'sourceInspection: src/api.js:12',
      'vendorNotes: #1 (branch: 12:false; reason: rejection path); #2 (branch: 14:true; reason: empty response)']) {
      assert.ok(workItems(convertReport(JSON.stringify(envelope)))[0][2].includes(value), value);
    }
  });

  test('workitems-only envelopes inherit normalized target while explicit targets override it', () => {
    for (const context of [{ target: 'root' }, { projectKey: 'root' }, { project: { key: 'root' } },
      { run: { target: 'root' } }, { run: { projectKey: 'root' } }]) {
      const input = { ...context, coverageWorkItems: [workItem, { ...workItem, target: 'override', id: 'other' }] };
      const report = success(run(['--input', '-'], JSON.stringify(input)));
      assert.equal(report, convertReport(JSON.stringify(input)));
      assert.deepEqual(workItems(report).map((row) => row[0]), ['root / src/api.js', 'override / src/api.js']);
      for (const kind of ['issues', 'hotspots']) {
        const missing = sectionRows(report, 'Coverage summary and checks').find((row) => row[1] === `${kind} capture`);
        assert.ok(missing && missing[2] === 'not supplied' && missing[4].includes('not zero'));
      }
    }
  });

  test('mixed envelope and run target aliases follow the same precedence as existing issue binding', () => {
    for (const [context, expected] of [
      [{ projectKey: 'outer', run: { projectKey: 'inner' } }, 'outer'],
      [{ target: 'outer', run: { target: 'inner', projectKey: 'other' } }, 'inner'],
    ]) {
      const input = { ...context, issues: envelope.issues, coverageWorkItems: [workItem] };
      const report = success(run(['--input', '-'], JSON.stringify(input)));
      assert.equal(finding(report, 'AX-1')[0], `${expected} / issue AX-1`);
      assert.equal(workItems(report)[0][0], `${expected} / src/api.js`);
    }
  });

  test('raw API captures with work items retain summary evidence without duplicating the actionable view', () => {
    const input = { target: 'app', issues: [issue], paging: { pageIndex: 1, pageSize: 1, total: 1 },
      component: { key: 'app', measures: [{ metric: 'coverage', value: '42' }] },
      projectStatus: { status: 'OK', conditions: [] }, coverageWorkItems: [workItem] };
    const report = success(run(['--input', '-'], JSON.stringify(input)));
    assert.equal(workItems(report).length, 1);
    assert.ok(finding(report, 'AX-1') && metric(report, 'coverage', '42') && metric(report, 'quality gate', 'OK'));
    for (const row of sectionRows(report, 'Coverage summary and checks')) {
      assert.ok(!row.some((cell) => cell.includes(workItem.testToAdd) || cell.includes(workItem.detail)));
    }
  });

  test('passing tests and server aggregates never supply absent work-item status or branch verification', () => {
    const supplied = { ...workItem, target: 'app', localStatus: { tests: 'passed', coverage: 'not remeasured' },
      serverVerification: { fileMetric: '100', branchTask: 'unverified', analysisId: 'fresh-file-analysis' } };
    const absent = { id: 'missing-state', target: 'app', file: 'src/api.js', uncovered: ['12:false'] };
    const input = { coverageWorkItems: [supplied, absent],
      measures: { component: { key: 'app', measures: [{ metric: 'coverage', value: '100' }, { metric: 'tests', value: '201' }] } },
      qualityGate: { target: 'app', projectStatus: { status: 'OK' } } };
    const report = success(run(['--input', '-'], JSON.stringify(input)));
    const actual = workItems(report);
    assert.equal(actual[0][4], 'tests: passed; coverage: not remeasured');
    assert.equal(actual[0][5], 'fileMetric: 100; branchTask: unverified; analysisId: fresh-file-analysis');
    assert.deepEqual(actual[1].slice(3), ['not supplied', 'not supplied', 'not supplied']);
    assert.ok(!actual[1][2].includes('overall') && !actual[1][2].includes('new code'));
    assert.ok(metric(report, 'coverage', '100') && metric(report, 'quality gate', 'OK'));
  });

  test('absent and empty work items render an empty unavailable table, never invented tasks or proof of no gaps', () => {
    for (const input of [{ issues: [] }, { coverageWorkItems: [] }, { ...envelope, coverageWorkItems: [] }]) {
      const report = success(run(['--input', '-'], JSON.stringify(input)));
      assert.equal(report, convertReport(JSON.stringify(input)));
      const cells = sectionRows(report, 'Coverage work items');
      assert.equal(cells.length, 2);
      assert.deepEqual(cells[0], ['Target / file', 'Uncovered lines / branches', 'Detail', 'Test to add', 'Local status', 'Server verification']);
      const section = report.split('## Coverage work items\n')[1].split('\n## ')[0];
      assert.match(section, /unavailable|not supplied/);
      assert.ok(!/no gaps|all (?:gaps|work items) (?:closed|covered)|clean|zero remaining/i.test(section));
    }
  });

  test('empty gap locations remain unavailable despite passing aggregate coverage', () => {
    for (const uncovered of [undefined, null, '', '  ', [], {}]) {
      const report = success(run(['--input', '-'], JSON.stringify({
        coverageWorkItems: [{ ...workItem, target: 'app', uncovered }],
        measures: { component: { key: 'app', measures: [{ metric: 'coverage', value: '100' }] } },
      })));
      const [row] = workItems(report);
      assert.equal(row[1], 'not supplied');
      assert.equal(row[5], workItem.serverVerification);
      assert.ok(metric(report, 'coverage', '100'));
    }
  });

  test('malformed work-item collections and entries fail structurally without creating output', () => {
    const output = path.join(tempRoot, 'sonar-report.md');
    for (const coverageWorkItems of [null, {}, 'not an array', [null], [[]], [42], [workItem, false]]) {
      const input = JSON.stringify({ ...envelope, coverageWorkItems });
      assert.throws(() => convertReport(input), /Unsupported coverageWorkItems|Unsupported coverage work item/);
      failure(run(['--input', '-', '--output', output], input), /Unsupported coverageWorkItems|Unsupported coverage work item/);
      assert.ok(!fs.existsSync(output));
    }
  });

  test('incomplete work-item identity exits two without suppressing usable issues, metrics or observations', () => {
    const good = { ...workItem, target: 'app' };
    const invalid = [
      [{ ...good, id: undefined }, 'id'], [{ ...good, file: undefined }, 'file'],
      [{ ...workItem }, 'target'], [{ ...good, id: '  ' }, 'id'],
      [{ ...good, target: '' }, 'target'], [{ ...good, file: [] }, 'file'],
      [{ ...good, id: 7 }, 'id'], [{ ...good, target: { observed: 'bad-target' } }, 'target'],
      [{ ...good, file: { observed: 'bad-file' } }, 'file'],
    ];
    for (const [item, missing] of invalid) {
      const input = JSON.stringify({ issues: envelope.issues, measures: envelope.measures, coverageWorkItems: [good, item] });
      const result = run(['--input', '-'], input);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Incomplete/);
      assert.equal(result.stdout, convertReport(input));
      const actual = workItems(result.stdout);
      assert.equal(actual.length, 2);
      assert.equal(actual[0][0], 'app / src/api.js');
      assert.equal(actual[1][3], workItem.testToAdd);
      assert.equal(actual[1][4], workItem.localStatus);
      assert.equal(actual[1][5], workItem.serverVerification);
      assert.ok(finding(result.stdout, 'AX-1') && metric(result.stdout, 'coverage', '54.2'));
      const blockers = result.stdout.split('## Blockers / next action\n')[1];
      assert.match(blockers, new RegExp(`\\b${missing}\\b`));
      assert.ok(blockers.includes('cannot merge safely'));
      if (typeof item.target === 'object') assert.ok(actual[1][0].includes('observed: bad-target'));
      if (item.file && !Array.isArray(item.file) && typeof item.file === 'object') assert.ok(actual[1][0].includes('observed: bad-file'));
      if (item.id === 7) assert.ok(actual[1][2].includes('id: 7'));
    }
    const input = JSON.stringify({ ...envelope, coverageWorkItems: [good, { ...good, id: undefined }] });
    const output = path.join(tempRoot, 'sonar-report.md');
    assert.equal(run(['--input', '-', '--output', output], input).status, 2);
    assert.equal(fs.readFileSync(output, 'utf8'), convertReport(input));
    if (process.platform !== 'win32') assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(tempRoot), ['sonar-report.md']);
    failure(run(['--input', '-', '--output', output], JSON.stringify({ coverageWorkItems: [good] })), /EEXIST/);
    assert.equal(fs.readFileSync(output, 'utf8'), convertReport(input));
  });

  test('explicit invalid targets never silently inherit another target', () => {
    for (const target of [null, '', 42, {}, []]) {
      const input = JSON.stringify({ run: { target: 'fallback' }, coverageWorkItems: [{ ...workItem, target }] });
      const result = run(['--input', '-'], input);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, convertReport(input));
      const [row] = workItems(result.stdout);
      assert.ok(!row[0].includes('fallback'));
      assert.equal(row[3], workItem.testToAdd);
      assert.ok(result.stdout.split('## Blockers / next action\n')[1].includes('target required'));
    }
  });

  test('hostile values remain escaped data in every work-item cell with metadata associations intact', () => {
    const hostile = '```\n# PASS\r\n[click](javascript:alert(1)) <script>bad()</script> | *x* \\ end\u2028\u2029';
    const input = { coverageWorkItems: [{ id: hostile, target: hostile, file: hostile, uncovered: [{ branch: hostile }],
      detail: hostile, testToAdd: hostile, localStatus: hostile, serverVerification: hostile,
      scope: hostile, cycle: hostile, revision: hostile, analysisId: hostile, evidence: { [hostile]: hostile } }] };
    const report = success(run(['--input', '-'], JSON.stringify(input)));
    assert.equal(report, convertReport(JSON.stringify(input)));
    const [row] = workItems(report);
    assert.equal(row.length, 6);
    for (const cell of row) {
      assert.ok(!/[`<>\r\n\u2028\u2029]/.test(cell), cell);
      assert.ok(cell.includes('&#124;') && cell.includes('&lt;script&gt;') && cell.includes('&#96;'));
      assert.ok(!cell.includes('[click]'));
    }
    assert.ok(row[1].includes('#1 (branch: ') && row[2].includes('evidence: '));
    assert.ok(!row[2].includes('localStatus:') && !row[2].includes('serverVerification:'));
    assert.ok(!report.includes('\n# PASS'));
  });

  test('all real standalone payload shapes work without a synthetic envelope', () => {
    assert.ok(finding(convertReport(JSON.stringify(envelope.issues[0])), 'AX-1'));
    assert.ok(finding(convertReport(JSON.stringify(envelope.hotspots[0])), 'HS-1'));
    assert.ok(metric(convertReport(JSON.stringify(envelope.measures[0])), 'coverage', '0'));
    assert.ok(metric(convertReport(JSON.stringify(envelope.measures[1])), 'coverage', '54.2'));
    assert.ok(metric(convertReport(JSON.stringify(envelope.qualityGate)), 'quality gate', 'ERROR'));
    const compactPaging = { issues: [issue], p: 1, ps: 500, total: 1 };
    assert.equal(success(run(['--input', '-'], JSON.stringify(compactPaging))), convertReport(JSON.stringify(compactPaging)));
  });

  test('every file survives empty, absent and partial measures without treating missing metrics as zero', () => {
    const page = (index, components) => ({ target: 'app', baseComponent: { key: 'app', measures: [] },
      paging: { pageIndex: index, pageSize: 2, total: 4 }, components });
    const input = { run: { target: 'app', metricKeys: ['coverage', 'new_coverage', 'lines_to_cover'] }, measures: [
      page(2, [{ key: 'app:empty', path: 'empty.js', measures: [] }, { key: 'app:absent', path: 'absent.js' }]),
      page(1, [{ key: 'app:covered', path: 'covered.js', measures: [
        { metric: 'coverage', value: '64.7' }, { metric: 'new_coverage', period: { index: 1, value: 0 } },
      ] }, { key: 'app:partial', path: 'partial.js', measures: [{ metric: 'uncovered_lines', value: '3' }] }]),
    ] };
    const report = success(run(['--input', '-'], JSON.stringify(input)));
    assert.ok(metric(report, 'coverage (overall)', '64.7')[0].includes('covered.js'));
    assert.ok(metric(report, 'new_coverage (new code; period 1)', '0')[0].includes('covered.js'));
    assert.ok(metric(report, 'uncovered_lines', '3')[0].includes('partial.js'));
    for (const file of ['covered.js', 'partial.js', 'empty.js', 'absent.js']) {
      const missing = rows(report).filter((row) => row.length === 5 && row[0].includes(file) && row[1].startsWith('missing metrics:'));
      assert.equal(missing.length, 1);
      assert.equal(missing[0][2], 'not supplied');
      assert.ok(missing[0][1].includes('lines_to_cover'));
      assert.ok(missing[0][4].includes('not zero'));
      if (file !== 'covered.js') {
        assert.ok(missing[0][1].includes('coverage (overall)') && missing[0][1].includes('new_coverage (new code)'));
        assert.ok(!rows(report).some((row) => row.length === 5 && row[0].includes(file) && row[2] === '0'));
      } else assert.ok(!missing[0][1].includes('coverage'));
      if (file !== 'partial.js') assert.ok(missing[0][1].includes('uncovered_lines'));
    }
  });

  test('requested and observed measure names stay bound to their own target', () => {
    const report = convertReport(JSON.stringify({ metricKeys: 'coverage,new_coverage', measures: [
      { target: 'one', metricKeys: ['lines_to_cover'], component: { key: 'one', measures: [{ metric: 'tests', value: '12' }] } },
      { projectKey: 'two', component: { key: 'two', measures: [] } },
    ] }));
    const missing = rows(report).filter((row) => row.length === 5 && row[1].startsWith('missing metrics:'));
    const one = missing.find((row) => row[0] === 'one / one');
    const two = missing.find((row) => row[0] === 'two / two');
    assert.ok(one[1].includes('lines_to_cover') && !one[1].includes('tests'));
    assert.ok(!two[1].includes('lines_to_cover') && !two[1].includes('tests'));
    assert.equal(one[2], 'not supplied');
    assert.equal(two[2], 'not supplied');
    assert.equal(metric(report, 'tests', '12')[0], 'one / one');
  });

  test('metric names without overall or period values remain missing while zero remains supplied', () => {
    const input = { target: 'app', paging: { pageIndex: 1, pageSize: 4, total: 4 }, components: [
      { key: 'absent-value', measures: [{ metric: 'coverage' }, { metric: 'new_coverage', period: { index: 1 } }] },
      { key: 'null-value', measures: [{ metric: 'coverage', value: null }, { metric: 'new_coverage', periods: [{ index: 1, value: null }] }] },
      { key: 'empty-periods', measures: [{ metric: 'coverage', periods: [] }, { metric: 'new_coverage', periods: [] }] },
      { key: 'zero-value', measures: [{ metric: 'coverage', value: 0 }, { metric: 'new_coverage', periods: [{ index: 1, value: '0' }] }] },
    ] };
    const report = success(run(['--input', '-'], JSON.stringify(input)));
    for (const file of ['absent-value', 'null-value', 'empty-periods']) {
      const missing = rows(report).filter((row) => row.length === 5 && row[0] === `app / ${file}` && row[1].startsWith('missing metrics:'));
      assert.equal(missing.length, 1);
      assert.ok(missing[0][1].includes('coverage (overall)') && missing[0][1].includes('new_coverage (new code)'));
      assert.equal(missing[0][2], 'not supplied');
      assert.ok(missing[0][4].includes('not zero'));
    }
    assert.ok(!rows(report).some((row) => row.length === 5 && row[0] === 'app / zero-value' && row[1].startsWith('missing metrics:')));
    assert.equal(metric(report, 'coverage (overall)', '0')[0], 'app / zero-value');
    assert.equal(metric(report, 'new_coverage (new code; period 1)', '0')[0], 'app / zero-value');
  });

  test('per-target gate arrays retain conflicting observations and bind every condition independently', () => {
    const input = { run: { target: 'fallback' }, qualityGate: [
      { target: 'one', projectStatus: { status: 'OK', conditions: [
        { metricKey: 'coverage', actualValue: '95', comparator: 'LT', errorThreshold: '80', status: 'OK' },
        { metricKey: 'bugs', actualValue: '0', comparator: 'GT', errorThreshold: '0', status: 'OK' },
      ] } },
      { projectKey: 'two', projectStatus: { status: 'ERROR', conditions: [
        { metricKey: 'coverage', actualValue: '20', comparator: 'LT', errorThreshold: '80', status: 'ERROR' },
      ] } },
      { target: 'one', projectStatus: { status: 'ERROR', conditions: [
        { metricKey: 'coverage', actualValue: '12', comparator: 'LT', errorThreshold: '80', status: 'ERROR' },
      ] } },
    ] };
    const report = success(run(['--input', '-'], JSON.stringify(input)));
    assert.equal(metric(report, 'quality gate', 'OK')[0], 'one');
    assert.equal(metric(report, 'quality gate', 'ERROR')[0], 'two');
    for (const [target, name, value] of [['one', 'coverage', '95'], ['one', 'bugs', '0'], ['two', 'coverage', '20'], ['one', 'coverage', '12']]) {
      assert.equal(metric(report, name, value)[0], target);
    }
    assert.deepEqual(rows(report).filter((row) => row.length === 5 && row[0] === 'one' && row[1] === 'quality gate').map((row) => row[2]), ['OK', 'ERROR']);
    const failed = run(['--input', '-'], JSON.stringify({ qualityGate: [{ target: 'two', errors: ['Gate unavailable'] }] }));
    assert.equal(failed.status, 2);
    assert.equal(metric(failed.stdout, 'quality gate', 'not supplied')[0], 'two');
    assert.ok(failed.stdout.includes('Gate unavailable'));
    assert.equal(failed.stdout, convertReport(JSON.stringify({ qualityGate: [{ target: 'two', errors: ['Gate unavailable'] }] })));
    const absent = success(run(['--input', '-'], JSON.stringify({ qualityGate: [] })));
    assert.ok(metric(absent, 'quality gate', 'not supplied'));
  });

  test('only combined envelopes mark absent issues and hotspots; explicitly captured zero stays separate', () => {
    const empty = (kind) => ({ [kind]: [], paging: { pageIndex: 1, pageSize: 500, total: 0 } });
    const missingCapture = (report, kind) => rows(report).find((row) => row.length === 5 && row[1] === `${kind} capture` && row[2] === 'not supplied');
    for (const input of [
      { run: { target: 'app' } }, { measures: envelope.measures[0] }, { qualityGate: envelope.qualityGate },
      { issues: empty('issues') }, { hotspots: [empty('hotspots')] },
    ]) {
      const report = convertReport(JSON.stringify(input.run ? { ...input, qualityGate: envelope.qualityGate } : input));
      for (const kind of ['issues', 'hotspots']) {
        const missing = missingCapture(report, kind);
        assert.equal(Boolean(missing), input[kind] === undefined);
        if (missing) assert.ok(missing[4].includes('not zero'));
      }
    }
    for (const kind of ['issues', 'hotspots']) {
      for (const standalone of [empty(kind), { [kind]: [] }]) {
        const report = convertReport(JSON.stringify({ ...standalone, projectKey: 'app', components: [] }));
        assert.ok(!missingCapture(report, kind === 'issues' ? 'hotspots' : 'issues'));
      }
    }
    const report = convertReport(JSON.stringify({ run: {}, issues: empty('issues'), hotspots: empty('hotspots') }));
    assert.ok(!missingCapture(report, 'issues') && !missingCapture(report, 'hotspots'));
  });

  test('nested flows and impacts keep numbered element boundaries and associations', () => {
    const report = convertReport(JSON.stringify({ issues: [{ key: 'FLOW-1', impacts: [
      { softwareQuality: 'SECURITY', severity: 'HIGH' }, { softwareQuality: 'RELIABILITY', severity: 'LOW' },
    ], flows: [
      { locations: [{ component: 'a.js', line: 1 }, { component: 'b.js', line: 2 }] },
      { locations: [{ component: 'c.js', line: 3 }, { component: 'd.js', line: 4 }] },
    ] }] }));
    const detail = finding(report, 'FLOW-1')[2];
    assert.ok(detail.includes('impacts: #1 (softwareQuality: SECURITY; severity: HIGH); #2 (softwareQuality: RELIABILITY; severity: LOW)'));
    assert.ok(detail.includes('flows: #1 (locations: #1 (component: a.js; line: 1); #2 (component: b.js; line: 2)); #2 (locations: #1 (component: c.js; line: 3); #2 (component: d.js; line: 4))'));
  });

  test('primary line and range survive together; malformed ranges remain attached as safe detail', () => {
    const report = convertReport(JSON.stringify({ issues: [
      { key: 'RANGE-1', path: 'a.js', line: 7, textRange: { ...issue.textRange, vendor: 'retained-range' } },
      { key: 'RANGE-2', path: 'b.js', line: 9, textRange: '<bad>|range' },
      { key: 'RANGE-3', path: 'c.js', line: 11, textRange: { startLine: 'unknown', endLine: 4, vendor: 'range detail' } },
    ] }));
    const valid = finding(report, 'RANGE-1');
    assert.ok(valid[1].includes('a.js:7') && valid[1].includes('lines 12–14') && valid[1].includes('offsets 0–8'));
    assert.ok(valid[2].includes('textRange metadata: vendor: retained-range'));
    const malformed = finding(report, 'RANGE-2');
    assert.equal(malformed[1], 'b.js:9');
    assert.ok(malformed[2].includes('textRange: &lt;bad&gt;&#124;range'));
    const partial = finding(report, 'RANGE-3');
    assert.equal(partial[1], 'c.js:11');
    assert.ok(partial[2].includes('textRange: startLine: unknown; endLine: 4; vendor: range detail'));
  });

  test('nested paging aliases sort and account consistently for issues, hotspots and component trees', () => {
    const variants = [
      (p) => ({ paging: { p, ps: 1, total: 2 } }),
      (p) => ({ paging: { total: 2 }, p, ps: 1 }),
      (p) => ({ paging: { pageIndex: p, p: 99, pageSize: 1, ps: 99, total: 2 }, p: 99, ps: 99 }),
    ];
    for (const kind of ['issues', 'hotspots', 'components']) for (const paging of variants) {
      const page = (p) => ({ target: 'app', ...paging(p), [kind]: [
        kind === 'components' ? { key: `file-${p}`, path: `file-${p}.js`, measures: [] } : { key: `finding-${p}` },
      ] });
      const input = kind === 'components' ? { measures: [page(2), page(1)] } : { [kind]: [page(2), page(1)] };
      const report = success(run(['--input', '-'], JSON.stringify(input)));
      const completeness = rows(report).find((row) => row.length === 5 && row[0] === `app / ${kind}` && row[1] === 'capture completeness');
      assert.ok(completeness && !completeness[2].includes('Incomplete'));
      const gap = kind === 'components' ? { measures: [page(2)] } : { [kind]: [page(2)] };
      assert.equal(run(['--input', '-'], JSON.stringify(gap)).status, 2);
    }
  });

  test('all pages and rows survive; gaps, duplicates, inconsistent totals and absent paging stay honest', () => {
    const page = (index, id, total = 2) => ({ paging: { pageIndex: index, pageSize: 1, total }, issues: [{ ...issue, key: id }] });
    const complete = { run: { target: 'app' }, issues: [page(2, 'AX-2'), page(1, 'AX-1')] };
    const output = success(run(['--input', '-'], JSON.stringify(complete)));
    assert.ok(finding(output, 'AX-1') && finding(output, 'AX-2'));
    for (const input of [
      { issues: [page(2, 'AX-2')] }, { issues: [page(1, 'AX-1'), page(1, 'AX-2')] },
      { issues: [page(1, 'AX-1'), page(2, 'AX-1')] }, { issues: [page(1, 'AX-1'), page(2, 'AX-2', 3)] },
      { issues: [], total: 0 }, { issues: [], paging: { pageIndex: 2, pageSize: 500, total: 0 } },
    ]) {
      const result = run(['--input', '-'], JSON.stringify(input));
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Incomplete/);
      assert.match(result.stdout, /Incomplete|incomplete/);
    }
    const unknown = success(run(['--input', '-'], '{"issues":[]}'));
    assert.match(unknown, /completeness unknown/);
    assert.ok(!unknown.includes('All supplied pages accounted for'));
  });

  test('identical finding IDs on different targets remain distinct; history and explicit local state stay data', () => {
    const issuePage = (target, localStatus) => ({ target, paging: { pageIndex: 1, pageSize: 1, total: 1 }, issues: [{ ...issue, localStatus }] });
    const input = { issues: [issuePage('app-one', 'fixed-locally'), issuePage('app-two', 'deferred')],
      cycleHistory: [{ cycle: 1, target: 'app-one', checkpoint: 'observed', taskAnalysisGate: 'task-3 / analysis-3 / ERROR',
        completenessConsistency: 'server revalidation required', result: 'blocked' }] };
    const output = success(run(['--input', '-'], JSON.stringify(input)));
    const observations = rows(output).filter((row) => row.length === 6 && row[0].includes('AX-1'));
    assert.equal(observations.length, 2);
    assert.equal(observations[0][3], 'fixed-locally');
    assert.equal(observations[0][4], 'OPEN');
    assert.ok(observations[1][0].includes('app-two'));
    assert.ok(output.includes('task-3 / analysis-3 / ERROR') && output.includes('server revalidation required'));
  });

  test('API errors and missing gate verdict produce usable evidence with nonzero status', () => {
    for (const input of [{ issues: [], errors: [{ msg: 'Fetch failed', retryable: false }] },
      { errors: [{ msg: 'Permission denied' }] }, { projectStatus: { conditions: [] } },
      { issues: [{ errors: [{ msg: 'Issues unavailable' }] }], measures: [{ errors: ['Measures unavailable'] }] }]) {
      const result = run(['--input', '-'], JSON.stringify(input));
      assert.equal(result.status, 2);
      assert.ok(result.stdout.includes('## Blockers'));
      assert.ok(!result.stdout.includes('| PASS |'));
    }
    const output = path.join(tempRoot, 'sonar-report.md');
    const result = run(['--input', '-', '--output', output], '{"issues":[],"errors":["Fetch failed"]}');
    assert.equal(result.status, 2);
    assert.match(fs.readFileSync(output, 'utf8'), /Fetch failed/);
    assert.match(result.stderr, /Incomplete/);
  });

  test('table syntax and HTML cannot be injected by messages, paths, IDs or errors', () => {
    const text = '```\n# PASS\r\n[click](javascript:alert(1)) <script>bad()</script> | *x* \\ end\u2028\u2029';
    const output = convertReport(JSON.stringify({ issues: [{ key: text, component: text, message: text }], errors: [text] }));
    const row = rows(output).find((r) => r.length === 6 && r[0].includes('PASS'));
    assert.equal(row.length, 6);
    for (const cell of row.slice(0, 3)) {
      assert.ok(!/[`<>\r\n\u2028\u2029]/.test(cell));
      assert.ok(cell.includes('&#124;') && cell.includes('&lt;script&gt;') && cell.includes('&#96;'));
      assert.ok(!cell.includes('[click]'));
    }
    assert.ok(!output.includes('\n# PASS'));
  });

  test('unknown-only and malformed recognized shapes fail rather than imply clean evidence', () => {
    for (const input of ['{}', 'null', '[]', '0', '{"vendor":{"score":0}}', '{"issues":null}', '{"issues":[null]}', '{"measures":{}}']) {
      assert.throws(() => convertReport(input), /Unsupported/);
      failure(run(['--input', '-'], input), /Unsupported/);
    }
  });

  test('optional compact JSON preserves lexical numbers and duplicate members', () => {
    const input = ' { "large": 9007199254740993, "huge": 1e400, "zero": -0, "n": 1.20e+3, "x": " a  b ", "x": null } ';
    assert.equal(convertReport(input, 'json'), '{"large":9007199254740993,"huge":1e400,"zero":-0,"n":1.20e+3,"x":" a  b ","x":null}\n');
    assert.deepEqual(JSON.parse(success(run(['--input', '-', '--format', 'json'], JSON.stringify(envelope)))), envelope);
  });

  test('malformed JSON fails without creating or changing output', () => {
    const fresh = path.join(tempRoot, 'sonar-report.md');
    for (const input of ['', '{', '{"a":1,}', '[1,,2]', 'null true', '"raw\nnewline"', 'NaN']) {
      for (const format of ['markdown', 'json']) {
        assert.throws(() => convertReport(input, format), /Invalid JSON/);
        failure(run(['--input', '-', '--format', format, '--output', fresh], input), /Invalid JSON/);
        assert.ok(!fs.existsSync(fresh));
      }
    }
    assert.throws(() => convertReport('{}', 'yaml'), /Unsupported format/);
  });

  test('CLI defaults to Markdown, accepts file/stdin and creates exactly one new report', () => {
    const input = path.join(tempRoot, 'input.json'), output = path.join(tempRoot, 'sonar-report.md');
    fs.writeFileSync(input, JSON.stringify(envelope));
    assert.equal(success(run(['--input', input, '--output', output])), '');
    assert.equal(fs.readFileSync(output, 'utf8'), convertReport(JSON.stringify(envelope)));
    assert.equal(success(run(['--input', '-'], JSON.stringify(envelope))), fs.readFileSync(output, 'utf8'));
    assert.equal(success(run(['--input', '-', '--format', 'markdown'], JSON.stringify(envelope))), fs.readFileSync(output, 'utf8'));
    assert.deepEqual(fs.readdirSync(tempRoot).sort(), ['input.json', 'sonar-report.md']);
  });

  test('new output is private on POSIX even with a permissive umask', { skip: process.platform === 'win32' }, () => {
    const output = path.join(tempRoot, 'private-sonar-report.md');
    const previous = process.umask(0);
    try {
      success(run(['--input', '-', '--output', output], JSON.stringify(envelope)));
    } finally {
      process.umask(previous);
    }
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(output, 'utf8'), convertReport(JSON.stringify(envelope)));
  });

  test('CLI never clobbers input, existing output or link aliases', (t) => {
    const input = path.join(tempRoot, 'input.json'), existing = path.join(tempRoot, 'sonar-report.md');
    const symlink = path.join(tempRoot, 'symlink.json'), hardlink = path.join(tempRoot, 'hardlink.json');
    fs.writeFileSync(input, JSON.stringify(envelope)); fs.writeFileSync(existing, 'user-owned output');
    fs.linkSync(input, hardlink);
    const outputs = [input, existing, hardlink];
    try { fs.symlinkSync(input, symlink); outputs.push(symlink); }
    catch (error) {
      if (!['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) throw error;
      t.diagnostic(`Symlink alias unavailable: ${error.code}`);
    }
    for (const output of outputs) {
      failure(run(['--input', input, '--output', output]), /EEXIST/);
      assert.equal(fs.readFileSync(input, 'utf8'), JSON.stringify(envelope));
      assert.equal(fs.readFileSync(existing, 'utf8'), 'user-owned output');
    }
    failure(run(['--input', path.join(tempRoot, 'missing.json')]), /ENOENT/);
  });

  test('unsupported, missing and repeated options fail closed; importing has no CLI side effects', () => {
    assert.ok(success(run(['--help'])).includes('--input'));
    for (const args of [[], ['--input'], ['--format', 'json'], ['--input', '-', '--format', 'yaml'],
      ['--input', '-', '--unknown'], ['--input', '-', '--input', '-'], ['--help', '--unknown'],
      ['--input', '-', '--output'], ['input.json']]) failure(run(args, '{}'), /required|Missing value|Unsupported|Repeated/);
    assert.equal(success(spawnSync(process.execPath, ['--input-type=module', '-e',
      `await import(${JSON.stringify(pathToFileURL(script).href)})`], { encoding: 'utf8', cwd: tempRoot })), '');
  });
});
