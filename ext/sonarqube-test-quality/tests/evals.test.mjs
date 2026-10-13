import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evalsPath = path.join(packageRoot, 'evals', 'evals.json');

describe('Behavioral Evals Catalog Verification and Matrix Traceability', () => {
  const rawContent = fs.readFileSync(evalsPath, 'utf8');
  const catalog = JSON.parse(rawContent);
  const byId = id => catalog.evals.find(e => e.id === id);

  test('catalog has valid schema and root properties', () => {
    assert.equal(catalog.skill_name, 'sonarqube-test-quality');
    assert.ok(Array.isArray(catalog.evals), 'evals property must be an array');
    assert.equal(catalog.evals.length, 64, 'catalog must contain exactly 64 scenarios');
  });

  test('all scenarios have monotonic unique integer IDs from 1 to 64', () => {
    const ids = catalog.evals.map(e => e.id);
    const expectedIds = Array.from({ length: 64 }, (_, i) => i + 1);
    assert.deepEqual(ids, expectedIds, 'IDs must be 1 through 64 in order');
  });

  test('all scenarios contain non-empty prompt and expected_output strings', () => {
    for (const e of catalog.evals) {
      assert.ok(typeof e.prompt === 'string' && e.prompt.trim().length > 0, `Scenario ${e.id} prompt must be non-empty`);
      assert.ok(typeof e.expected_output === 'string' && e.expected_output.trim().length > 0, `Scenario ${e.id} expected_output must be non-empty`);
      assert.ok(Array.isArray(e.files), `Scenario ${e.id} files must be an array`);
    }
  });

  test('all scenarios contain non-empty prose assertions array with at least 2 assertions', () => {
    for (const e of catalog.evals) {
      assert.ok(Array.isArray(e.assertions), `Scenario ${e.id} must have assertions array`);
      assert.ok(e.assertions.length >= 2, `Scenario ${e.id} must have at least 2 assertions (found ${e.assertions.length})`);
      for (const a of e.assertions) {
        assert.ok(typeof a === 'string' && a.trim().length > 0, `Scenario ${e.id} has empty assertion string`);
      }
    }
  });

  test('replaces obsolete installer assertions with explicit agents, claude, both, and rejection scenarios', () => {
    const s19 = byId(19);
    assert.match(s19.prompt, /--target agents/);
    assert.match(s19.expected_output, /\.agents\/skills\/sonarqube-test-quality/);
    assert.match(s19.expected_output, /\.agents\/skills\/cmd-sonar-remediate/);
    assert.ok(s19.assertions.some(a => a.includes('--target agents')));

    const s20 = byId(20);
    assert.match(s20.prompt, /--target claude/);
    assert.match(s20.expected_output, /\.claude\/skills\/sonarqube-test-quality/);
    assert.match(s20.expected_output, /\.claude\/skills\/cmd-sonar-remediate/);
    assert.ok(s20.assertions.some(a => a.includes('--target claude')));

    const s21 = byId(21);
    assert.match(s21.prompt, /--target both/);
    assert.match(s21.expected_output, /36 files/);
    assert.ok(s21.assertions.some(a => a.includes('dual-root')));

    const s22 = byId(22);
    assert.match(s22.prompt, /without specifying a target/);
    assert.match(s22.expected_output, /fail closed/i);
    assert.ok(s22.assertions.some(a => a.includes('Fails closed')));
  });

  test('covers all four lifecycle shapes: build-integrated, standalone, prep/build/end, multi-target', () => {
    assert.match(byId(23).expected_output, /build-integrated/i);
    assert.match(byId(24).expected_output, /standalone-after-native/i);
    assert.match(byId(25).expected_output, /preparation\/build\/submission/i);
    assert.match(byId(26).expected_output, /multi-target/i);
  });

  test('enforces mandatory Stage F final actual submission and committed inputs', () => {
    const s27 = byId(27);
    assert.match(s27.expected_output, /Stage F is mandatory/i);
    assert.ok(s27.assertions.some(a => a.includes('Stage F')));
  });

  test('covers N budget limits: omission, invalid N, N=1 failure, resume without N, no free final edits', () => {
    assert.match(byId(28).expected_output, /assume, default, or infer/i);
    assert.match(byId(29).expected_output, /positive integer/i);

    const s30 = byId(30);
    assert.match(s30.expected_output, /consumed the entire budget N=1/i);
    assert.match(s30.expected_output, /blocked\/incomplete/i);
    assert.match(s30.expected_output, /test-or-build-failed/i);
    assert.match(byId(31).expected_output, /Do not rerun the scanner upload/i);
    assert.match(byId(35).expected_output, /No free final edits/i);
  });

  test('covers correction limit: exactly 1 correction allowed, 2nd correction prohibited', () => {
    assert.match(byId(32).expected_output, /Exactly one corrective batch/i);
    assert.match(byId(33).expected_output, /second correction attempt.*prohibited/i);
  });

  test('covers recovery boundaries: two no-progress rounds and all-target conjunction', () => {
    assert.match(byId(34).expected_output, /two-round-no-progress/i);
    assert.match(byId(36).expected_output, /all configured targets to pass/i);
  });

  test('covers applicability and metric requirements: 0 tests rejected, justified profile, unsupported coverage, stale reports, metric aggregation', () => {
    assert.match(byId(37).expected_output, /Zero executed tests cannot satisfy verification/i);
    assert.match(byId(38).expected_output, /justified in preflight discovery/i);
    assert.match(byId(39).expected_output, /Never synthesize, fabricate, or assume metrics/i);
    assert.match(byId(40).expected_output, /Stale coverage files.*rejected/i);
    assert.match(byId(41).expected_output, /unweighted averaging is invalid/i);
    assert.match(byId(42).expected_output, /uninstrumented native build and test/i);
  });

  test('covers authority, auth, security, and refusal invariants', () => {
    const s43 = byId(43);
    assert.match(s43.expected_output, /blocked\/incomplete/i);
    assert.match(s43.expected_output, /declined-upload/i);

    const s44 = byId(44);
    assert.match(s44.expected_output, /awaiting commit/i);
    assert.match(s44.expected_output, /declined-commit/i);

    assert.match(byId(45).expected_output, /auth gap/i);
    assert.match(byId(46).expected_output, /role-independence-violation/i);
    assert.match(byId(47).expected_output, /discovery.*does not constitute approval/i);
    assert.match(byId(48).expected_output, /NODE_TLS_REJECT_UNAUTHORIZED=0.*strictly forbidden/i);
    assert.match(byId(49).expected_output, /evidence actor is strictly bounded/i);
    assert.match(byId(50).expected_output, /Self-modification.*strictly prohibited/i);
  });

  test('covers evidence, paging, consistency, drift, disappearance, and residual findings', () => {
    assert.match(byId(51).expected_output, /forbids combining branch and pull-request/i);
    assert.match(byId(52).expected_output, /task-failed/i);
    assert.match(byId(53).expected_output, /resume polling/i);
    assert.match(byId(54).expected_output, /exhaust all pagination pages/i);
    assert.match(byId(55).expected_output, /consistency unknown/i);
    assert.match(byId(56).expected_output, /round budget N is NOT reset/i);
    assert.match(byId(57).expected_output, /drift/i);

    const s58 = byId(58);
    assert.match(s58.expected_output, /disappeared-unknown/i);

    assert.match(byId(59).expected_output, /pending hotspots/i);
    assert.match(byId(60).expected_output, /C0.*excluded from the fix budget N/i);
    assert.match(byId(61).expected_output, /strictly serialized/i);
    assert.match(byId(62).expected_output, /Snapshot mode is strictly read-only and local/i);
    assert.match(byId(63).expected_output, /Sanitize all external text/i);
    assert.match(byId(64).expected_output, /human owner review/i);
  });

  test('security audit: catalog contains zero literal credentials or unauthorized TLS bypass instructions', () => {
    const raw = JSON.stringify(catalog);
    assert.ok(!raw.includes('squ_'), 'Must not contain SonarQube user tokens');
    assert.ok(!raw.includes('sqp_'), 'Must not contain SonarQube project tokens');
    assert.ok(!raw.includes('sqa_'), 'Must not contain SonarQube analysis tokens');
    assert.ok(!raw.includes('bearer '), 'Must not contain literal bearer tokens');
    // NODE_TLS_REJECT_UNAUTHORIZED=0 must appear strictly within Scenario 48 only
    const tlsScenarios = catalog.evals.filter(e => JSON.stringify(e).includes('NODE_TLS_REJECT_UNAUTHORIZED=0'));
    assert.equal(tlsScenarios.length, 1, 'Only Scenario 48 may contain NODE_TLS_REJECT_UNAUTHORIZED=0');
    assert.equal(tlsScenarios[0].id, 48, 'Must be Scenario 48');
  });

  test('acceptance matrix coverage mapping completes full inventory (A01-A09, D01-D09, C01-C12, E01-E08)', () => {
    const matrixMapping = {
      'A01': [1, 8, 23],
      'A02': [19, 20, 21, 22],
      'A03': [4, 5, 28, 38],
      'A04': [28, 29, 30],
      'A05': [14, 44],
      'A06': [2, 59],
      'A07': [19, 20, 21, 22],
      'A08': [1, 6, 7, 8],
      'A09': [27, 30, 43, 50],
      'D01': [47],
      'D02': [9, 26, 51],
      'D03': [23, 24, 25, 26],
      'D04': [42],
      'D05': [37, 38],
      'D06': [2, 10, 39, 40, 41],
      'D07': [13, 57],
      'D08': [26, 36],
      'D09': [3, 4, 45, 52],
      'C01': [60],
      'C02': [30],
      'C03': [32, 33],
      'C04': [31, 53],
      'C05': [34],
      'C06': [56],
      'C07': [13, 27, 44, 57],
      'C08': [27],
      'C09': [30, 35],
      'C10': [46],
      'C11': [49, 62],
      'C12': [61],
      'E01': [23, 24, 25, 52],
      'E02': [11, 54, 55],
      'E03': [11, 12],
      'E04': [58, 59],
      'E05': [48, 49, 62],
      'E06': [3, 45, 48],
      'E07': [43, 50, 63],
      'E08': [50, 64]
    };

    const allKeys = Object.keys(matrixMapping);
    assert.equal(allKeys.length, 38, 'Must cover 38 acceptance criteria IDs (9 A + 9 D + 12 C + 8 E)');

    for (const [id, scenarioIds] of Object.entries(matrixMapping)) {
      assert.ok(scenarioIds.length > 0, `Acceptance ID ${id} must map to at least one scenario`);
      for (const sid of scenarioIds) {
        const found = catalog.evals.some(e => e.id === sid);
        assert.ok(found, `Acceptance ID ${id} maps to scenario ${sid} which must exist`);
      }
    }
  });
});
