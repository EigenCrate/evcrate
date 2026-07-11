import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const config = JSON.parse(await readFile(join(projectRoot, 'lighthouserc.json'), 'utf8')).ci;
const distDir = join(projectRoot, config.collect.staticDistDir);
const outputDir = join(projectRoot, config.upload.outputDir);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

function createStaticServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');
    const relativePath = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname.slice(1));
    const filePath = resolve(distDir, normalize(relativePath));

    if (filePath !== distDir && !filePath.startsWith(`${distDir}${sep}`)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    try {
      const file = await readFile(filePath);
      response.writeHead(200, { 'content-type': contentTypes.get(extname(filePath)) ?? 'application/octet-stream' });
      response.end(file);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

function listen(server) {
  return new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine Lighthouse server port.'));
        return;
      }
      resolvePort(address.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

function getAuditValue(result, auditId) {
  if (auditId.startsWith('categories:')) {
    return result.categories[auditId.slice('categories:'.length)]?.score;
  }

  return result.audits[auditId]?.numericValue;
}

function assertBudget(result, assertions) {
  const failures = [];
  const warnings = [];

  for (const [auditId, [level, expectation]] of Object.entries(assertions)) {
    const value = getAuditValue(result, auditId);
    const passed = expectation.minScore === undefined
      ? value <= expectation.maxNumericValue
      : value >= expectation.minScore;

    if (passed) {
      continue;
    }

    const message = `${auditId} expected ${JSON.stringify(expectation)}, received ${value}`;
    if (level === 'error') {
      failures.push(message);
    } else {
      warnings.push(message);
    }
  }

  for (const warning of warnings) {
    console.warn(`Lighthouse budget warning: ${warning}`);
  }

  if (failures.length > 0) {
    throw new Error(`Lighthouse budget failed:\n${failures.join('\n')}`);
  }
}

const server = createStaticServer();
let chrome;

try {
  const port = await listen(server);
  chrome = await launch({ chromeFlags: config.collect.settings.chromeFlags.split(' ') });
  const result = await lighthouse(`http://127.0.0.1:${port}/`, {
    logLevel: 'error',
    output: ['json', 'html'],
    port: chrome.port,
  });

  if (!result?.lhr || !Array.isArray(result.report)) {
    throw new Error('Lighthouse did not return a complete report.');
  }

  assertBudget(result.lhr, config.assert.assertions);

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'lighthouse-report.json'), result.report[0]);
  await writeFile(join(outputDir, 'lighthouse-report.html'), result.report[1]);

  console.log(`Lighthouse gate passed. Reports written to ${config.upload.outputDir}.`);
} finally {
  if (chrome) {
    await chrome.kill();
  }
  await closeServer(server);
}