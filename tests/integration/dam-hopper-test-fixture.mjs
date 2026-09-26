import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnNpmSync } from '../../scripts/release/npm-runner.cjs';
import process from 'node:process';
import { createPhase6Fixture } from '../resource-fixture.mjs';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

function npmJson(args, cwd) {
  const result = spawnNpmSync([...args, '--json', '--ignore-scripts'], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000
  });
  if (result.status !== 0) throw new Error(`npm failed: ${result.stderr}`);
  const jsonIndex = result.stdout.search(/[[{]/);
  const parsed = JSON.parse(result.stdout.slice(jsonIndex).trim());
  return Array.isArray(parsed) ? parsed : Object.values(parsed);
}

let cachedInstall = null;

export function getSharedInstallation() {
  if (cachedInstall) return cachedInstall;
  const root = mkdtempSync(join(tmpdir(), 'evcrate-dh-shared-install-'));
  const tarballDir = join(root, 'pack');
  mkdirSync(tarballDir, { recursive: true, mode: 0o755 });
  chmodSync(tarballDir, 0o755);
  const packOutput = npmJson(['pack', '--pack-destination', tarballDir], packageRoot);
  const tarballPath = join(tarballDir, packOutput[0].filename);
  const tarballBuffer = readFileSync(tarballPath);
  const sha256 = createHash('sha256').update(tarballBuffer).digest('hex');

  const installRoot = join(root, 'install');
  mkdirSync(installRoot, { recursive: true, mode: 0o755 });
  chmodSync(installRoot, 0o755);
  const installResult = spawnNpmSync([
    'install', '--prefix', installRoot, '--no-audit', '--no-fund', '--ignore-scripts', tarballPath
  ], {
    cwd: installRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000
  });
  if (installResult.status !== 0) throw new Error(`npm install failed: ${installResult.stderr}`);

  const cliPath = join(installRoot, 'node_modules', '.bin', 'evcrate');
  cachedInstall = { root, tarballPath, sha256, cliPath, installRoot };
  process.on('exit', () => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  return cachedInstall;
}

export function createConsumerWorkspace() {
  const consumerRoot = mkdtempSync(join(tmpdir(), 'evcrate-dh-ws-'));
  chmodSync(consumerRoot, 0o755);
  const fixture = createPhase6Fixture('evcrate-dh-fix-');
  mkdirSync(fixture.state, { recursive: true, mode: 0o700 });
  chmodSync(fixture.state, 0o700);
  mkdirSync(fixture.home, { recursive: true, mode: 0o755 });
  chmodSync(fixture.home, 0o755);

  const packageInfo = getSharedInstallation();

  const binDir = join(fixture.root, '.evcrate', 'source', '.evcrate', 'bin');
  mkdirSync(binDir, { recursive: true, mode: 0o755 });
  chmodSync(binDir, 0o755);
  const advisorScript = `const fs=require('node:fs'); const input=fs.readFileSync(0,'utf8'); const req=JSON.parse(input); const res={protocol:'evcrate-advisor-diagnostic',protocolVersion:1,requestId:req.requestId,status:'QUALIFIED',target:{backend:'codex',model:'gpt-5.6-sol',effort:'high'},probes:{version:{status:'passed',value:'1.0.0'},auth:{status:'passed'},capabilities:{status:'passed',model:'gpt-5.6-sol',effort:'high',noninteractive:true,session:'isolated',tools:'none',output:'json'}}}; process.stdout.write(JSON.stringify(res)+'\\n');`;
  writeFileSync(join(binDir, 'evcrate-advisor'), advisorScript, { mode: 0o755 });
  chmodSync(join(binDir, 'evcrate-advisor'), 0o755);

  writeFileSync(join(fixture.root, '.evcrate', 'source', 'CLAUDE.md'), '# Claude guidance\n', { mode: 0o644 });
  chmodSync(join(fixture.root, '.evcrate', 'source', 'CLAUDE.md'), 0o644);

  const incomingRoot = join(consumerRoot, 'incoming');
  mkdirSync(incomingRoot, { recursive: true, mode: 0o755 });
  chmodSync(incomingRoot, 0o755);
  const agentPath = join(incomingRoot, 'custom-agent.md');
  writeFileSync(agentPath, '# Custom Consumer Agent\nDescription: For DamHopper\n', { mode: 0o644 });
  chmodSync(agentPath, 0o644);

  return {
    consumerRoot,
    fixture,
    packageInfo,
    agentPath,
    cleanup() {
      try { rmSync(consumerRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      try { rmSync(fixture.root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  };
}
