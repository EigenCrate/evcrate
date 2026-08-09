import assert from "node:assert/strict";
import test from "node:test";
import {
  CODEX_ROLE_DEFAULTS,
  parseModelRoles,
  registerModelRoles,
  resolveModelRole,
} from "../files/agent/extensions/evcrate/model-roles.js";

const registry = [
  { provider: "openai-codex", id: "gpt-5.6-sol" },
  { provider: "openai-codex", id: "gpt-5.6-terra" },
  { provider: "openai-codex", id: "gpt-5.6-luna" },
  { provider: "other", id: "available" },
];
const roles = { planner: { role: "strong" }, docs: { role: "fast" }, inherited: { role: "parent" } };

test("Codex semantic roles resolve to exact available defaults", () => {
  assert.deepEqual(CODEX_ROLE_DEFAULTS.strong, { model: "openai-codex/gpt-5.6-sol", thinking: "high" });
  assert.deepEqual(resolveModelRole({ provider: "openai-codex", agent: "planner", agentRoles: roles, registry }), CODEX_ROLE_DEFAULTS.strong);
  assert.deepEqual(resolveModelRole({ provider: "openai-codex", agent: "docs", agentRoles: roles, registry }), CODEX_ROLE_DEFAULTS.fast);
});

test("user routes are validated without changing settings and invalid routes inherit once", () => {
  const settings = { evcrate: { modelRoles: { providers: {
    other: { strong: { model: "other/available", thinking: "medium" } },
    broken: { strong: { model: "not-qualified", thinking: "nope" } },
  } } } };
  const parsed = parseModelRoles(settings);
  assert.equal(parsed.routes.get("other").strong.model, "other/available");
  assert.ok(parsed.errors.has("broken:strong"));
  const notices = [];
  const warnings = new Set();
  const first = resolveModelRole({ settings, provider: "broken", agent: "planner", agentRoles: roles, registry, warnings, warn: (note) => notices.push(note) });
  const second = resolveModelRole({ settings, provider: "broken", agent: "planner", agentRoles: roles, registry, warnings, warn: (note) => notices.push(note) });
  assert.equal(first.inherited, true);
  assert.equal(second.inherited, true);
  assert.equal(notices.length, 1);
});

test("unknown providers, parent roles, and unavailable implicit models inherit", () => {
  assert.equal(resolveModelRole({ provider: "missing", agent: "planner", agentRoles: roles, registry }).inherited, true);
  assert.equal(resolveModelRole({ provider: "openai-codex", agent: "inherited", agentRoles: roles, registry }).inherited, true);
  assert.equal(resolveModelRole({ settings: { modelRoles: { providers: { other: { strong: { model: "other/missing" } } } } }, provider: "other", agent: "planner", agentRoles: roles, registry }).inherited, true);
});

test("explicit unavailable or malformed models and thinking fail instead of inheriting", () => {
  assert.match(resolveModelRole({ model: "gpt-5.6-sol", registry }).error, /provider\/model/);
  assert.match(resolveModelRole({ model: "other/missing", registry }).error, /unavailable/);
  assert.match(resolveModelRole({ model: "other/available", thinking: "nope", registry }).error, /thinking/);
  assert.deepEqual(resolveModelRole({ model: "other/available", registry }), { model: "other/available" });
  assert.deepEqual(resolveModelRole({ thinking: "high", provider: "openai-codex", agent: "planner", agentRoles: roles, registry }), { model: "openai-codex/gpt-5.6-sol", thinking: "high" });
});

test("registration resets warning de-duplication per session", () => {
  const handlers = new Map();
  const pi = { on: (name, fn) => handlers.set(name, fn) };
  const resolve = registerModelRoles(pi, { provider: "unknown", agentRoles: roles, warn: () => {} });
  assert.equal(resolve({ agent: "planner" }, { modelRegistry: registry }).inherited, true);
  handlers.get("session_start")();
  assert.equal(resolve({ agent: "planner" }, { modelRegistry: registry }).inherited, true);
});
