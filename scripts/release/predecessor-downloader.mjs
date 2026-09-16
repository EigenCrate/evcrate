import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assetVerification = require('./asset-verification.cjs');
const { MAX_FILE_BYTES, MAX_ARCHIVE_BYTES } = require('./path-policy.cjs');

import { QUALIFIED_KIND } from './predecessor-resolver-core.mjs';

export async function downloadAssetStream(url, destPath, options = {}) {
  const {
    token = null,
    fetchFn = fetch,
    maxBytes = MAX_FILE_BYTES
  } = options;

  let currentUrl = url;
  let currentHeaders = {
    'User-Agent': 'evcrate-predecessor-downloader',
    'Accept': 'application/octet-stream'
  };
  if (token) {
    currentHeaders['Authorization'] = `Bearer ${token}`;
  }

  let redirectCount = 0;
  const maxRedirects = 10;

  while (redirectCount < maxRedirects) {
    const res = await fetchFn(currentUrl, {
      method: 'GET',
      headers: currentHeaders,
      redirect: 'manual'
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      redirectCount += 1;
      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`HTTP ${res.status} redirect without Location header from ${currentUrl}`);
      }
      const nextUrl = new URL(location, currentUrl).href;
      const currentOrigin = new URL(currentUrl).origin;
      const nextOrigin = new URL(nextUrl).origin;

      // Strip Authorization if redirecting across origins (e.g. github.com to AWS S3)
      if (currentOrigin !== nextOrigin && currentHeaders['Authorization']) {
        const { Authorization, ...strippedHeaders } = currentHeaders;
        currentHeaders = strippedHeaders;
      }

      currentUrl = nextUrl;
      continue;
    }

    if (!res.ok) {
      const errText = (await res.text().catch(() => '')).slice(0, 1024);
      throw new Error(`Failed to download asset from ${currentUrl} (HTTP ${res.status}): ${errText}`);
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error(`Asset at ${currentUrl} size ${contentLength} exceeds limit ${maxBytes}`);
    }

    if (!res.body) {
      throw new Error(`Empty response body when downloading asset from ${currentUrl}`);
    }

    const writeStream = fs.createWriteStream(destPath);
    let downloadedBytes = 0;

    const nodeReadable = Readable.fromWeb(res.body);
    nodeReadable.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes > maxBytes) {
        nodeReadable.destroy(new Error(`Asset stream exceeded maximum allowed size of ${maxBytes} bytes`));
      }
    });

    try {
      await pipeline(nodeReadable, writeStream);
      return;
    } catch (streamErr) {
      try { fs.unlinkSync(destPath); } catch {}
      throw streamErr;
    }
  }

  throw new Error(`Exceeded maximum redirect limit (${maxRedirects}) downloading ${url}`);
}

export async function downloadAndVerifyQualifiedPredecessor(plan, options = {}) {
  const {
    outputDir,
    githubToken = null,
    fetchFn = fetch,
    verifyFn = assetVerification.verifyWindowsAssetSet,
    downloadFn = null
  } = options;

  if (!outputDir) {
    throw new Error('outputDir is required for downloadAndVerifyQualifiedPredecessor');
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pred-dl-'));
  const stagedFiles = [];

  try {
    const assetEntries = [
      { key: 'zip', item: plan.assets.zip, maxBytes: MAX_ARCHIVE_BYTES },
      { key: 'sidecar', item: plan.assets.sidecar, maxBytes: MAX_FILE_BYTES },
      { key: 'metadata', item: plan.assets.metadata, maxBytes: MAX_FILE_BYTES },
      { key: 'installer', item: plan.assets.installer, maxBytes: MAX_FILE_BYTES }
    ];

    for (const { item, maxBytes } of assetEntries) {
      const destPath = path.join(stagingDir, item.name);
      stagedFiles.push(destPath);

      if (downloadFn) {
        await downloadFn(item.asset, destPath, { maxBytes, githubToken, fetchFn });
      } else {
        const downloadUrl = item.asset.url || item.asset.browser_download_url;
        if (!downloadUrl) {
          throw new Error(`Asset "${item.name}" has no url or browser_download_url`);
        }
        await downloadAssetStream(downloadUrl, destPath, {
          token: githubToken,
          fetchFn,
          maxBytes
        });
      }
    }

    // Verify exact four assets
    const summary = verifyFn({
      dir: stagingDir,
      version: plan.release.version,
      tag: plan.release.tag_name
    });

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Promote verified files to outputDir
    for (const item of [plan.assets.zip, plan.assets.sidecar, plan.assets.metadata, plan.assets.installer]) {
      const src = path.join(stagingDir, item.name);
      const dst = path.join(outputDir, item.name);
      fs.copyFileSync(src, dst);
    }

    // Post-promotion verification on outputDir ensures no extraneous stale files exist in outputDir
    const promotedSummary = verifyFn({
      dir: outputDir,
      version: plan.release.version,
      tag: plan.release.tag_name
    });

    return {
      kind: QUALIFIED_KIND,
      version: plan.release.version,
      tag: plan.release.tag_name,
      sourceCommit: promotedSummary.sourceCommit,
      files: promotedSummary.files,
      directory: outputDir
    };
  } catch (error) {
    // If outputDir has partial files created during promotion, clean up
    try {
      for (const item of [plan.assets.zip, plan.assets.sidecar, plan.assets.metadata, plan.assets.installer]) {
        const dst = path.join(outputDir, item.name);
        if (fs.existsSync(dst)) fs.unlinkSync(dst);
      }
    } catch {}
    throw error;
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {}
  }
}
