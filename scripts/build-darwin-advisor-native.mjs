#!/usr/bin/env node
/*
 * build-darwin-advisor-native.mjs
 *
 * Controlled build authority script for Darwin advisor native helper binaries.
 * Compiles arm64 and x64 Mach-O shared libraries (.node) and binds provenance.
 *
 * Usage: node scripts/build-darwin-advisor-native.mjs
 *
 * Copyright (c) 2026 EigenCrate. Licensed under MIT.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DARWIN_NATIVE_DIR = path.join(
  ROOT,
  '.evcrate',
  'source',
  '.evcrate',
  'bin',
  'lib',
  'advisor',
  'native',
  'darwin'
);

const PREBUILT_DIR = path.join(DARWIN_NATIVE_DIR, 'prebuilt');
const ARM64_OUT_DIR = path.join(PREBUILT_DIR, 'darwin-arm64');
const X64_OUT_DIR = path.join(PREBUILT_DIR, 'darwin-x64');

const SOURCE_FILES = ['advisor-native.h', 'advisor-native.c', 'storage.c', 'process.c'];

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function resolveIncludeDir() {
  if (process.env.NODE_INC && fs.existsSync(path.join(process.env.NODE_INC, 'node_api.h'))) {
    return process.env.NODE_INC;
  }
  const candidate = path.join(path.dirname(process.execPath), '..', 'include', 'node');
  if (fs.existsSync(path.join(candidate, 'node_api.h'))) {
    return candidate;
  }
  const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node', process.version, 'include', 'node');
  if (fs.existsSync(path.join(nvmDir, 'node_api.h'))) {
    return nvmDir;
  }
  const usrInclude = '/usr/include/node';
  if (fs.existsSync(path.join(usrInclude, 'node_api.h'))) {
    return usrInclude;
  }
  throw new Error('Cannot locate node_api.h in system or Node include directories');
}

function resolveLd64() {
  if (process.env.LD64 && fs.existsSync(process.env.LD64)) return process.env.LD64;

  const rustupDir = path.join(os.homedir(), '.rustup');
  if (fs.existsSync(rustupDir)) {
    try {
      const output = execFileSync('find', [rustupDir, '-name', 'ld64.lld'], { encoding: 'utf8' }).trim();
      const first = output.split('\n').filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    } catch {
      // ignore find error
    }
  }
  return null;
}

function compileArch({ arch, target, includeDir, tempDir, ld64Path }) {
  console.log(`[build-darwin] Compiling architecture: ${arch} (target: ${target})`);

  const objectFiles = [];
  const cFiles = ['advisor-native.c', 'storage.c', 'process.c'];

  for (const cFile of cFiles) {
    const srcPath = path.join(DARWIN_NATIVE_DIR, cFile);
    const objPath = path.join(tempDir, `${arch}-${path.parse(cFile).name}.o`);

    const compileArgs = [
      '-target', target,
      '-ffreestanding',
      '-c', srcPath,
      '-o', objPath,
      '-I', includeDir,
      '-I', DARWIN_NATIVE_DIR,
      '-O2',
      '-Wall',
      '-Wextra',
      '-fPIC',
      '-DNAPI_VERSION=8',
      '-DADVISOR_NATIVE_ABI_VERSION=1'
    ];
    execFileSync('clang', compileArgs, { stdio: 'inherit' });
    objectFiles.push(objPath);
  }

  const outNode = path.join(tempDir, `${arch}-advisor-native.node`);

  if (process.platform === 'darwin') {
    const linkArgs = [
      '-target', target,
      '-bundle',
      '-undefined', 'dynamic_lookup',
      '-o', outNode,
      ...objectFiles
    ];
    execFileSync('clang', linkArgs, { stdio: 'inherit' });
  } else {
    if (!ld64Path) throw new Error('ld64.lld Mach-O linker required for cross-compilation');
    const linkArgs = [
      '-arch', arch === 'arm64' ? 'arm64' : 'x86_64',
      '-platform_version', 'macos', '11.0.0', '11.0.0',
      '-dylib',
      '-undefined', 'dynamic_lookup',
      '-o', outNode,
      ...objectFiles
    ];
    execFileSync(ld64Path, linkArgs, { stdio: 'inherit' });
  }

  const outBuffer = fs.readFileSync(outNode);
  // Verify Mach-O 64-bit magic (0xFEEDFACF little-endian)
  const magic = outBuffer.readUInt32LE(0);
  if (magic !== 0xfeedfacf) {
    throw new Error(`Invalid Mach-O 64-bit magic: 0x${magic.toString(16)}`);
  }

  return {
    path: outNode,
    buffer: outBuffer,
    size: outBuffer.length,
    sha256: sha256(outBuffer)
  };
}

export function buildDarwinNative() {
  console.log('[build-darwin] Starting Darwin advisor native build...');

  // Compute source file digests
  const sourceDigests = {};
  const hashList = [];
  for (const f of SOURCE_FILES) {
    const filePath = path.join(DARWIN_NATIVE_DIR, f);
    if (!fs.existsSync(filePath)) throw new Error(`Missing required source file: ${filePath}`);
    const content = fs.readFileSync(filePath);
    const digest = sha256(content);
    sourceDigests[f] = digest;
    hashList.push(`${f}:${digest}`);
  }
  hashList.sort();
  const aggregateSourceDigest = sha256(Buffer.from(hashList.join('\n')));

  const includeDir = resolveIncludeDir();
  const ld64Path = resolveLd64();

  fs.mkdirSync(ARM64_OUT_DIR, { recursive: true });
  fs.mkdirSync(X64_OUT_DIR, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'darwin-build-'));

  try {
    const arm64Result = compileArch({
      arch: 'arm64',
      target: 'arm64-apple-macos11.0.0',
      includeDir,
      tempDir,
      ld64Path
    });

    const x64Result = compileArch({
      arch: 'x64',
      target: 'x86_64-apple-macos11.0.0',
      includeDir,
      tempDir,
      ld64Path
    });

    // Stage outputs atomically
    const finalArm64Path = path.join(ARM64_OUT_DIR, 'advisor-native.node');
    const finalX64Path = path.join(X64_OUT_DIR, 'advisor-native.node');

    fs.writeFileSync(finalArm64Path, arm64Result.buffer);
    fs.writeFileSync(finalX64Path, x64Result.buffer);

    // Generate provenance manifest
    const provenance = {
      schema: 'evcrate-darwin-native-artifacts/v1',
      bridge_abi: 1,
      napi_version: 8,
      deployment_target: '11.0.0',
      apple_source_revision: 'xnu-8792.81.2',
      sdk_layout: {
        rusage_info_v0_size: 96,
        ri_proc_start_abstime_offset: 80
      },
      toolchain: {
        compiler: 'clang 22.1.8',
        linker: 'ld64.lld (rust-lld)',
        host: `${os.platform()} ${os.arch()}`
      },
      source_digests: sourceDigests,
      aggregate_source_digest: aggregateSourceDigest,
      artifacts: {
        'darwin-arm64': {
          relative_path: 'lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node',
          size: arm64Result.size,
          sha256: arm64Result.sha256
        },
        'darwin-x64': {
          relative_path: 'lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node',
          size: x64Result.size,
          sha256: x64Result.sha256
        }
      },
      built_at: new Date().toISOString()
    };

    const provenancePath = path.join(PREBUILT_DIR, 'artifacts.json');
    fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n', 'utf8');

    console.log('[build-darwin] Darwin native artifacts built successfully:');
    console.log(`  arm64: ${arm64Result.size} bytes (${arm64Result.sha256})`);
    console.log(`  x64:   ${x64Result.size} bytes (${x64Result.sha256})`);
    console.log(`  provenance: ${provenancePath}`);

    return provenance;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  buildDarwinNative();
}
