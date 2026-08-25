'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_LIMITS } = require('../../advisor-routing/runner.cjs');

function policyFor(activeHost, backend, execution = 'auto') {
  return {
    version: 1,
    hosts: {
      [activeHost]: {
        backend,
        model: `configured-${backend}`,
        effort: 'high',
        execution
      }
    }
  };
}

function expectCode(callback, code) {
  return require('node:assert/strict').throws(callback, (error) => error?.code === code);
}

function temporaryHome(withPolicy = false) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-checkpoint-home-'));
  fs.chmodSync(home, 0o700);
  if (withPolicy) {
    const policyDirectory = path.join(home, '.evcrate');
    fs.mkdirSync(policyDirectory, { mode: 0o700 });
    fs.chmodSync(policyDirectory, 0o700);
  }
  return home;
}

function withHome(home, callback) {
  const original = os.homedir;
  os.homedir = () => home;
  try {
    return callback();
  } finally {
    os.homedir = original;
  }
}

function invocation(adapter, prompt) {
  return {
    adapter,
    executable: process.execPath,
    argv: [],
    cwd: process.cwd(),
    workspaceRoot: process.cwd(),
    prompt,
    authKeys: [],
    limits: DEFAULT_LIMITS
  };
}

function fakeAdapter(name, calls, failure = null) {
  return {
    name,
    authKeys: [],
    probeVersion: () => calls.push(`${name}:version`),
    probeAuth: () => {
      calls.push(`${name}:auth`);
      if (failure) throw failure;
    },
    probeCapabilities: ({ descriptor }) => {
      calls.push(`${name}:capabilities:${descriptor.route.model}:${descriptor.route.effort}`);
    },
    buildInvocation: ({ brief }) => {
      calls.push(`${name}:build:${brief}`);
      return invocation(name, brief);
    },
    parseResult: ({ checkpoint } = {}) => {
      calls.push(`${name}:parse`);
      return {
        protocol: 'evcrate-advisor-result',
        version: 1,
        checkpoint: checkpoint?.checkpoint || 'review:legacy-external',
        status: 'ADVICE_READY',
        recommendation: 'bounded fake result',
        must_fix: [],
        cautions: [],
        assumptions: [],
        success_checks: [],
        unresolved_questions: []
      };
    },
    classifyFailure: (error) => error?.code || 'PROCESS_FAILED'
  };
}

module.exports = {
  expectCode,
  fakeAdapter,
  policyFor,
  temporaryHome,
  withHome
};
