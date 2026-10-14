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
function finding(report, id) { return rows(report).find((row) => row.length === 6 && row[0].includes(id)); }
function metric(report, name, value) { return rows(report).find((row) => row.length === 5 && row[1].includes(name) && row[2] === value); }

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
