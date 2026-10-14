import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helperScript = path.join(packageRoot, 'scripts', 'calculate-jacoco-coverage.mjs');
const syntheticFixturePath = path.join(packageRoot, 'tests', 'fixtures', 'synthetic-jacoco-report.xml');

function runHelper(args, options = {}) {
  const { cwd = packageRoot, env = process.env } = options;
  return spawnSync(process.execPath, [helperScript, ...args], {
    encoding: 'utf8',
    cwd,
    env,
  });
}

describe('calculate-jacoco-coverage CLI and reporting behavior', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jacoco-cov-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('--help displayed alone exits 0 with usage, path resolution, and limits', () => {
    const res = runHelper(['--help']);
    assert.equal(res.status, 0);
    assert.equal(res.stderr, '');
    assert.match(res.stdout, /Usage: node calculate-jacoco-coverage\.mjs/);
    assert.match(res.stdout, /--report-path <path>/);
    assert.match(res.stdout, /--threshold <val>/);
    assert.match(res.stdout, /--include-pattern <regex>/);
    assert.match(res.stdout, /Node >=22\.19\.0 ESM execution/);
    assert.match(res.stdout, /Strict duplicate attribute rejection/);
    assert.match(res.stdout, /Exact BigInt rational arithmetic/);
  });

  test('--help combined with other flags exits 1 with argument error', () => {
    const res = runHelper(['--help', '--threshold', '90']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[argument error\] Option --help must be used alone\./);
  });

  test('unsupported option exits 1 with argument error', () => {
    const res = runHelper(['--unknown-flag']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[argument error\] Unsupported option\./);
  });

  test('repeated option exits 1 with argument error', () => {
    const res = runHelper(['--threshold', '90', '--threshold', '95']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[argument error\] Repeated option\./);
  });

  test('missing option value exits 1 with argument error', () => {
    const res = runHelper(['--threshold']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[argument error\] Missing value for option\./);
  });

  test('option value starting with dash exits 1 with argument error', () => {
    const res = runHelper(['--threshold', '-5']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[argument error\] Invalid value for option\./);
  });

  test('threshold rejecting non-decimals, exponents, signs, and out-of-range values', () => {
    for (const bad of ['abc', '101', '100.1', '1e2', '0x10', '95%', '+95', 'NaN', 'Infinity']) {
      const res = runHelper(['--threshold', bad]);
      assert.equal(res.status, 1, `Expected failure for threshold: ${bad}`);
      assert.match(res.stderr, /calculate-jacoco-coverage: \[argument error\]/);
    }
  });

  test('invalid regular expression for --include-pattern exits 1', () => {
    const res = runHelper(['--include-pattern', '[unclosed']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[argument error\] Invalid regular expression for --include-pattern/);
  });

  test('non-existent report file exits 1 with report error', () => {
    const res = runHelper(['--report-path', path.join(tempDir, 'does-not-exist.xml')]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[report error\] JaCoCo report not found or not a regular file/);
  });

  test('directory passed as report file exits 1 with report error', () => {
    const res = runHelper(['--report-path', tempDir]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[report error\] JaCoCo report not found or not a regular file/);
  });

  test('synthetic JaCoCo fixture calculates direct class LINE and BRANCH counters and excludes other totals', () => {
    // Synthetic fixture: 5/6 lines, 3/4 branches, combined 8/10 (80.0000%)
    // At threshold 75: strict > 75 passes (exit 0)
    const passRes = runHelper(['--report-path', syntheticFixturePath, '--threshold', '75']);
    assert.equal(passRes.status, 0);
    assert.match(passRes.stdout, /Classes evaluated : 1/);
    assert.match(passRes.stdout, /Line coverage     : 5\/6 \(83\.33%\)/);
    assert.match(passRes.stdout, /Branch coverage   : 3\/4 \(75\.00%\)/);
    assert.match(passRes.stdout, /Combined coverage : 8\/10 \(80\.0000%\)/);
    assert.match(passRes.stdout, /Required          : > 75%/);
    assert.match(passRes.stdout, /RESULT            : PASSED/);

    // At threshold 80: strict > 80 fails (80 is not > 80, exit 2)
    const failRes = runHelper(['--report-path', syntheticFixturePath, '--threshold', '80']);
    assert.equal(failRes.status, 2);
    assert.match(failRes.stdout, /RESULT            : FAILED/);

    // Default threshold 95: fails (exit 2)
    const defaultRes = runHelper(['--report-path', syntheticFixturePath]);
    assert.equal(defaultRes.status, 2);
    assert.match(defaultRes.stdout, /Required          : > 95%/);
    assert.match(defaultRes.stdout, /RESULT            : FAILED/);
  });

  test('nested groups hierarchy aggregates enclosed package classes', () => {
    const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="nested-groups">
  <group name="parent-group">
    <group name="child-group">
      <package name="pkg/one">
        <class name="pkg/one/Alpha">
          <counter type="LINE" missed="1" covered="9"/>
          <counter type="BRANCH" missed="0" covered="10"/>
        </class>
      </package>
    </group>
  </group>
</report>`;
    const xmlFile = path.join(tempDir, 'nested.xml');
    fs.writeFileSync(xmlFile, reportXml);

    const res = runHelper(['--report-path', xmlFile, '--threshold', '90']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Classes evaluated : 1/);
    assert.match(res.stdout, /Combined coverage : 19\/20 \(95\.0000%\)/);
    assert.match(res.stdout, /RESULT            : PASSED/);
  });

  test('case-insensitive class filter pattern includes matching and excludes non-matching', () => {
    const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="filter-test">
  <package name="pkg">
    <class name="pkg/UserAccountService">
      <counter type="LINE" missed="0" covered="10"/>
    </class>
    <class name="pkg/PaymentGateway">
      <counter type="LINE" missed="10" covered="0"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'filter.xml');
    fs.writeFileSync(xmlFile, reportXml);

    // Match UserAccountService case-insensitively
    const matchRes = runHelper(['--report-path', xmlFile, '--include-pattern', 'useraccount', '--threshold', '95']);
    assert.equal(matchRes.status, 0);
    assert.match(matchRes.stdout, /Classes evaluated : 1/);
    assert.match(matchRes.stdout, /Line coverage     : 10\/10 \(100\.00%\)/);
    assert.match(matchRes.stdout, /Branch coverage   : 0\/0 \(undefined\/empty\)/);
    assert.match(matchRes.stdout, /RESULT            : PASSED/);

    // Filter matching no classes exits 2 with coverage error
    const noMatchRes = runHelper(['--report-path', xmlFile, '--include-pattern', 'nonexistent']);
    assert.equal(noMatchRes.status, 2);
    assert.match(noMatchRes.stderr, /calculate-jacoco-coverage: \[coverage error\] No covered classes or line\/branch counters matched the requested scope\./);
  });

  test('exact threshold boundary predicate: exactly 95 fails strict requirement; above 95 passes', () => {
    // 19 / 20 = exactly 95%
    const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="boundary">
  <package name="pkg">
    <class name="pkg/Exact95">
      <counter type="LINE" missed="1" covered="19"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'boundary.xml');
    fs.writeFileSync(xmlFile, reportXml);

    // At threshold 95: exactly 95.0000% is NOT > 95 -> exits 2
    const exactRes = runHelper(['--report-path', xmlFile, '--threshold', '95']);
    assert.equal(exactRes.status, 2);
    assert.match(exactRes.stdout, /RESULT            : FAILED/);

    // At threshold 94.99: 95.0000% IS > 94.99 -> exits 0
    const passRes = runHelper(['--report-path', xmlFile, '--threshold', '94.99']);
    assert.equal(passRes.status, 0);
    assert.match(passRes.stdout, /RESULT            : PASSED/);
  });

  test('exact BigInt rational arithmetic on named near-safe-limit counts', () => {
    // Named plan fixtures: total 9007199254740980
    // Case 1: covered 8556839292003931 (missed 450359962737049) -> exactly 95% -> fails strict > 95
    const exactXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="near-limit-exact">
  <package name="pkg">
    <class name="pkg/ExactLimit">
      <counter type="LINE" missed="450359962737049" covered="8556839292003931"/>
    </class>
  </package>
</report>`;
    const exactFile = path.join(tempDir, 'limit-exact.xml');
    fs.writeFileSync(exactFile, exactXml);

    const exactRes = runHelper(['--report-path', exactFile, '--threshold', '95']);
    assert.equal(exactRes.status, 2);
    assert.match(exactRes.stdout, /RESULT            : FAILED/);

    // Case 2: covered 8556839292003932 (missed 450359962737048) -> strictly above 95% -> passes
    const passXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="near-limit-pass">
  <package name="pkg">
    <class name="pkg/PassLimit">
      <counter type="LINE" missed="450359962737048" covered="8556839292003932"/>
    </class>
  </package>
</report>`;
    const passFile = path.join(tempDir, 'limit-pass.xml');
    fs.writeFileSync(passFile, passXml);

    const passRes = runHelper(['--report-path', passFile, '--threshold', '95']);
    assert.equal(passRes.status, 0);
    assert.match(passRes.stdout, /RESULT            : PASSED/);
  });

  test('all missed counters produces 0% coverage and exits 2', () => {
    const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="all-missed">
  <package name="pkg">
    <class name="pkg/Zero">
      <counter type="LINE" missed="10" covered="0"/>
      <counter type="BRANCH" missed="4" covered="0"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'zero.xml');
    fs.writeFileSync(xmlFile, reportXml);

    const res = runHelper(['--report-path', xmlFile, '--threshold', '50']);
    assert.equal(res.status, 2);
    assert.match(res.stdout, /Line coverage     : 0\/10 \(0\.00%\)/);
    assert.match(res.stdout, /Branch coverage   : 0\/4 \(0\.00%\)/);
    assert.match(res.stdout, /Combined coverage : 0\/14 \(0\.0000%\)/);
    assert.match(res.stdout, /RESULT            : FAILED/);
  });

  test('line-only class with no branch counters reports branch undefined/empty and evaluates line coverage', () => {
    const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="line-only">
  <package name="pkg">
    <class name="pkg/NoBranches">
      <counter type="LINE" missed="1" covered="99"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'line-only.xml');
    fs.writeFileSync(xmlFile, reportXml);

    const res = runHelper(['--report-path', xmlFile, '--threshold', '95']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Line coverage     : 99\/100 \(99\.00%\)/);
    assert.match(res.stdout, /Branch coverage   : 0\/0 \(undefined\/empty\)/);
    assert.match(res.stdout, /Combined coverage : 99\/100 \(99\.0000%\)/);
    assert.match(res.stdout, /RESULT            : PASSED/);
  });

  test('missing direct LINE counter alone and in mixed classes exits 1 with xml error', () => {
    // Alone: class with only BRANCH counter
    const aloneXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="missing-line-alone">
  <package name="pkg">
    <class name="pkg/BranchOnly">
      <counter type="BRANCH" missed="0" covered="2"/>
    </class>
  </package>
</report>`;
    const aloneFile = path.join(tempDir, 'missing-alone.xml');
    fs.writeFileSync(aloneFile, aloneXml);

    const aloneRes = runHelper(['--report-path', aloneFile]);
    assert.equal(aloneRes.status, 1);
    assert.match(aloneRes.stderr, /calculate-jacoco-coverage: \[xml error\] Selected class "pkg\/BranchOnly" is missing required direct LINE counter\./);

    // Mixed: first class has LINE counter, second class is missing LINE counter
    const mixedXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="missing-line-mixed">
  <package name="pkg">
    <class name="pkg/Valid">
      <counter type="LINE" missed="0" covered="10"/>
    </class>
    <class name="pkg/Invalid">
      <counter type="BRANCH" missed="0" covered="2"/>
    </class>
  </package>
</report>`;
    const mixedFile = path.join(tempDir, 'missing-mixed.xml');
    fs.writeFileSync(mixedFile, mixedXml);

    const mixedRes = runHelper(['--report-path', mixedFile]);
    assert.equal(mixedRes.status, 1);
    assert.match(mixedRes.stderr, /calculate-jacoco-coverage: \[xml error\] Selected class "pkg\/Invalid" is missing required direct LINE counter\./);
  });

  test('present zero-valued LINE counter with zero combined aggregate exits 2', () => {
    const reportXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="zero-line">
  <package name="pkg">
    <class name="pkg/ZeroLines">
      <counter type="LINE" missed="0" covered="0"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'zero-line.xml');
    fs.writeFileSync(xmlFile, reportXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[coverage error\] No covered classes or line\/branch counters matched the requested scope\./);
  });

  test('malformed counter numeric attributes exit 1 with xml error', () => {
    const nonNumericXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="bad-numeric">
  <package name="pkg">
    <class name="pkg/Bad">
      <counter type="LINE" missed="foo" covered="10"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'bad-num.xml');
    fs.writeFileSync(xmlFile, nonNumericXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Counter attributes "missed" and "covered" must be non-negative decimal integers/);
  });

  test('counter value exceeding safe integer limit exits 1 with xml error', () => {
    const overflowXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="overflow">
  <package name="pkg">
    <class name="pkg/Overflow">
      <counter type="LINE" missed="0" covered="9007199254740992"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'overflow.xml');
    fs.writeFileSync(xmlFile, overflowXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Counter value exceeds safe integer limit/);
  });

  test('duplicate direct counter type in single class exits 1 with xml error', () => {
    const dupXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="dup-counter">
  <package name="pkg">
    <class name="pkg/Dup">
      <counter type="LINE" missed="0" covered="5"/>
      <counter type="LINE" missed="1" covered="5"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'dup-counter.xml');
    fs.writeFileSync(xmlFile, dupXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Duplicate counter type "LINE" in class pkg\/Dup\./);
  });

  test('internal DTD subset and custom entity declarations are rejected', () => {
    const dtdXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE report [
  <!ENTITY secret "ATTACK">
]>
<report name="attack">
  <package name="pkg">
    <class name="pkg/Foo"><counter type="LINE" missed="0" covered="10"/></class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'dtd.xml');
    fs.writeFileSync(xmlFile, dtdXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Internal DTD subset and custom entity declarations are rejected\./);
  });

  test('duplicate XML attributes on elements are rejected with xml error', () => {
    const dupAttrXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="dup-attr">
  <package name="pkg">
    <class name="pkg/C">
      <counter type="LINE" type="BRANCH" missed="0" covered="10"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'dup-attr.xml');
    fs.writeFileSync(xmlFile, dupAttrXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Duplicate attribute "type" in element <counter>\./);
  });

  test('multiple XML roots are rejected with xml error', () => {
    const multiRootXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="r1"></report>
<report name="r2"></report>`;
    const xmlFile = path.join(tempDir, 'multi-root.xml');
    fs.writeFileSync(xmlFile, multiRootXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Multiple root elements rejected\./);
  });

  test('non-whitespace trailing text after root is rejected with xml error', () => {
    const trailingXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="r">
  <package name="pkg"><class name="pkg/C"><counter type="LINE" missed="0" covered="10"/></class></package>
</report>
trailing-malicious-content`;
    const xmlFile = path.join(tempDir, 'trailing.xml');
    fs.writeFileSync(xmlFile, trailingXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] (?:Non-whitespace content outside root element|XML parsing error: Text data outside of root node)/);
  });

  test('unclosed XML elements at EOF exit 1 with xml error without passing verdict', () => {
    const unclosedXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="unclosed">
  <package name="pkg">
    <class name="pkg/C">
      <counter type="LINE" missed="0" covered="10"/>`;
    const xmlFile = path.join(tempDir, 'unclosed.xml');
    fs.writeFileSync(xmlFile, unclosedXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\]/);
    assert.equal(res.stdout, '');
  });

  test('invalid UTF-8 bytes and truncated UTF-8 at EOF exit 1 with encoding error', () => {
    // Invalid sequence: lone 0xFF byte
    const invalidUtf8 = Buffer.from([0x3c, 0x72, 0x65, 0x70, 0x6f, 0x72, 0x74, 0x20, 0xff, 0x3e]);
    const badFile = path.join(tempDir, 'bad-utf8.xml');
    fs.writeFileSync(badFile, invalidUtf8);

    const res = runHelper(['--report-path', badFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[encoding error\] JaCoCo report is not valid UTF-8/);
  });

  test('unsupported XML encoding declaration exits 1 with encoding error', () => {
    const isoXml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<report name="iso">
  <package name="pkg"><class name="pkg/C"><counter type="LINE" missed="0" covered="10"/></class></package>
</report>`;
    const xmlFile = path.join(tempDir, 'iso.xml');
    fs.writeFileSync(xmlFile, isoXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[encoding error\] Unsupported XML encoding "ISO-8859-1"\. Only UTF-8 is supported\./);
  });

  test('UTF-8 report with BOM parses successfully and satisfies threshold', () => {
    const bomXml = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
<report name="bom-test">
  <package name="pkg">
    <class name="pkg/BomClass">
      <counter type="LINE" missed="0" covered="20"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'bom.xml');
    fs.writeFileSync(xmlFile, Buffer.from(bomXml, 'utf8'));

    const res = runHelper(['--report-path', xmlFile, '--threshold', '95']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Classes evaluated : 1/);
    assert.match(res.stdout, /Line coverage     : 20\/20 \(100\.00%\)/);
    assert.match(res.stdout, /RESULT            : PASSED/);
  });

  test('valid early class followed by trailing malformed content exits 1 without passing summary', () => {
    const xmlWithEarlyPass = `<?xml version="1.0" encoding="UTF-8"?>
<report name="early-pass-then-fail">
  <package name="pkg">
    <class name="pkg/PassingClass">
      <counter type="LINE" missed="0" covered="50"/>
    </class>
  </package>
  <malformed-unclosed-tag
`;
    const xmlFile = path.join(tempDir, 'early-pass.xml');
    fs.writeFileSync(xmlFile, xmlWithEarlyPass);

    const res = runHelper(['--report-path', xmlFile, '--threshold', '90']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\]/);
    assert.doesNotMatch(res.stdout, /RESULT            : PASSED/);
    assert.doesNotMatch(res.stdout, /Classes evaluated/);
  });

  test('streaming chunks split across 1-byte boundaries including multibyte UTF-8 characters', async () => {
    const { parseJacocoReportStream, parseArguments } = await import(pathToFileURL(helperScript).href);
    const { Readable } = await import('node:stream');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">
<report name="multibyte-test-ünïcødé">
  <package name="pkg">
    <class name="pkg/UnicodeClass_日本語">
      <counter type="LINE" missed="1" covered="99"/>
    </class>
  </package>
</report>`;

    const fullBuffer = Buffer.from(xml, 'utf8');
    // Feed 1 byte at a time to force chunk splits across multibyte characters, DOCTYPE, and tags
    const byteChunks = [];
    for (let i = 0; i < fullBuffer.length; i++) {
      byteChunks.push(fullBuffer.subarray(i, i + 1));
    }

    const stream = Readable.from(byteChunks);
    const options = parseArguments(['--threshold', '95']);
    const metrics = await parseJacocoReportStream(stream, options);

    assert.equal(metrics.classesEvaluated, 1);
    assert.equal(metrics.linesMissed, 1);
    assert.equal(metrics.linesCovered, 99);
  });

  test('comment containing xml declaration text without XML declaration parses successfully', () => {
    const commentXml = `<!-- <?xml version="1.0" encoding="ISO-8859-1"?> -->
<report name="comment-test">
  <package name="pkg">
    <class name="pkg/C">
      <counter type="LINE" missed="0" covered="10"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'comment.xml');
    fs.writeFileSync(xmlFile, commentXml);

    const res = runHelper(['--report-path', xmlFile, '--threshold', '95']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /RESULT            : PASSED/);
  });

  test('invalid hierarchy with class directly under report exits 1 with xml error', () => {
    const badHierarchyXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="bad-hierarchy">
  <class name="pkg/InvalidPlacement">
    <counter type="LINE" missed="0" covered="10"/>
  </class>
</report>`;
    const xmlFile = path.join(tempDir, 'bad-hierarchy.xml');
    fs.writeFileSync(xmlFile, badHierarchyXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Invalid element hierarchy/);
  });

  test('undefined XML entity reference exits 1 with xml error', () => {
    const badEntityXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="bad-entity">
  <package name="pkg">
    <class name="pkg/Foo&amp;bar;">
      <counter type="LINE" missed="0" covered="10"/>
    </class>
  </package>
</report>`.replace('&amp;bar;', '&undefinedEntity;');
    const xmlFile = path.join(tempDir, 'bad-entity.xml');
    fs.writeFileSync(xmlFile, badEntityXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\]/);
  });

  test('accumulated counter overflow across multiple classes exits 1 with xml error', () => {
    const overflowClassesXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="accum-overflow">
  <package name="pkg">
    <class name="pkg/C1">
      <counter type="LINE" missed="0" covered="9007199254740990"/>
    </class>
    <class name="pkg/C2">
      <counter type="LINE" missed="0" covered="5"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'accum-overflow.xml');
    fs.writeFileSync(xmlFile, overflowClassesXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Accumulated line counter sum exceeds safe integer limit\./);
  });

  test('counter missing required type or missed or covered attributes exits 1 with xml error', () => {
    const missingAttrXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="missing-attr">
  <package name="pkg">
    <class name="pkg/C">
      <counter missed="0" covered="10"/>
    </class>
  </package>
</report>`;
    const xmlFile = path.join(tempDir, 'missing-attr.xml');
    fs.writeFileSync(xmlFile, missingAttrXml);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\] Counter element missing required attributes/);
  });

  test('empty report file exits 1 with xml error', () => {
    const xmlFile = path.join(tempDir, 'empty.xml');
    fs.writeFileSync(xmlFile, '   \n\t  ');

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[xml error\]/);
  });

  test('truncated multi-byte UTF-8 sequence at EOF exits 1 with encoding error', () => {
    // 0xC3 followed by nothing is an incomplete 2-byte UTF-8 sequence
    const truncatedBuffer = Buffer.from([0x3c, 0x72, 0x65, 0x70, 0x6f, 0x72, 0x74, 0x3e, 0xc3]);
    const xmlFile = path.join(tempDir, 'truncated-utf8.xml');
    fs.writeFileSync(xmlFile, truncatedBuffer);

    const res = runHelper(['--report-path', xmlFile]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /calculate-jacoco-coverage: \[encoding error\] JaCoCo report is not valid UTF-8: incomplete multi-byte sequence at EOF\./);
  });

  test('unsupported XML encoding declaration split byte-by-byte at prefix boundaries exits 1 with encoding error', async () => {
    const { parseJacocoReportStream, parseArguments } = await import(pathToFileURL(helperScript).href);
    const { Readable } = await import('node:stream');

    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<report name="split-encoding">
  <package name="pkg">
    <class name="pkg/C"><counter type="LINE" missed="0" covered="10"/></class>
  </package>
</report>`;

    const fullBuffer = Buffer.from(xml, 'utf8');
    const byteChunks = [];
    for (let i = 0; i < fullBuffer.length; i++) {
      byteChunks.push(fullBuffer.subarray(i, i + 1));
    }

    const stream = Readable.from(byteChunks);
    const options = parseArguments(['--threshold', '95']);
    await assert.rejects(
      async () => {
        await parseJacocoReportStream(stream, options);
      },
      (err) => {
        return err.category === 'encoding' && /Unsupported XML encoding "ISO-8859-1"/.test(err.message);
      }
    );
  });
});
