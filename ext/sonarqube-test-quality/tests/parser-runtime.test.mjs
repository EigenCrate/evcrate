import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(packageRoot, 'scripts', 'vendor');
const saxPath = path.join(vendorDir, 'sax.cjs');
const licensePath = path.join(vendorDir, 'sax.LICENSE');
const provenancePath = path.join(vendorDir, 'sax-provenance.json');

describe('Vendored SAX Parser Runtime and Provenance', () => {
  test('vendored files match provenance integrity and BlueOak-1.0.0 license', () => {
    assert.ok(fs.existsSync(saxPath), 'sax.cjs must exist in scripts/vendor');
    assert.ok(fs.existsSync(licensePath), 'sax.LICENSE must exist in scripts/vendor');
    assert.ok(fs.existsSync(provenancePath), 'sax-provenance.json must exist in scripts/vendor');

    const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    assert.equal(provenance.name, 'sax');
    assert.equal(provenance.version, '1.6.1');
    assert.equal(provenance.license, 'BlueOak-1.0.0');
    assert.equal(
      provenance.tarballIntegrity,
      'sha512-42tBVwLWnaQvW5zc4HbZrTuWccECCZfBi92FDuwtqxasH+JbPB3/FOKb1m222K42R4WxuxzzMsTswfzgtSu64Q=='
    );
    assert.equal(provenance.gitCommit, '961ceeefcc5186005466f2085aeb36f31b161e37');

    const saxBuffer = fs.readFileSync(saxPath);
    const saxSha256 = crypto.createHash('sha256').update(saxBuffer).digest('hex');
    assert.equal(saxSha256, '1cdc1270d987cb0f6ee66dd8efb01c50511aa14d17b6163bbbffb21df8cf1c06');
    assert.equal(saxSha256, provenance.files[0].sha256, 'File SHA-256 must match provenance.files[0]');
    assert.equal(saxBuffer.length, provenance.files[0].sizeBytes, 'File size must match provenance.files[0]');

    const licenseBuffer = fs.readFileSync(licensePath);
    const licenseSha256 = crypto.createHash('sha256').update(licenseBuffer).digest('hex');
    assert.equal(licenseSha256, '8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004');
    assert.equal(licenseSha256, provenance.files[1].sha256, 'File SHA-256 must match provenance.files[1]');
    assert.equal(licenseBuffer.length, provenance.files[1].sizeBytes, 'File size must match provenance.files[1]');
    assert.match(licenseBuffer.toString('utf8'), /Blue Oak Model License/);
  });

  test('loads cleanly in an isolated temporary directory with no repository dependencies', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sax-isolated-'));
    try {
      const isolatedSax = path.join(tempDir, 'sax.cjs');
      fs.copyFileSync(saxPath, isolatedSax);

      const isolatedRequire = createRequire(path.join(tempDir, 'dummy.js'));
      const sax = isolatedRequire('./sax.cjs');
      assert.equal(typeof sax.parser, 'function', 'sax.parser factory must be available');

      const parser = sax.parser(true, { strictEntities: true });
      let rootTag = null;
      parser.onopentag = (node) => {
        if (!rootTag) rootTag = node.name;
      };
      parser.write('<test/>').close();
      assert.equal(rootTag, 'test');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('accepts offline JaCoCo DOCTYPE header without network or external entity resolution', () => {
    const sax = require(saxPath);
    const parser = sax.parser(true, { strictEntities: true });

    let doctypeSeen = false;
    let rootSeen = null;
    let errors = [];

    parser.ondoctype = (dt) => {
      doctypeSeen = true;
      assert.match(dt, /JACOCO/);
    };
    parser.onopentag = (node) => {
      if (!rootSeen) rootSeen = node.name;
    };
    parser.onerror = (err) => {
      errors.push(err.message);
    };

    const xml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">',
      '<report name="test"><sessioninfo id="s1" start="0" dump="0"/></report>'
    ].join('\n');

    parser.write(xml).close();
    assert.equal(errors.length, 0, `Expected 0 errors, got: ${errors.join(', ')}`);
    assert.equal(doctypeSeen, true, 'DOCTYPE must be parsed offline');
    assert.equal(rootSeen, 'report', 'Root element must be reached');
  });

  test('strictly rejects malformed XML, unclosed tags, and undeclared character entities', () => {
    const sax = require(saxPath);

    // 1. Unclosed tag: parser.close() triggers onerror with Unclosed root tag
    {
      const parser = sax.parser(true, { strictEntities: true });
      let capturedError = null;
      parser.onerror = (e) => {
        capturedError = e;
      };
      parser.write('<report><unclosed>').close();
      assert.ok(capturedError, 'Expected parser error for unclosed tag');
      assert.match(capturedError.message, /Unclosed root tag/);
    }
    // 2. Undeclared entity in strictEntities mode:
    // SAX calls onerror with "Invalid character entity".
    // Setting onerror to re-throw ensures fail-fast execution in the helper layer.
    {
      const parser = sax.parser(true, { strictEntities: true });
      let capturedError = null;
      parser.onerror = (e) => {
        capturedError = e;
        throw e;
      };
      assert.throws(() => {
        parser.write('<report name="&customEntity;"/>');
      }, /Invalid character entity/);
      assert.ok(capturedError);
    }

    // 3. Invalid numeric character entity (e.g. non-hex digits &#xZZ;)
    {
      const parser = sax.parser(true, { strictEntities: true });
      parser.onerror = (e) => { throw e; };
      assert.throws(() => {
        parser.write('<report name="&#xZZ;"/>');
      }, /Invalid character entity/);
    }

    // 4. Unquoted attribute in strict mode
    {
      const parser = sax.parser(true, { strictEntities: true });
      parser.onerror = (e) => { throw e; };
      assert.throws(() => {
        parser.write('<report unquoted=val/>');
      }, /Unquoted attribute value/);
    }
  });

  test('demonstrates application-level security policy for DTD subsets and entity declarations', () => {
    const sax = require(saxPath);
    // The Phase 03 JaCoCo helper must actively reject internal DTD subsets and entity declarations
    // inside the ondoctype callback.
    const xmlWithInternalSubset = [
      '<!DOCTYPE report [',
      '  <!ENTITY secret "INTERNAL_VALUE">',
      ']>',
      '<report name="test"/>'
    ].join('\n');

    const parser = sax.parser(true, { strictEntities: true });
    let blocked = false;

    parser.ondoctype = (dt) => {
      if (dt.includes('[') || /<!ENTITY/i.test(dt)) {
        blocked = true;
        throw new Error('Internal DTD subset and custom entity declarations are rejected');
      }
    };

    assert.throws(() => {
      parser.write(xmlWithInternalSubset);
    }, /Internal DTD subset and custom entity declarations are rejected/);
    assert.equal(blocked, true);
  });

  test('probes duplicate attribute and multiple root behavior to document Phase 03 helper obligations', () => {
    const sax = require(saxPath);

    // Probe 1: Duplicate attribute handling in upstream SAX
    // SAX's internal attrib() function retains only the first occurrence and silently discards
    // duplicate attributes without emitting an onattribute event for subsequent occurrences.
    // Therefore, an onattribute callback alone cannot detect duplicate attributes discarded by SAX.
    // If strict duplicate attribute rejection is required by the helper contract, Phase 03 must
    // detect duplicate attributes before SAX suppresses them (or document first-attribute-wins semantics).
    {
      const parser = sax.parser(true, { strictEntities: true });
      const seenAttributes = [];
      let duplicateDetected = false;

      parser.onattribute = (attr) => {
        if (seenAttributes.includes(attr.name)) {
          duplicateDetected = true;
          throw new Error(`Duplicate attribute "${attr.name}" rejected`);
        }
        seenAttributes.push(attr.name);
      };

      // Native SAX alone emits only the first attribute without throwing
      parser.write('<counter type="LINE" type="BRANCH"/>');
      assert.deepEqual(seenAttributes, ['type'], 'Upstream SAX emits first attribute and skips duplicate');
      assert.equal(duplicateDetected, false, 'Proves native SAX does not throw on duplicate attribute without helper tracking');
    }

    // Probe 2: Multiple root element handling
    // SAX processes XML as an event stream and emits onopentag for each element encountered.
    // Native SAX does not enforce a single root element.
    // Phase 03 JaCoCo helper must enforce single-root invariant by checking rootCount in onopentag.
    {
      const parser = sax.parser(true, { strictEntities: true });
      let rootCount = 0;
      let multiRootRejected = false;

      parser.onopentag = (node) => {
        rootCount++;
        if (rootCount > 1 && parser.tags.length === 1) {
          multiRootRejected = true;
          throw new Error('Multiple root elements rejected');
        }
      };

      assert.throws(() => {
        parser.write('<report name="r1"/><report name="r2"/>');
      }, /Multiple root elements rejected/);
      assert.equal(multiRootRejected, true, 'Proves helper callback is required to reject multiple root elements');
    }
  });
});
