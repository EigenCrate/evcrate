import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

const ITERATIONS = 3;
const JOBS_CONFIGS = [1, 2, 4, 8];

function makeTempDir(prefix = 'evcrate-bench-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function prepareWorkspace(targetDir) {
  for (const item of ['.evcrate', 'dist', 'package.json']) {
    cpSync(join(packageRoot, item), join(targetDir, item), { recursive: true });
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function runBenchmarkIteration(runAllManifestsBuild, jobs) {
  const fixture = makeTempDir(`bench-j${jobs}-`);
  try {
    prepareWorkspace(fixture);

    const startCpu = process.cpuUsage();
    const t0 = performance.now();

    const result = await runAllManifestsBuild(fixture, { jobs });

    const t1 = performance.now();
    const cpuDiff = process.cpuUsage(startCpu);
    const mem = process.memoryUsage();

    return {
      wallMs: t1 - t0,
      userCpuMs: cpuDiff.user / 1000,
      systemCpuMs: cpuDiff.system / 1000,
      peakRssMb: mem.rss / (1024 * 1024),
      manifestCount: result.allManifestPaths.length,
      targetCount: result.targetBuilds.size
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('EVCrate Phase 05: Build Generation Performance Benchmark Matrix');
  console.log(`Node: ${process.version} | Platform: ${process.platform} (${process.arch})`);
  console.log(`Runs per configuration: ${ITERATIONS} | Concurrency matrix: ${JOBS_CONFIGS.join(', ')}`);
  console.log('='.repeat(70));

  const { runAllManifestsBuild } = await import('../dist/index.js');

  const benchmarkData = new Map();

  for (const jobs of JOBS_CONFIGS) {
    console.log(`\nBenchmarking runAllManifestsBuild with jobs=${jobs} (${jobs === 1 ? 'Serial' : 'Parallel'})...`);
    const runs = [];
    for (let i = 1; i <= ITERATIONS; i++) {
      process.stdout.write(`  Run ${i}/${ITERATIONS}... `);
      const metrics = await runBenchmarkIteration(runAllManifestsBuild, jobs);
      runs.push(metrics);
      console.log(`${(metrics.wallMs / 1000).toFixed(2)}s (RSS: ${metrics.peakRssMb.toFixed(1)}MB)`);
    }

    const wallTimes = runs.map((r) => r.wallMs);
    const medianWallMs = median(wallTimes);
    const minWallMs = Math.min(...wallTimes);
    const maxWallMs = Math.max(...wallTimes);
    const medianRssMb = median(runs.map((r) => r.peakRssMb));
    const medianUserCpu = median(runs.map((r) => r.userCpuMs));
    const medianSystemCpu = median(runs.map((r) => r.systemCpuMs));

    benchmarkData.set(jobs, {
      jobs,
      runs,
      medianWallMs,
      minWallMs,
      maxWallMs,
      medianRssMb,
      medianUserCpu,
      medianSystemCpu
    });
  }

  // Summary Table
  const serialMedian = benchmarkData.get(1).medianWallMs;
  const legacyBaselineMs = 270000; // 270s observed old baseline

  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK SUMMARY MATRIX');
  console.log('='.repeat(70));
  console.log(
    'Jobs'.padEnd(6) +
    'Median (s)'.padEnd(12) +
    'Range (s)'.padEnd(16) +
    'vs Serial'.padEnd(12) +
    'vs Baseline'.padEnd(14) +
    'Peak RSS'
  );
  console.log('-'.repeat(70));

  for (const [jobs, data] of benchmarkData.entries()) {
    const medS = (data.medianWallMs / 1000).toFixed(2);
    const rangeS = `${(data.minWallMs / 1000).toFixed(2)} - ${(data.maxWallMs / 1000).toFixed(2)}`;
    const vsSerial = `${(serialMedian / data.medianWallMs).toFixed(2)}x`;
    const vsBaselineReduction = `${(((legacyBaselineMs - data.medianWallMs) / legacyBaselineMs) * 100).toFixed(1)}%`;
    const rss = `${data.medianRssMb.toFixed(1)} MB`;

    console.log(
      String(jobs).padEnd(6) +
      medS.padEnd(12) +
      rangeS.padEnd(16) +
      vsSerial.padEnd(12) +
      vsBaselineReduction.padEnd(14) +
      rss
    );
  }

  return benchmarkData;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
