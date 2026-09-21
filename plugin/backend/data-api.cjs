var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/protocol/advisor-plugin-data-api.ts
var exports_advisor_plugin_data_api = {};
__export(exports_advisor_plugin_data_api, {
  ADVISOR_DATA_METHODS: () => ADVISOR_DATA_METHODS,
  DATA_API_PROTOCOL_V1: () => DATA_API_PROTOCOL_V1,
  DATA_API_VERSION_V1: () => DATA_API_VERSION_V1,
  DEFAULT_PAGE_LIMIT: () => DEFAULT_PAGE_LIMIT,
  HISTORY_REFRESH_STATES: () => HISTORY_REFRESH_STATES,
  MAX_COMPARE_ITEMS: () => MAX_COMPARE_ITEMS,
  MAX_CONTROL_PAYLOAD_BYTES: () => MAX_CONTROL_PAYLOAD_BYTES,
  MAX_CURSOR_BYTES: () => MAX_CURSOR_BYTES,
  MAX_EVALUATION_DOCUMENT_BYTES: () => MAX_EVALUATION_DOCUMENT_BYTES,
  MAX_EVALUATION_PAGE_LIMIT: () => MAX_EVALUATION_PAGE_LIMIT,
  MAX_FRAME_PAYLOAD_BYTES: () => MAX_FRAME_PAYLOAD_BYTES,
  MAX_OPAQUE_ID_BYTES: () => MAX_OPAQUE_ID_BYTES,
  MAX_PAGE_LIMIT: () => MAX_PAGE_LIMIT,
  MAX_PAGE_RESULT_BYTES: () => MAX_PAGE_RESULT_BYTES,
  PLUGIN_ERROR_CODES: () => PLUGIN_ERROR_CODES,
  POLICY_STATUSES: () => POLICY_STATUSES,
  PluginDataApiError: () => PluginDataApiError,
  STALE_REASONS: () => STALE_REASONS,
  validateEvaluationDescriptorV1: () => validateEvaluationDescriptorV1,
  validateEvaluationsCompareParams: () => validateEvaluationsCompareParams,
  validateEvaluationsCompareResult: () => validateEvaluationsCompareResult,
  validateEvaluationsListParams: () => validateEvaluationsListParams,
  validateEvaluationsListResult: () => validateEvaluationsListResult,
  validateEvaluationsReadParams: () => validateEvaluationsReadParams,
  validateEvaluationsReadResult: () => validateEvaluationsReadResult,
  validateHistoryDetailParams: () => validateHistoryDetailParams,
  validateHistoryDetailResult: () => validateHistoryDetailResult,
  validateHistoryPageParams: () => validateHistoryPageParams,
  validateHistoryPageResult: () => validateHistoryPageResult,
  validateHistoryRefreshParams: () => validateHistoryRefreshParams,
  validateHistoryRefreshResult: () => validateHistoryRefreshResult,
  validateHistoryRowV1: () => validateHistoryRowV1,
  validateHistorySummaryParams: () => validateHistorySummaryParams,
  validateHistorySummaryResult: () => validateHistorySummaryResult,
  validatePolicyReadCurrentParams: () => validatePolicyReadCurrentParams,
  validatePolicyReadCurrentResult: () => validatePolicyReadCurrentResult
});
module.exports = __toCommonJS(exports_advisor_plugin_data_api);

// src/protocol/canonical-json.ts
var MAX_JSON_DEPTH = 16;
var CONTROL = /[\u0000-\u001f\u007f]/u;
var NUMBER_TOKENS = new WeakMap;
function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function assertJsonText(value) {
  if (CONTROL.test(value))
    throw new TypeError("JSON string contains a control character");
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const next = value.charCodeAt(index + 1);
    const previous = value.charCodeAt(index - 1);
    if (code >= 55296 && code <= 56319 && !(next >= 56320 && next <= 57343))
      throw new TypeError("JSON string contains an unpaired surrogate");
    if (code >= 56320 && code <= 57343 && !(previous >= 55296 && previous <= 56319))
      throw new TypeError("JSON string contains an unpaired surrogate");
  }
}
function compareCodePoints(left, right) {
  const a = Array.from(left, (char) => char.codePointAt(0));
  const b = Array.from(right, (char) => char.codePointAt(0));
  for (let index = 0;index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index])
      return a[index] - b[index];
  }
  return a.length - b.length;
}
function expandExponent(raw) {
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [coefficient, exponentText] = unsigned.split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponentText);
  if (point <= 0)
    return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length)
    return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
function toExponent(raw) {
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const point = unsigned.includes(".") ? unsigned.indexOf(".") : unsigned.length;
  const digits = unsigned.replace(".", "");
  const first = digits.search(/[1-9]/u);
  if (first < 0)
    return "0";
  const significant = digits.slice(first).replace(/0+$/u, "");
  const exponent = point - first - 1;
  return `${sign}${significant[0]}${significant.length > 1 ? `.${significant.slice(1)}` : ""}e${exponent >= 0 ? "+" : "-"}${Math.abs(exponent).toString().padStart(2, "0")}`;
}
function normalizeExponent(raw) {
  const [coefficient, power] = raw.split("e");
  const exponent = Number(power);
  return `${coefficient}e${exponent >= 0 ? "+" : "-"}${Math.abs(exponent).toString().padStart(2, "0")}`;
}
function pythonFloat(value) {
  if (Object.is(value, -0))
    return "-0.0";
  const raw = value.toString();
  const absolute = Math.abs(value);
  if (Number.isInteger(value) && absolute < 10000000000000000 && !raw.includes("e"))
    return `${raw}.0`;
  if (absolute >= 0.0001 && absolute < 10000000000000000) {
    return raw.includes("e") ? expandExponent(raw) : raw;
  }
  return raw.includes("e") ? normalizeExponent(raw) : toExponent(raw);
}
function canonicalNumber(value, token) {
  if (token)
    return token.floating ? pythonFloat(value) : token.raw === "-0" ? "0" : token.raw;
  if (Number.isSafeInteger(value) && Math.abs(value) < 1000000000000000000000)
    return value.toString();
  return pythonFloat(value);
}
function tokenKey(path) {
  return JSON.stringify(path);
}
function canonical(value, depth, root, path) {
  if (value === undefined)
    return "";
  if (depth > MAX_JSON_DEPTH)
    throw new RangeError("JSON nesting is too deep");
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "string") {
    assertJsonText(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("JSON number is not finite");
    return canonicalNumber(value, root ? NUMBER_TOKENS.get(root)?.get(tokenKey(path)) : undefined);
  }
  if (Array.isArray(value))
    return `[${value.map((child, index) => canonical(child, depth + 1, root, [...path, index]) || "null").join(",")}]`;
  if (!plain(value))
    throw new TypeError("JSON value must be plain");
  return `{${Object.keys(value).sort(compareCodePoints).flatMap((key) => {
    assertJsonText(key);
    const encoded = canonical(value[key], depth + 1, root, [...path, key]);
    return encoded ? [`${JSON.stringify(key)}:${encoded}`] : [];
  }).join(",")}}`;
}
function canonicalJson(value) {
  const root = value !== null && typeof value === "object" ? value : null;
  return canonical(value, 0, root, []);
}

// src/protocol/json.ts
var MAX_JSON_BYTES = 64 * 1024;
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

// src/protocol/advisor-contract-runtime.ts
var CANDIDATE_BACKENDS = Object.freeze(["claude", "codex", "antigravity", "pi", "omp"]);
var CHECKPOINT_PROTOCOL_V2 = "evcrate-advisor-checkpoint";
var CHECKPOINT_VERSION_V2 = 2;
var RESULT_PROTOCOL_V2 = "evcrate-advisor-result";
var RESULT_VERSION_V2 = 2;
var CONTROLLER_VERSION_V2 = 2;
var HISTORY_VERSION_V1 = 1;
var MAX_POLICY_BYTES = 16384;
var MAX_ENVELOPE_BYTES = 32768;
var MAX_QUESTION_BYTES = 4096;
var MAX_TASK_BYTES = 8192;
var MAX_EVIDENCE_TEXT_BYTES = 16384;
var MAX_RESULT_BODY_BYTES = 16384;
var MAX_EXECUTION_HISTORY_BYTES = 131072;
var MAX_OUTCOME_HISTORY_BYTES = 65536;
var MAX_EVIDENCE_FILES = 4;
var MAX_CHANGED_PATHS = 16;
var MAX_MODEL_ATTEMPTS = 5;
var MAX_TOTAL_ATTEMPT_SUMMARIES = 8;
var MAX_CORRECTION_CYCLES = 3;
var DECISION_KINDS = Object.freeze(["direction", "review", "stuck", "decision", "reconcile"]);
var ATTEMPT_SLOTS = Object.freeze(["primary", "backup"]);
var ATTEMPT_PHASES = Object.freeze(["preflight", "model"]);
var TERMINAL_CLASSIFICATIONS = Object.freeze(["success", "transient", "fatal", "cancelled", "skipped"]);
var CLEANUP_OUTCOMES = Object.freeze(["confirmed", "unconfirmed", "not_needed"]);
var AUDIT_STATUSES = Object.freeze(["recorded", "degraded", "disabled"]);
var OUTCOME_RESULTS = Object.freeze(["resolved", "unresolved", "regressed", "unknown"]);
var EXECUTION_STATUSES = Object.freeze(["started", "ADVICE_READY", "FAILED"]);

class AdvisorContractError extends Error {
  issue;
  constructor(issue) {
    super(`Advisor contract violation: ${issue.code} at ${issue.path || "/"}`);
    this.name = "AdvisorContractError";
    this.issue = Object.freeze({ code: issue.code, path: issue.path });
    Object.freeze(this);
  }
}
function fail(c, p = "") {
  throw new AdvisorContractError({ code: c, path: p });
}
var enc = new TextEncoder;
var utf8Bytes = (s) => enc.encode(s).byteLength;
function deepFreeze(v, s = new Set) {
  if (!v || typeof v !== "object" || s.has(v))
    return v;
  s.add(v);
  Object.values(v).forEach((c) => deepFreeze(c, s));
  return Object.freeze(v);
}
function asObj(v, exp, p) {
  if (!isPlainObject(v))
    fail("CONTRACT_TYPE_INVALID", p);
  const k = Object.keys(v);
  if (k.length !== exp.length || k.some((x) => !exp.includes(x)))
    fail("CONTRACT_KEYS_INVALID", p);
  return v;
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SHA256_RE = /^[0-9a-f]{64}$/;
var CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
var STACK_RE = /(?:\bat\s+(?:async\s+|new\s+)?[\w$.<>]+\s+\([^)]*:\d+(?::\d+)?\)|\bat\s+\S+:\d+:\d+|\bnode:internal\/|\bFile\s+["'][^"']+["'],\s+line\s+\d+|\b(?:goroutine\s+\d+\s+\[|stack\s+backtrace:)|(?:^|\n)\s*[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+(?:\([^)]*\))?\n\s+.*\.go:\d+|\b\d+:\s+0x[0-9a-fA-F]+\s+-\s+)/;
var SENS_RE = /(?:-----BEGIN[^\n]*PRIVATE KEY-----|["']?(?:api[_ -]?key|secret|password|token|credential)["']?\s*[:=]|["']?(?:raw\s+)?stderr["']?\s*[:=]|["']?stack\s+trace["']?\s*[:=]|\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/]+={0,2}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b|\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b)/i;
var META_PATHS = { ".git": true, ".gitignore": true, ".gitmodules": true, ".gitattributes": true, ".github": true, ".gitlab": true, ".hg": true, ".svn": true };
function str(v, max, multi, p) {
  if (typeof v !== "string")
    fail("CONTRACT_TYPE_INVALID", p);
  if (utf8Bytes(v) > max)
    fail("CONTRACT_SIZE_EXCEEDED", p);
  if (!v || v.trim() !== v || CTRL_RE.test(v) || !multi && /[\r\n\t]/.test(v) || SENS_RE.test(v) || STACK_RE.test(v))
    fail("CONTRACT_VALUE_INVALID", p);
  return v;
}
function uuid(v, p) {
  if (typeof v !== "string")
    fail("CONTRACT_TYPE_INVALID", p);
  if (!UUID_RE.test(v))
    fail("CONTRACT_VALUE_INVALID", p);
  return v;
}
function digest(v, p) {
  if (typeof v !== "string")
    fail("CONTRACT_TYPE_INVALID", p);
  if (!SHA256_RE.test(v))
    fail("CONTRACT_VALUE_INVALID", p);
  return v;
}
function num(v, min, max, p) {
  if (typeof v !== "number" || !Number.isSafeInteger(v))
    fail("CONTRACT_TYPE_INVALID", p);
  if (v < min || v > max)
    fail("CONTRACT_VALUE_INVALID", p);
  return v;
}
function safePath(v, p) {
  if (typeof v !== "string")
    fail("CONTRACT_TYPE_INVALID", p);
  if (utf8Bytes(v) > 512)
    fail("CONTRACT_SIZE_EXCEEDED", p);
  if (!v || v.includes("\\") || v.startsWith("/") || /^[A-Za-z]:/.test(v) || CTRL_RE.test(v) || v.split("/").some((s) => !s || s === "." || s === ".." || META_PATHS[`.${s.replace(/^\./, "")}`]) || /(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|password|token|private[-_]?key).*)/i.test(v))
    fail("CONTRACT_VALUE_INVALID", p);
  return v;
}
function checkBytes(v, max, p = "") {
  if (utf8Bytes(JSON.stringify(v)) > max)
    fail("CONTRACT_SIZE_EXCEEDED", p);
}
function arr(v, max, p) {
  if (!Array.isArray(v))
    fail("CONTRACT_TYPE_INVALID", p);
  if (v.length > max)
    fail("CONTRACT_SIZE_EXCEEDED", p);
  return v;
}
function validateRouteTarget(t, p = "") {
  const o = asObj(t, ["backend", "model", "effort"], p);
  if (typeof o.backend !== "string" || !CANDIDATE_BACKENDS.includes(o.backend))
    fail(typeof o.backend !== "string" ? "CONTRACT_TYPE_INVALID" : "CONTRACT_VALUE_INVALID", `${p}/backend`);
  return Object.freeze({ backend: o.backend, model: str(o.model, 256, false, `${p}/model`), effort: str(o.effort, 64, false, `${p}/effort`) });
}
function validateWaitPolicy(w, p = "") {
  const o = asObj(w, ["mode", "warn_after_ms", "warn_every_ms"], p);
  if (o.mode !== "until_terminal")
    fail("CONTRACT_VALUE_INVALID", `${p}/mode`);
  return Object.freeze({ mode: "until_terminal", warn_after_ms: num(o.warn_after_ms, 1000, 3600000, `${p}/warn_after_ms`), warn_every_ms: num(o.warn_every_ms, 1000, 3600000, `${p}/warn_every_ms`) });
}
function validateHistoryPolicy(h, p = "") {
  const o = asObj(h, ["retention_days", "max_bytes"], p);
  return Object.freeze({ retention_days: num(o.retention_days, 1, 365, `${p}/retention_days`), max_bytes: num(o.max_bytes, 1048576, 1073741824, `${p}/max_bytes`) });
}
function validatePolicyV2(v, p = "") {
  const o = asObj(v, ["version", "advisor", "wait", "history"], p);
  if (o.version !== 2)
    fail("CONTRACT_VERSION_UNSUPPORTED", `${p}/version`);
  const adv = asObj(o.advisor, ["primary", "backup"], `${p}/advisor`), primary = validateRouteTarget(adv.primary, `${p}/advisor/primary`), backup = validateRouteTarget(adv.backup, `${p}/advisor/backup`);
  if (primary.backend === backup.backend && primary.model === backup.model && primary.effort === backup.effort)
    fail("CONTRACT_VALUE_INVALID", `${p}/advisor/backup`);
  const out = { version: 2, advisor: { primary, backup }, wait: validateWaitPolicy(o.wait, `${p}/wait`), history: validateHistoryPolicy(o.history, `${p}/history`) };
  checkBytes(out, MAX_POLICY_BYTES, p);
  return deepFreeze(out);
}
function validateValidationResult(v, p = "") {
  const o = asObj(v, ["suite", "command", "status", "passed", "failed", "details"], p);
  if (!["passed", "failed", "skipped"].includes(o.status))
    fail("CONTRACT_VALUE_INVALID", `${p}/status`);
  return Object.freeze({ suite: str(o.suite, 128, false, `${p}/suite`), command: str(o.command, 512, false, `${p}/command`), status: o.status, passed: num(o.passed, 0, Number.MAX_SAFE_INTEGER, `${p}/passed`), failed: num(o.failed, 0, Number.MAX_SAFE_INTEGER, `${p}/failed`), details: o.details === null ? null : str(o.details, 4096, true, `${p}/details`) });
}
function validateArtifactRef(a, p = "") {
  const ao = asObj(a, ["id", "path", "digest", "description"], p);
  return Object.freeze({ id: str(ao.id, 128, false, `${p}/id`), path: safePath(ao.path, `${p}/path`), digest: digest(ao.digest, `${p}/digest`), description: str(ao.description, 1024, true, `${p}/description`) });
}
function validateCheckpointV2(cp, p = "") {
  const o = asObj(cp, ["protocol", "version", "task_run_id", "checkpoint_id", "phase_id", "task_revision", "evidence_revision", "checkpoint", "kind", "question", "task", "proposal", "evidence", "prior"], p);
  if (o.protocol !== CHECKPOINT_PROTOCOL_V2 || o.version !== CHECKPOINT_VERSION_V2)
    fail("CONTRACT_VERSION_UNSUPPORTED", o.protocol !== CHECKPOINT_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
  if (!DECISION_KINDS.includes(o.kind))
    fail("CONTRACT_VALUE_INVALID", `${p}/kind`);
  uuid(o.task_run_id, `${p}/task_run_id`);
  str(o.checkpoint_id, 128, false, `${p}/checkpoint_id`);
  str(o.phase_id, 64, false, `${p}/phase_id`);
  num(o.task_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/task_revision`);
  num(o.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`);
  str(o.checkpoint, 128, false, `${p}/checkpoint`);
  str(o.question, MAX_QUESTION_BYTES, true, `${p}/question`);
  const t = asObj(o.task, ["goal", "non_goals", "authorized_paths", "scope_rationale", "invariants", "success_criteria"], `${p}/task`);
  str(t.goal, MAX_TASK_BYTES, true, `${p}/task/goal`);
  str(t.scope_rationale, MAX_TASK_BYTES, true, `${p}/task/scope_rationale`);
  ["non_goals", "invariants", "success_criteria"].forEach((k) => arr(t[k], 64, `${p}/task/${k}`).forEach((x, i) => str(x, 1024, false, `${p}/task/${k}/${i}`)));
  const authPaths = arr(t.authorized_paths, 64, `${p}/task/authorized_paths`);
  authPaths.forEach((x, i) => safePath(x, `${p}/task/authorized_paths/${i}`));
  if (new Set(authPaths).size !== authPaths.length)
    fail("CONTRACT_DUPLICATE_IDENTITY", `${p}/task/authorized_paths`);
  const pr = asObj(o.proposal, ["next_action", "rationale", "intended_changed_paths"], `${p}/proposal`);
  str(pr.next_action, MAX_TASK_BYTES, true, `${p}/proposal/next_action`);
  str(pr.rationale, MAX_TASK_BYTES, true, `${p}/proposal/rationale`);
  const chPaths = arr(pr.intended_changed_paths, MAX_CHANGED_PATHS, `${p}/proposal/intended_changed_paths`);
  chPaths.forEach((x, i) => safePath(x, `${p}/proposal/intended_changed_paths/${i}`));
  if (new Set(chPaths).size !== chPaths.length)
    fail("CONTRACT_DUPLICATE_IDENTITY", `${p}/proposal/intended_changed_paths`);
  const ev = asObj(o.evidence, ["summary", "files", "validation_results", "artifacts"], `${p}/evidence`);
  const evSummary = str(ev.summary, MAX_EVIDENCE_TEXT_BYTES, true, `${p}/evidence/summary`);
  let evBytes = utf8Bytes(evSummary);
  const fPaths = {}, aIds = {};
  arr(ev.files, MAX_EVIDENCE_FILES, `${p}/evidence/files`).forEach((f, i) => {
    const fo = asObj(f, ["path", "excerpt", "digest"], `${p}/evidence/files/${i}`), fp = safePath(fo.path, `${p}/evidence/files/${i}/path`);
    if (fPaths[fp])
      fail("CONTRACT_DUPLICATE_IDENTITY", `${p}/evidence/files/${i}/path`);
    fPaths[fp] = true;
    str(fo.excerpt, MAX_EVIDENCE_TEXT_BYTES, true, `${p}/evidence/files/${i}/excerpt`);
    digest(fo.digest, `${p}/evidence/files/${i}/digest`);
    evBytes += utf8Bytes(fo.excerpt);
  });
  arr(ev.validation_results, 16, `${p}/evidence/validation_results`).forEach((v, i) => {
    const vr = validateValidationResult(v, `${p}/evidence/validation_results/${i}`);
    evBytes += utf8Bytes(vr.suite) + utf8Bytes(vr.command) + (vr.details ? utf8Bytes(vr.details) : 0);
  });
  arr(ev.artifacts, 16, `${p}/evidence/artifacts`).forEach((a, i) => {
    const ar = validateArtifactRef(a, `${p}/evidence/artifacts/${i}`);
    if (aIds[ar.id])
      fail("CONTRACT_DUPLICATE_IDENTITY", `${p}/evidence/artifacts/${i}/id`);
    aIds[ar.id] = true;
    evBytes += utf8Bytes(ar.id) + utf8Bytes(ar.description);
  });
  if (evBytes > MAX_EVIDENCE_TEXT_BYTES)
    fail("CONTRACT_SIZE_EXCEEDED", `${p}/evidence`);
  const pri = asObj(o.prior, ["prior_consultation_id", "prior_counsel", "prior_disposition", "observed_outcome"], `${p}/prior`);
  if (pri.prior_consultation_id !== null)
    uuid(pri.prior_consultation_id, `${p}/prior/prior_consultation_id`);
  ["prior_counsel", "prior_disposition", "observed_outcome"].forEach((k) => {
    if (pri[k] !== null)
      str(pri[k], MAX_TASK_BYTES, true, `${p}/prior/${k}`);
  });
  checkBytes(cp, MAX_ENVELOPE_BYTES, p);
  return deepFreeze(cp);
}
function valResultFields(o, p) {
  ["recommendation", "rationale"].forEach((k) => str(o[k], MAX_RESULT_BODY_BYTES, true, `${p}/${k}`));
  ["must_fix", "cautions", "assumptions", "success_checks", "unresolved_questions"].forEach((k) => arr(o[k], 32, `${p}/${k}`).forEach((x, i) => str(x, 2048, true, `${p}/${k}/${i}`)));
}
function validateResultV2(r, p = "") {
  const o = asObj(r, ["protocol", "version", "checkpoint", "status", "recommendation", "rationale", "must_fix", "cautions", "assumptions", "success_checks", "unresolved_questions"], p);
  if (o.protocol !== RESULT_PROTOCOL_V2 || o.version !== RESULT_VERSION_V2)
    fail("CONTRACT_VERSION_UNSUPPORTED", o.protocol !== RESULT_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
  if (o.status !== "ADVICE_READY")
    fail("CONTRACT_STATUS_INVALID", `${p}/status`);
  str(o.checkpoint, 128, false, `${p}/checkpoint`);
  valResultFields(o, p);
  checkBytes(r, MAX_RESULT_BODY_BYTES + 512, p);
  return deepFreeze(r);
}
function validateReceiptV2(r, p = "") {
  const o = asObj(r, ["backend", "model", "effort", "controller_version", "adapter_version", "build_identity", "elapsed_ms"], p);
  if (o.controller_version !== CONTROLLER_VERSION_V2)
    fail("CONTRACT_VERSION_UNSUPPORTED", `${p}/controller_version`);
  if (o.backend !== null && !CANDIDATE_BACKENDS.includes(o.backend))
    fail("CONTRACT_VALUE_INVALID", `${p}/backend`);
  ["model", "effort", "adapter_version", "build_identity"].forEach((k) => {
    if (o[k] !== null)
      str(o[k], 256, false, `${p}/${k}`);
  });
  num(o.elapsed_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/elapsed_ms`);
  return deepFreeze(r);
}
function validateSanitizedError(e, p = "") {
  const o = asObj(e, ["code", "category", "action", "message"], p);
  str(o.code, 64, false, `${p}/code`);
  str(o.category, 64, false, `${p}/category`);
  str(o.action, 1024, false, `${p}/action`);
  str(o.message, 1024, true, `${p}/message`);
  return deepFreeze(e);
}
function validateAttemptOutcome(a, p = "") {
  const o = asObj(a, ["attempt_id", "slot", "route", "phase", "model_started", "elapsed_ms", "terminal_classification", "retry_delay_ms", "cleanup_outcome"], p);
  str(o.attempt_id, 128, false, `${p}/attempt_id`);
  if (!ATTEMPT_SLOTS.includes(o.slot))
    fail("CONTRACT_VALUE_INVALID", `${p}/slot`);
  validateRouteTarget(o.route, `${p}/route`);
  if (!ATTEMPT_PHASES.includes(o.phase))
    fail("CONTRACT_VALUE_INVALID", `${p}/phase`);
  if (typeof o.model_started !== "boolean")
    fail("CONTRACT_TYPE_INVALID", `${p}/model_started`);
  num(o.elapsed_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/elapsed_ms`);
  if (!TERMINAL_CLASSIFICATIONS.includes(o.terminal_classification))
    fail("CONTRACT_VALUE_INVALID", `${p}/terminal_classification`);
  if (o.retry_delay_ms !== null)
    num(o.retry_delay_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/retry_delay_ms`);
  if (!CLEANUP_OUTCOMES.includes(o.cleanup_outcome))
    fail("CONTRACT_VALUE_INVALID", `${p}/cleanup_outcome`);
  return deepFreeze(a);
}
function valAttempts(rawList, p) {
  const atts = arr(rawList, MAX_TOTAL_ATTEMPT_SUMMARIES, p), aIds = {};
  let starts = 0;
  return atts.map((raw, i) => {
    const a = validateAttemptOutcome(raw, `${p}/${i}`);
    if (aIds[a.attempt_id])
      fail("CONTRACT_DUPLICATE_IDENTITY", `${p}/${i}/attempt_id`);
    aIds[a.attempt_id] = true;
    if (a.model_started && ++starts > MAX_MODEL_ATTEMPTS)
      fail("CONTRACT_SIZE_EXCEEDED", p);
    return a;
  });
}
function validateHistoryExecutionV1(ex, digestFn, p = "") {
  const o = asObj(ex, ["schema_version", "consultation_id", "task_run_id", "project_id", "checkpoint_digest", "checkpoint", "route", "receipt", "prompt_identity", "build_identity", "attempts", "status", "result", "error", "started_at", "completed_at"], p);
  if (o.schema_version !== HISTORY_VERSION_V1)
    fail("CONTRACT_VERSION_UNSUPPORTED", `${p}/schema_version`);
  uuid(o.consultation_id, `${p}/consultation_id`);
  uuid(o.task_run_id, `${p}/task_run_id`);
  digest(o.project_id, `${p}/project_id`);
  digest(o.checkpoint_digest, `${p}/checkpoint_digest`);
  const cp = validateCheckpointV2(o.checkpoint, `${p}/checkpoint`);
  if (digestFn && digestFn(cp) !== o.checkpoint_digest)
    fail("CONTRACT_DIGEST_MISMATCH", `${p}/checkpoint_digest`);
  if (cp.task_run_id !== o.task_run_id)
    fail("CONTRACT_IDENTITY_MISMATCH", `${p}/checkpoint/task_run_id`);
  const route = validateRouteTarget(o.route, `${p}/route`), buildId = str(o.build_identity, 128, false, `${p}/build_identity`);
  str(o.prompt_identity, 128, false, `${p}/prompt_identity`);
  valAttempts(o.attempts, `${p}/attempts`);
  if (!EXECUTION_STATUSES.includes(o.status))
    fail("CONTRACT_STATUS_INVALID", `${p}/status`);
  num(o.started_at, 1, Number.MAX_SAFE_INTEGER, `${p}/started_at`);
  if (o.status === "started") {
    if (o.receipt !== null || o.result !== null || o.error !== null || o.completed_at !== null)
      fail("CONTRACT_STATUS_INVALID", p);
  } else {
    const rc = validateReceiptV2(o.receipt, `${p}/receipt`);
    if (rc.build_identity !== buildId)
      fail("CONTRACT_IDENTITY_MISMATCH", `${p}/receipt/build_identity`);
    if (rc.backend !== route.backend || rc.model !== route.model || rc.effort !== route.effort)
      fail("CONTRACT_IDENTITY_MISMATCH", `${p}/receipt`);
    num(o.completed_at, o.started_at, Number.MAX_SAFE_INTEGER, `${p}/completed_at`);
    if (o.status === "ADVICE_READY") {
      if (o.result === null || o.error !== null)
        fail("CONTRACT_STATUS_INVALID", p);
      if (validateResultV2(o.result, `${p}/result`).checkpoint !== cp.checkpoint)
        fail("CONTRACT_IDENTITY_MISMATCH", `${p}/result/checkpoint`);
    } else if (o.status === "FAILED") {
      if (o.error === null || o.result !== null)
        fail("CONTRACT_STATUS_INVALID", p);
      validateSanitizedError(o.error, `${p}/error`);
    }
  }
  checkBytes(ex, MAX_EXECUTION_HISTORY_BYTES, p);
  return deepFreeze(ex);
}
function validateHistoryOutcomeV1(out, p = "") {
  const o = asObj(out, ["schema_version", "consultation_id", "task_run_id", "project_id", "disposition", "evidence_revision", "actual_changed_paths", "validation", "outcome", "correction_number", "recorded_at"], p);
  if (o.schema_version !== HISTORY_VERSION_V1)
    fail("CONTRACT_VERSION_UNSUPPORTED", `${p}/schema_version`);
  uuid(o.consultation_id, `${p}/consultation_id`);
  uuid(o.task_run_id, `${p}/task_run_id`);
  digest(o.project_id, `${p}/project_id`);
  const disp = asObj(o.disposition, ["action", "rationale"], `${p}/disposition`);
  if (!["accept", "reject-with-evidence", "need-evidence", "reconcile"].includes(disp.action))
    fail("CONTRACT_VALUE_INVALID", `${p}/disposition/action`);
  str(disp.rationale, 4096, true, `${p}/disposition/rationale`);
  num(o.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`);
  arr(o.actual_changed_paths, 32, `${p}/actual_changed_paths`).forEach((x, i) => safePath(x, `${p}/actual_changed_paths/${i}`));
  validateValidationResult(o.validation, `${p}/validation`);
  if (!OUTCOME_RESULTS.includes(o.outcome))
    fail("CONTRACT_VALUE_INVALID", `${p}/outcome`);
  num(o.correction_number, 1, MAX_CORRECTION_CYCLES, `${p}/correction_number`);
  num(o.recorded_at, 1, Number.MAX_SAFE_INTEGER, `${p}/recorded_at`);
  checkBytes(out, MAX_OUTCOME_HISTORY_BYTES, p);
  return deepFreeze(out);
}

// src/protocol/advisor-metrics.ts
var FILTER_KEYS = { statuses: true, outcome_states: true, outcome_results: true, backends: true, models: true, efforts: true, prompt_identities: true, build_identities: true, started_at_from: true, started_at_to: true };
function normalizeHistoryFilter(raw) {
  const o = isPlainObject(raw) ? raw : {};
  if (isPlainObject(raw)) {
    const rk = Object.keys(raw);
    if (rk.some((k) => !FILTER_KEYS[k]))
      throw new TypeError("Invalid filter keys");
  }
  const strArr = (k) => {
    const v = o[k];
    if (v === null || v === undefined)
      return null;
    if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== "string" || !x))
      throw new TypeError(`Invalid filter ${k}`);
    const seen = {};
    for (const item of v) {
      if (seen[item])
        throw new TypeError(`Duplicate in ${k}`);
      seen[item] = true;
    }
    return Object.freeze([...v]);
  };
  const intVal = (k) => {
    const v = o[k];
    if (v === null || v === undefined)
      return null;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0)
      throw new TypeError(`Invalid filter ${k}`);
    return v;
  };
  const statuses = strArr("statuses");
  if (statuses?.some((s) => !["started", "ADVICE_READY", "FAILED"].includes(s)))
    throw new TypeError("Invalid status filter");
  const outcome_states = strArr("outcome_states");
  if (outcome_states?.some((s) => !["missing", "valid", "invalid"].includes(s)))
    throw new TypeError("Invalid outcome_states filter");
  const outcome_results = strArr("outcome_results");
  if (outcome_results?.some((s) => !["resolved", "unresolved", "regressed", "unknown"].includes(s)))
    throw new TypeError("Invalid outcome_results filter");
  const backends = strArr("backends");
  if (backends?.some((b) => !CANDIDATE_BACKENDS.includes(b)))
    throw new TypeError("Invalid backends filter");
  const from = intVal("started_at_from"), to = intVal("started_at_to");
  if (from !== null && to !== null && from > to)
    throw new RangeError("started_at_from > started_at_to");
  return deepFreeze({ statuses, outcome_states, outcome_results, backends, models: strArr("models"), efforts: strArr("efforts"), prompt_identities: strArr("prompt_identities"), build_identities: strArr("build_identities"), started_at_from: from, started_at_to: to });
}

// src/protocol/advisor-evaluation-primitives.ts
function fail2(c, p = "") {
  throw new AdvisorContractError({ code: c, path: p });
}
function asObj2(v, exp, p) {
  if (v === null || typeof v !== "object" || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) {
    fail2("CONTRACT_TYPE_INVALID", p);
  }
  const obj = v;
  const k = Object.keys(obj);
  if (k.length !== exp.length || k.some((x) => !exp.includes(x)))
    fail2("CONTRACT_KEYS_INVALID", p);
  return obj;
}
var ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
var CTRL_RE2 = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function idStr(v, p) {
  if (typeof v !== "string")
    fail2("CONTRACT_TYPE_INVALID", p);
  if (!ID_RE.test(v))
    fail2("CONTRACT_VALUE_INVALID", p);
  return v;
}
function str2(v, max, p, nullable = false) {
  if (nullable && v === null)
    return null;
  if (typeof v !== "string")
    fail2("CONTRACT_TYPE_INVALID", p);
  if (utf8Bytes(v) > max)
    fail2("CONTRACT_SIZE_EXCEEDED", p);
  if (!v || v.trim() !== v || CTRL_RE2.test(v))
    fail2("CONTRACT_VALUE_INVALID", p);
  return v;
}
function num2(v, min, max, p) {
  if (typeof v !== "number" || !Number.isSafeInteger(v))
    fail2("CONTRACT_TYPE_INVALID", p);
  if (v < min || v > max)
    fail2("CONTRACT_VALUE_INVALID", p);
  return v;
}
function arr2(v, min, max, p) {
  if (!Array.isArray(v))
    fail2("CONTRACT_TYPE_INVALID", p);
  if (v.length < min || v.length > max)
    fail2(v.length > max ? "CONTRACT_SIZE_EXCEEDED" : "CONTRACT_VALUE_INVALID", p);
  return v;
}
function valRubric(r, p) {
  const o = asObj2(r, ["version", "dimensions", "pass_threshold"], p);
  if (o.version !== 1)
    fail2("CONTRACT_VERSION_UNSUPPORTED", `${p}/version`);
  const dims = arr2(o.dimensions, 1, 16, `${p}/dimensions`).map((d, i) => {
    const do_ = asObj2(d, ["id", "description", "scale"], `${p}/dimensions/${i}`);
    const id = idStr(do_.id, `${p}/dimensions/${i}/id`), desc = str2(do_.description, 4096, `${p}/dimensions/${i}/description`);
    const sc = arr2(do_.scale, 2, 2, `${p}/dimensions/${i}/scale`);
    if (sc[0] !== EVALUATION_RUBRIC_SCALE[0] || sc[1] !== EVALUATION_RUBRIC_SCALE[1])
      fail2("CONTRACT_VALUE_INVALID", `${p}/dimensions/${i}/scale`);
    return { id, description: desc, scale: EVALUATION_RUBRIC_SCALE };
  });
  if (new Set(dims.map((d) => d.id)).size !== dims.length)
    fail2("CONTRACT_DUPLICATE_IDENTITY", `${p}/dimensions`);
  return { version: 1, dimensions: dims, pass_threshold: num2(o.pass_threshold, 1, 5, `${p}/pass_threshold`) };
}
function valCandidate(c, p) {
  const o = asObj2(c, ["candidate_id", "label", "route", "prompt_identity", "build_identity"], p);
  return {
    candidate_id: idStr(o.candidate_id, `${p}/candidate_id`),
    label: str2(o.label, 256, `${p}/label`, true),
    route: validateRouteTarget(o.route, `${p}/route`),
    prompt_identity: str2(o.prompt_identity, 128, `${p}/prompt_identity`, true),
    build_identity: str2(o.build_identity, 128, `${p}/build_identity`, true)
  };
}
function valInput(inp, p) {
  const o = asObj2(inp, ["context", "executor_proposal", "evidence"], p);
  const ctx = asObj2(o.context, ["goal", "non_goals", "authorized_paths"], `${p}/context`);
  const prop = asObj2(o.executor_proposal, ["hypothesis", "intended_action"], `${p}/executor_proposal`);
  const ev = asObj2(o.evidence, ["observed_failure", "files", "validation_command"], `${p}/evidence`);
  return {
    context: {
      goal: str2(ctx.goal, 4096, `${p}/context/goal`),
      non_goals: arr2(ctx.non_goals, 0, 32, `${p}/context/non_goals`).map((s, i) => str2(s, 2048, `${p}/context/non_goals/${i}`)),
      authorized_paths: arr2(ctx.authorized_paths, 0, 32, `${p}/context/authorized_paths`).map((s, i) => str2(s, 512, `${p}/context/authorized_paths/${i}`))
    },
    executor_proposal: {
      hypothesis: str2(prop.hypothesis, 4096, `${p}/executor_proposal/hypothesis`),
      intended_action: str2(prop.intended_action, 4096, `${p}/executor_proposal/intended_action`)
    },
    evidence: {
      observed_failure: str2(ev.observed_failure, 4096, `${p}/evidence/observed_failure`),
      files: arr2(ev.files, 0, 32, `${p}/evidence/files`).map((s, i) => str2(s, 512, `${p}/evidence/files/${i}`)),
      validation_command: str2(ev.validation_command, 512, `${p}/evidence/validation_command`)
    }
  };
}
function valResult(r, p) {
  const o = asObj2(r, ["recommendation", "rationale", "must_fix", "cautions", "assumptions", "success_checks", "unresolved_questions"], p);
  const list = (k) => arr2(o[k], 0, 32, `${p}/${k}`).map((x, i) => str2(x, 2048, `${p}/${k}/${i}`));
  return {
    recommendation: str2(o.recommendation, 4096, `${p}/recommendation`),
    rationale: str2(o.rationale, 4096, `${p}/rationale`),
    must_fix: list("must_fix"),
    cautions: list("cautions"),
    assumptions: list("assumptions"),
    success_checks: list("success_checks"),
    unresolved_questions: list("unresolved_questions")
  };
}
function valResponse(res, p) {
  const o = asObj2(res, ["status", "result", "error", "captured_at"], p);
  if (typeof o.status !== "string" || !EVALUATION_RESPONSE_STATUSES.includes(o.status)) {
    fail2("CONTRACT_STATUS_INVALID", `${p}/status`);
  }
  const status = o.status;
  if (status === "ADVICE_READY") {
    if (o.error !== null)
      fail2("CONTRACT_VALUE_INVALID", `${p}/error`);
    return { status: "ADVICE_READY", result: valResult(o.result, `${p}/result`), error: null, captured_at: num2(o.captured_at, 1, Number.MAX_SAFE_INTEGER, `${p}/captured_at`) };
  }
  if (status === "FAILED") {
    if (o.result !== null)
      fail2("CONTRACT_VALUE_INVALID", `${p}/result`);
    return { status: "FAILED", result: null, error: validateSanitizedError(o.error, `${p}/error`), captured_at: num2(o.captured_at, 1, Number.MAX_SAFE_INTEGER, `${p}/captured_at`) };
  }
  if (o.result !== null || o.error !== null || o.captured_at !== null)
    fail2("CONTRACT_VALUE_INVALID", p);
  return { status: "MISSING", result: null, error: null, captured_at: null };
}
function valScore(sc, rubric, p) {
  if (sc === null)
    return null;
  const o = asObj2(sc, ["provenance", "judge_id", "judge_version", "scored_at", "dimensions", "average_score", "passed", "issues"], p);
  if (typeof o.provenance !== "string" || !EVALUATION_PROVENANCES.includes(o.provenance)) {
    fail2("CONTRACT_VALUE_INVALID", `${p}/provenance`);
  }
  const prov = o.provenance;
  const jid = idStr(o.judge_id, `${p}/judge_id`), jver = str2(o.judge_version, 64, `${p}/judge_version`);
  const sat = num2(o.scored_at, 1, Number.MAX_SAFE_INTEGER, `${p}/scored_at`);
  const dimsRaw = arr2(o.dimensions, rubric.dimensions.length, rubric.dimensions.length, `${p}/dimensions`);
  const dims = dimsRaw.map((d, i) => {
    const do_ = asObj2(d, ["dimension_id", "score"], `${p}/dimensions/${i}`);
    const dimId = idStr(do_.dimension_id, `${p}/dimensions/${i}/dimension_id`);
    if (!rubric.dimensions.some((rd) => rd.id === dimId))
      fail2("CONTRACT_VALUE_INVALID", `${p}/dimensions/${i}/dimension_id`);
    const scoreVal = do_.score === null ? null : num2(do_.score, 1, 5, `${p}/dimensions/${i}/score`);
    return { dimension_id: dimId, score: scoreVal };
  });
  if (new Set(dims.map((d) => d.dimension_id)).size !== rubric.dimensions.length)
    fail2("CONTRACT_DUPLICATE_IDENTITY", `${p}/dimensions`);
  const issues = arr2(o.issues, 0, 32, `${p}/issues`).map((s, i) => str2(s, 4096, `${p}/issues/${i}`));
  const hasNull = dims.some((d) => d.score === null);
  if (hasNull) {
    if (o.average_score !== null || o.passed !== null)
      fail2("CONTRACT_VALUE_INVALID", p);
    return { provenance: prov, judge_id: jid, judge_version: jver, scored_at: sat, dimensions: dims, average_score: null, passed: null, issues };
  }
  const sum = dims.reduce((acc, d) => acc + d.score, 0);
  const expectedAvg = Math.round(sum / dims.length * 100) / 100;
  if (typeof o.average_score !== "number" || Math.abs(o.average_score - expectedAvg) > 0.001)
    fail2("CONTRACT_VALUE_INVALID", `${p}/average_score`);
  const expectedPassed = expectedAvg >= rubric.pass_threshold;
  if (o.passed !== expectedPassed)
    fail2("CONTRACT_VALUE_INVALID", `${p}/passed`);
  return { provenance: prov, judge_id: jid, judge_version: jver, scored_at: sat, dimensions: dims, average_score: expectedAvg, passed: expectedPassed, issues };
}

// src/protocol/advisor-evaluation-validation.ts
var UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SHA256_RE2 = /^[0-9a-f]{64}$/;
function valObservations(obs, candidates, rubric, p) {
  const oArr = arr2(obs, candidates.length, candidates.length, p);
  const candSet = new Set(candidates.map((c) => c.candidate_id));
  const seen = new Set;
  const parsed = oArr.map((item, i) => {
    const o = asObj2(item, ["candidate_id", "response", "score"], `${p}/${i}`);
    const cid = idStr(o.candidate_id, `${p}/${i}/candidate_id`);
    if (!candSet.has(cid))
      fail2("CONTRACT_VALUE_INVALID", `${p}/${i}/candidate_id`);
    if (seen.has(cid))
      fail2("CONTRACT_DUPLICATE_IDENTITY", `${p}/${i}/candidate_id`);
    seen.add(cid);
    return {
      candidate_id: cid,
      response: valResponse(o.response, `${p}/${i}/response`),
      score: valScore(o.score, rubric, `${p}/${i}/score`)
    };
  });
  if (seen.size !== candidates.length)
    fail2("CONTRACT_VALUE_INVALID", p);
  return parsed;
}
function validateEvaluationDocument(doc, options) {
  const o = asObj2(doc, ["protocol", "version", "evaluation_id", "run_id", "created_at", "rubric", "rubric_digest", "candidates", "cases"], "");
  if (o.protocol !== EVALUATION_PROTOCOL_V1)
    fail2("CONTRACT_VERSION_UNSUPPORTED", "/protocol");
  if (o.version !== EVALUATION_VERSION_V1)
    fail2("CONTRACT_VERSION_UNSUPPORTED", "/version");
  const evalId = idStr(o.evaluation_id, "/evaluation_id");
  if (typeof o.run_id !== "string" || !UUID_RE2.test(o.run_id))
    fail2("CONTRACT_VALUE_INVALID", "/run_id");
  const cat = num2(o.created_at, 1, Number.MAX_SAFE_INTEGER, "/created_at");
  const rubric = valRubric(o.rubric, "/rubric");
  if (typeof o.rubric_digest !== "string" || !SHA256_RE2.test(o.rubric_digest))
    fail2("CONTRACT_VALUE_INVALID", "/rubric_digest");
  if (options?.digestFn) {
    const expR = options.digestFn(canonicalJson(rubric));
    if (expR !== o.rubric_digest)
      fail2("CONTRACT_DIGEST_MISMATCH", "/rubric_digest");
  }
  const cands = arr2(o.candidates, 2, 16, "/candidates").map((c, i) => valCandidate(c, `/candidates/${i}`));
  if (new Set(cands.map((c) => c.candidate_id)).size !== cands.length)
    fail2("CONTRACT_DUPLICATE_IDENTITY", "/candidates");
  const cases = arr2(o.cases, 1, 256, "/cases").map((cs, i) => {
    const co = asObj2(cs, ["case_id", "name", "category", "input", "input_digest", "observations"], `/cases/${i}`);
    const cid = idStr(co.case_id, `/cases/${i}/case_id`), name = str2(co.name, 256, `/cases/${i}/name`), catg = str2(co.category, 256, `/cases/${i}/category`);
    const inp = valInput(co.input, `/cases/${i}/input`);
    if (typeof co.input_digest !== "string" || !SHA256_RE2.test(co.input_digest))
      fail2("CONTRACT_VALUE_INVALID", `/cases/${i}/input_digest`);
    if (options?.digestFn) {
      const expInp = options.digestFn(canonicalJson(inp));
      if (expInp !== co.input_digest)
        fail2("CONTRACT_DIGEST_MISMATCH", `/cases/${i}/input_digest`);
    }
    const obs = valObservations(co.observations, cands, rubric, `/cases/${i}/observations`);
    return { case_id: cid, name, category: catg, input: inp, input_digest: co.input_digest, observations: obs };
  });
  if (new Set(cases.map((c) => c.case_id)).size !== cases.length)
    fail2("CONTRACT_DUPLICATE_IDENTITY", "/cases");
  return deepFreeze({
    protocol: EVALUATION_PROTOCOL_V1,
    version: EVALUATION_VERSION_V1,
    evaluation_id: evalId,
    run_id: o.run_id,
    created_at: cat,
    rubric,
    rubric_digest: o.rubric_digest,
    candidates: cands,
    cases
  });
}

// src/protocol/advisor-evaluation.ts
var EVALUATION_PROTOCOL_V1 = "evcrate-advisor-counsel-evaluation";
var EVALUATION_VERSION_V1 = 1;
var MAX_EVALUATION_FILE_BYTES = 8 * 1024 * 1024;
var EVALUATION_RUBRIC_SCALE = Object.freeze([1, 5]);
var EVALUATION_RESPONSE_STATUSES = Object.freeze(["ADVICE_READY", "FAILED", "MISSING"]);
var EVALUATION_PROVENANCES = Object.freeze(["human", "automated"]);

// src/protocol/advisor-plugin-data-api.ts
var DATA_API_PROTOCOL_V1 = "evcrate-advisor-data";
var DATA_API_VERSION_V1 = 1;
var ADVISOR_DATA_METHODS = Object.freeze([
  "history.refresh",
  "history.summary",
  "history.page",
  "history.detail",
  "policy.readCurrent",
  "evaluations.list",
  "evaluations.read",
  "evaluations.compare"
]);
var MAX_OPAQUE_ID_BYTES = 128;
var MAX_CURSOR_BYTES = 256;
var MAX_PAGE_LIMIT = 500;
var DEFAULT_PAGE_LIMIT = 100;
var MAX_EVALUATION_PAGE_LIMIT = 100;
var MAX_PAGE_RESULT_BYTES = 1024 * 1024;
var MAX_FRAME_PAYLOAD_BYTES = 16 * 1024 * 1024;
var MAX_CONTROL_PAYLOAD_BYTES = 64 * 1024;
var MAX_EVALUATION_DOCUMENT_BYTES = 8 * 1024 * 1024;
var MAX_COMPARE_ITEMS = 32;
var UUID_RE3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SHA256_RE3 = /^[0-9a-f]{64}$/;
var PLUGIN_ERROR_CODES = Object.freeze([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INCOMPATIBLE",
  "RUNNER_UNAVAILABLE",
  "RUNTIME_UNAVAILABLE",
  "SOURCE_NOT_CONFIGURED",
  "SOURCE_MISSING",
  "PERMISSION_DENIED",
  "INVALID_INPUT",
  "OVERLOADED",
  "DEADLINE_EXCEEDED",
  "CANCELLED",
  "WORKER_FAILED",
  "CONTEXT_REVOKED",
  "SNAPSHOT_EXPIRED",
  "DETAIL_CHANGED",
  "DETAIL_MISSING"
]);

class PluginDataApiError extends Error {
  code;
  path;
  constructor(code, path = "", message) {
    super(message ?? `Plugin Data API validation failed: ${code} at '${path}'`);
    this.name = "PluginDataApiError";
    this.code = code;
    this.path = path;
  }
}
function fail3(code, path, msg) {
  throw new PluginDataApiError(code, path, msg);
}
function asObj3(v, path) {
  if (!isPlainObject(v)) {
    fail3("INVALID_INPUT", path, `Expected object at ${path}`);
  }
  return v;
}
function checkNoUnknownKeys(obj, allowed, path) {
  const allowedMap = {};
  for (let i = 0;i < allowed.length; i++)
    allowedMap[allowed[i]] = true;
  for (const key of Object.keys(obj)) {
    if (!allowedMap[key]) {
      fail3("INVALID_INPUT", `${path}/${key}`, `Unknown property '${key}' at ${path}`);
    }
  }
}
function checkOpaqueId(v, path, min = 1, max = MAX_OPAQUE_ID_BYTES) {
  if (typeof v !== "string") {
    fail3("INVALID_INPUT", path, `Expected string for opaque ID at ${path}`);
  }
  const bytes = Buffer.byteLength(v, "utf8");
  if (bytes < min || bytes > max) {
    fail3("INVALID_INPUT", path, `Opaque ID byte length must be between ${min} and ${max} at ${path}`);
  }
  return v;
}
function checkCursor(v, path) {
  if (v === null)
    return null;
  if (typeof v !== "string") {
    fail3("INVALID_INPUT", path, `Expected string or null for cursor at ${path}`);
  }
  const bytes = Buffer.byteLength(v, "utf8");
  if (bytes < 1 || bytes > MAX_CURSOR_BYTES) {
    fail3("INVALID_INPUT", path, `Cursor byte length must be between 1 and ${MAX_CURSOR_BYTES} at ${path}`);
  }
  return v;
}
function checkTimestamp(v, path) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) {
    fail3("INVALID_INPUT", path, `Expected positive safe-integer epoch timestamp at ${path}`);
  }
  return v;
}
function checkSafeInteger(v, min, max, path) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) {
    fail3("INVALID_INPUT", path, `Expected safe integer between ${min} and ${max} at ${path}`);
  }
  return v;
}
function checkUuid(v, path) {
  if (typeof v !== "string" || !UUID_RE3.test(v)) {
    fail3("INVALID_INPUT", path, `Expected valid UUID at ${path}`);
  }
  return v;
}
function checkSha256(v, path) {
  if (typeof v !== "string" || !SHA256_RE3.test(v)) {
    fail3("INVALID_INPUT", path, `Expected valid lowercase 64-hex SHA-256 digest at ${path}`);
  }
  return v;
}
var HISTORY_REFRESH_STATES = Object.freeze(["fresh", "stale", "unavailable"]);
var STALE_REASONS = Object.freeze(["incomplete", "cancelled", "deadline"]);
function validateHistoryRefreshParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, [], path);
  return Object.freeze({});
}
function validateHistoryRefreshResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["state", "snapshot_id", "observed_at", "scan", "stale_reason"], path);
  if (typeof obj.state !== "string" || !HISTORY_REFRESH_STATES.includes(obj.state)) {
    fail3("INVALID_INPUT", `${path}/state`, `Invalid state: ${String(obj.state)}`);
  }
  const state = obj.state;
  let snapshotId = null;
  if (state === "unavailable") {
    if (obj.snapshot_id !== null) {
      fail3("INVALID_INPUT", `${path}/snapshot_id`, "snapshot_id must be null when state is unavailable");
    }
  } else {
    snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  }
  const observedAt = checkTimestamp(obj.observed_at, `${path}/observed_at`);
  const scanObj = asObj3(obj.scan, `${path}/scan`);
  checkNoUnknownKeys(scanObj, [
    "status",
    "projects_discovered",
    "tasks_discovered",
    "consultations_discovered",
    "accepted_records",
    "invalid_records",
    "bytes_discovered",
    "bytes_read",
    "diagnostics",
    "suppressed_diagnostics",
    "limit_hit"
  ], `${path}/scan`);
  let staleReason = null;
  if (state === "stale") {
    if (typeof obj.stale_reason !== "string" || !STALE_REASONS.includes(obj.stale_reason)) {
      fail3("INVALID_INPUT", `${path}/stale_reason`, `stale_reason required when state is stale: ${String(obj.stale_reason)}`);
    }
    staleReason = obj.stale_reason;
  } else {
    if (obj.stale_reason !== null) {
      fail3("INVALID_INPUT", `${path}/stale_reason`, "stale_reason must be null when state is not stale");
    }
  }
  return Object.freeze({
    state,
    snapshot_id: snapshotId,
    observed_at: observedAt,
    scan: obj.scan,
    stale_reason: staleReason
  });
}
function validateHistorySummaryParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["snapshot_id", "query"], path);
  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const queryObj = asObj3(obj.query, `${path}/query`);
  checkNoUnknownKeys(queryObj, ["task_run_id", "filters"], `${path}/query`);
  let taskRunId = null;
  if (queryObj.task_run_id !== null) {
    taskRunId = checkUuid(queryObj.task_run_id, `${path}/query/task_run_id`);
  }
  const filters = normalizeHistoryFilter(queryObj.filters);
  return Object.freeze({
    snapshot_id: snapshotId,
    query: Object.freeze({
      task_run_id: taskRunId,
      filters
    })
  });
}
function validateHistorySummaryResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["state", "snapshot_id", "metrics"], path);
  if (obj.state !== "fresh" && obj.state !== "stale") {
    fail3("INVALID_INPUT", `${path}/state`, `state must be fresh or stale: ${String(obj.state)}`);
  }
  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const metricsObj = asObj3(obj.metrics, `${path}/metrics`);
  if (metricsObj.metric_definition_version !== 1) {
    fail3("INVALID_INPUT", `${path}/metrics/metric_definition_version`, "metric_definition_version must be 1");
  }
  return Object.freeze({
    state: obj.state,
    snapshot_id: snapshotId,
    metrics: obj.metrics
  });
}
function validateHistoryRowV1(raw, path = "row") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, [
    "record_ref",
    "project_id",
    "task_run_id",
    "consultation_id",
    "status",
    "route",
    "checkpoint_digest",
    "prompt_identity",
    "build_identity",
    "started_at",
    "completed_at",
    "receipt_elapsed_ms",
    "outcome_state",
    "outcome_result"
  ], path);
  const recordRef = checkOpaqueId(obj.record_ref, `${path}/record_ref`);
  const projectId = checkSha256(obj.project_id, `${path}/project_id`);
  const taskRunId = checkUuid(obj.task_run_id, `${path}/task_run_id`);
  const consultationId = checkUuid(obj.consultation_id, `${path}/consultation_id`);
  if (typeof obj.status !== "string" || !EXECUTION_STATUSES.includes(obj.status)) {
    fail3("INVALID_INPUT", `${path}/status`, `Invalid execution status: ${String(obj.status)}`);
  }
  const status = obj.status;
  const route = validateRouteTarget(obj.route, `${path}/route`);
  const checkpointDigest = checkSha256(obj.checkpoint_digest, `${path}/checkpoint_digest`);
  const promptIdentity = checkOpaqueId(obj.prompt_identity, `${path}/prompt_identity`);
  const buildIdentity = checkOpaqueId(obj.build_identity, `${path}/build_identity`);
  const startedAt = checkTimestamp(obj.started_at, `${path}/started_at`);
  let completedAt = null;
  if (obj.completed_at !== null) {
    completedAt = checkTimestamp(obj.completed_at, `${path}/completed_at`);
    if (completedAt < startedAt) {
      fail3("INVALID_INPUT", `${path}/completed_at`, "completed_at must be >= started_at");
    }
  }
  let receiptElapsedMs = null;
  if (obj.receipt_elapsed_ms !== null) {
    receiptElapsedMs = checkSafeInteger(obj.receipt_elapsed_ms, 0, 86400000, `${path}/receipt_elapsed_ms`);
  }
  if (typeof obj.outcome_state !== "string" || !["missing", "valid", "invalid"].includes(obj.outcome_state)) {
    fail3("INVALID_INPUT", `${path}/outcome_state`, `Invalid outcome_state: ${String(obj.outcome_state)}`);
  }
  const outcomeState = obj.outcome_state;
  let outcomeResult = null;
  if (obj.outcome_result !== null) {
    if (typeof obj.outcome_result !== "string" || !OUTCOME_RESULTS.includes(obj.outcome_result)) {
      fail3("INVALID_INPUT", `${path}/outcome_result`, `Invalid outcome_result: ${String(obj.outcome_result)}`);
    }
    outcomeResult = obj.outcome_result;
  }
  return Object.freeze({
    record_ref: recordRef,
    project_id: projectId,
    task_run_id: taskRunId,
    consultation_id: consultationId,
    status,
    route,
    checkpoint_digest: checkpointDigest,
    prompt_identity: promptIdentity,
    build_identity: buildIdentity,
    started_at: startedAt,
    completed_at: completedAt,
    receipt_elapsed_ms: receiptElapsedMs,
    outcome_state: outcomeState,
    outcome_result: outcomeResult
  });
}
function validateHistoryPageParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["snapshot_id", "query", "sort", "cursor", "limit"], path);
  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const queryObj = asObj3(obj.query, `${path}/query`);
  checkNoUnknownKeys(queryObj, ["task_run_id", "filters"], `${path}/query`);
  let taskRunId = null;
  if (queryObj.task_run_id !== null) {
    taskRunId = checkUuid(queryObj.task_run_id, `${path}/query/task_run_id`);
  }
  const filters = normalizeHistoryFilter(queryObj.filters);
  if (obj.sort !== "started_at_desc") {
    fail3("INVALID_INPUT", `${path}/sort`, "Sort must be exact literal 'started_at_desc'");
  }
  const cursor = checkCursor(obj.cursor, `${path}/cursor`);
  const limit = checkSafeInteger(obj.limit, 1, MAX_PAGE_LIMIT, `${path}/limit`);
  return Object.freeze({
    snapshot_id: snapshotId,
    query: Object.freeze({
      task_run_id: taskRunId,
      filters
    }),
    sort: "started_at_desc",
    cursor,
    limit
  });
}
function validateHistoryPageResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["state", "snapshot_id", "entries", "next_cursor", "returned_bytes"], path);
  if (obj.state !== "fresh" && obj.state !== "stale") {
    fail3("INVALID_INPUT", `${path}/state`, `state must be fresh or stale: ${String(obj.state)}`);
  }
  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  if (!Array.isArray(obj.entries)) {
    fail3("INVALID_INPUT", `${path}/entries`, "entries must be an array");
  }
  if (obj.entries.length > MAX_PAGE_LIMIT) {
    fail3("INVALID_INPUT", `${path}/entries`, `entries array length exceeds maximum ${MAX_PAGE_LIMIT}`);
  }
  const entries = Object.freeze(obj.entries.map((entry, idx) => validateHistoryRowV1(entry, `${path}/entries/${idx}`)));
  const nextCursor = checkCursor(obj.next_cursor, `${path}/next_cursor`);
  const returnedBytes = checkSafeInteger(obj.returned_bytes, 0, MAX_PAGE_RESULT_BYTES, `${path}/returned_bytes`);
  return Object.freeze({
    state: obj.state,
    snapshot_id: snapshotId,
    entries,
    next_cursor: nextCursor,
    returned_bytes: returnedBytes
  });
}
function validateHistoryDetailParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["snapshot_id", "record_ref"], path);
  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const recordRef = checkOpaqueId(obj.record_ref, `${path}/record_ref`);
  return Object.freeze({
    snapshot_id: snapshotId,
    record_ref: recordRef
  });
}
function validateHistoryDetailResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  if (typeof obj.status !== "string" || !["ready", "changed", "missing"].includes(obj.status)) {
    fail3("INVALID_INPUT", `${path}/status`, `Invalid detail status: ${String(obj.status)}`);
  }
  const snapshotId = checkOpaqueId(obj.snapshot_id, `${path}/snapshot_id`);
  const recordRef = checkOpaqueId(obj.record_ref, `${path}/record_ref`);
  if (obj.status === "ready") {
    checkNoUnknownKeys(obj, ["status", "snapshot_id", "record_ref", "detail_revision", "execution", "outcome"], path);
    const detailRevision = checkOpaqueId(obj.detail_revision, `${path}/detail_revision`);
    if (!obj.execution) {
      fail3("INVALID_INPUT", `${path}/execution`, "execution required when status is ready");
    }
    let execution;
    try {
      execution = validateHistoryExecutionV1(obj.execution, undefined, `${path}/execution`);
    } catch (err) {
      fail3("INVALID_INPUT", `${path}/execution`, String(err));
    }
    let outcome = null;
    if (obj.outcome !== null && obj.outcome !== undefined) {
      try {
        outcome = validateHistoryOutcomeV1(obj.outcome, `${path}/outcome`);
      } catch (err) {
        fail3("INVALID_INPUT", `${path}/outcome`, String(err));
      }
    } else if (obj.outcome === undefined) {
      fail3("INVALID_INPUT", `${path}/outcome`, "outcome property must be present (or null) when status is ready");
    }
    return Object.freeze({
      status: "ready",
      snapshot_id: snapshotId,
      record_ref: recordRef,
      detail_revision: detailRevision,
      execution,
      outcome
    });
  }
  checkNoUnknownKeys(obj, ["status", "snapshot_id", "record_ref", "observed_revision"], path);
  let observedRevision = null;
  if (obj.observed_revision !== null) {
    observedRevision = checkOpaqueId(obj.observed_revision, `${path}/observed_revision`);
  }
  return Object.freeze({
    status: obj.status,
    snapshot_id: snapshotId,
    record_ref: recordRef,
    observed_revision: observedRevision
  });
}
var POLICY_STATUSES = Object.freeze([
  "ready",
  "migration_required",
  "unsupported",
  "invalid",
  "not_configured"
]);
function validatePolicyReadCurrentParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, [], path);
  return Object.freeze({});
}
function validatePolicyReadCurrentResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["status", "scope", "temporal", "observed_at", "revision", "policy", "issue_code"], path);
  if (typeof obj.status !== "string" || !POLICY_STATUSES.includes(obj.status)) {
    fail3("INVALID_INPUT", `${path}/status`, `Invalid policy status: ${String(obj.status)}`);
  }
  const status = obj.status;
  if (obj.scope !== "account") {
    fail3("INVALID_INPUT", `${path}/scope`, "scope must be literal 'account'");
  }
  if (obj.temporal !== "current") {
    fail3("INVALID_INPUT", `${path}/temporal`, "temporal must be literal 'current'");
  }
  const observedAt = checkTimestamp(obj.observed_at, `${path}/observed_at`);
  const revision = checkOpaqueId(obj.revision, `${path}/revision`);
  let policy = null;
  let issueCode = null;
  if (status === "ready") {
    if (!obj.policy) {
      fail3("INVALID_INPUT", `${path}/policy`, "policy document required when status is ready");
    }
    try {
      policy = validatePolicyV2(obj.policy, `${path}/policy`);
    } catch (err) {
      fail3("INVALID_INPUT", `${path}/policy`, String(err));
    }
    if (obj.issue_code !== undefined && obj.issue_code !== null) {
      issueCode = checkOpaqueId(obj.issue_code, `${path}/issue_code`);
    }
  }
  return Object.freeze({
    status,
    scope: "account",
    temporal: "current",
    observed_at: observedAt,
    revision,
    policy: policy ?? (obj.policy === null ? null : undefined),
    issue_code: issueCode
  });
}
function validateEvaluationDescriptorV1(raw, path = "descriptor") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, [
    "evaluation_ref",
    "source_revision",
    "source_digest",
    "evaluation_id",
    "run_id",
    "created_at",
    "candidate_count",
    "case_count",
    "observation_count"
  ], path);
  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  const sourceRevision = checkOpaqueId(obj.source_revision, `${path}/source_revision`);
  const sourceDigest = checkSha256(obj.source_digest, `${path}/source_digest`);
  const evaluationId = checkOpaqueId(obj.evaluation_id, `${path}/evaluation_id`);
  const runId = checkOpaqueId(obj.run_id, `${path}/run_id`);
  const createdAt = checkTimestamp(obj.created_at, `${path}/created_at`);
  const candidateCount = checkSafeInteger(obj.candidate_count, 0, 1000, `${path}/candidate_count`);
  const caseCount = checkSafeInteger(obj.case_count, 0, 1e4, `${path}/case_count`);
  const observationCount = checkSafeInteger(obj.observation_count, 0, 1e5, `${path}/observation_count`);
  return Object.freeze({
    evaluation_ref: evaluationRef,
    source_revision: sourceRevision,
    source_digest: sourceDigest,
    evaluation_id: evaluationId,
    run_id: runId,
    created_at: createdAt,
    candidate_count: candidateCount,
    case_count: caseCount,
    observation_count: observationCount
  });
}
function validateEvaluationsListParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["cursor", "limit"], path);
  const cursor = checkCursor(obj.cursor, `${path}/cursor`);
  const limit = checkSafeInteger(obj.limit, 1, MAX_EVALUATION_PAGE_LIMIT, `${path}/limit`);
  return Object.freeze({
    cursor,
    limit
  });
}
function validateEvaluationsListResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["status", "observed_at", "binding_revision", "items", "next_cursor"], path);
  if (obj.status !== "ready" && obj.status !== "not_configured") {
    fail3("INVALID_INPUT", `${path}/status`, `status must be ready or not_configured: ${String(obj.status)}`);
  }
  const observedAt = checkTimestamp(obj.observed_at, `${path}/observed_at`);
  const bindingRevision = checkOpaqueId(obj.binding_revision, `${path}/binding_revision`);
  if (!Array.isArray(obj.items)) {
    fail3("INVALID_INPUT", `${path}/items`, "items must be an array");
  }
  if (obj.status === "not_configured" && obj.items.length !== 0) {
    fail3("INVALID_INPUT", `${path}/items`, "items must be empty when status is not_configured");
  }
  const items = Object.freeze(obj.items.map((item, idx) => validateEvaluationDescriptorV1(item, `${path}/items/${idx}`)));
  const nextCursor = checkCursor(obj.next_cursor, `${path}/next_cursor`);
  return Object.freeze({
    status: obj.status,
    observed_at: observedAt,
    binding_revision: bindingRevision,
    items,
    next_cursor: nextCursor
  });
}
function validateEvaluationsReadParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["evaluation_ref", "expected_revision"], path);
  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  const expectedRevision = checkOpaqueId(obj.expected_revision, `${path}/expected_revision`);
  return Object.freeze({
    evaluation_ref: evaluationRef,
    expected_revision: expectedRevision
  });
}
function validateEvaluationsReadResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  if (typeof obj.status !== "string" || !["ready", "changed", "missing"].includes(obj.status)) {
    fail3("INVALID_INPUT", `${path}/status`, `Invalid evaluations read status: ${String(obj.status)}`);
  }
  if (obj.status === "ready") {
    checkNoUnknownKeys(obj, ["status", "descriptor", "document"], path);
    const descriptor = validateEvaluationDescriptorV1(obj.descriptor, `${path}/descriptor`);
    if (!obj.document) {
      fail3("INVALID_INPUT", `${path}/document`, "document required when status is ready");
    }
    let document;
    try {
      document = validateEvaluationDocument(obj.document);
    } catch (err) {
      fail3("INVALID_INPUT", `${path}/document`, String(err));
    }
    return Object.freeze({
      status: "ready",
      descriptor,
      document
    });
  }
  checkNoUnknownKeys(obj, ["status", "evaluation_ref", "observed_revision"], path);
  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  let observedRevision = null;
  if (obj.observed_revision !== null) {
    observedRevision = checkOpaqueId(obj.observed_revision, `${path}/observed_revision`);
  }
  return Object.freeze({
    status: obj.status,
    evaluation_ref: evaluationRef,
    observed_revision: observedRevision
  });
}
function validateEvaluationsCompareParams(raw, path = "params") {
  const obj = asObj3(raw, path);
  checkNoUnknownKeys(obj, ["items", "cursor", "limit"], path);
  if (!Array.isArray(obj.items)) {
    fail3("INVALID_INPUT", `${path}/items`, "items must be an array");
  }
  if (obj.items.length < 1 || obj.items.length > MAX_COMPARE_ITEMS) {
    fail3("INVALID_INPUT", `${path}/items`, `items count must be between 1 and ${MAX_COMPARE_ITEMS}`);
  }
  const items = Object.freeze(obj.items.map((item, idx) => {
    const itemObj = asObj3(item, `${path}/items/${idx}`);
    checkNoUnknownKeys(itemObj, ["evaluation_ref", "expected_revision"], `${path}/items/${idx}`);
    return Object.freeze({
      evaluation_ref: checkOpaqueId(itemObj.evaluation_ref, `${path}/items/${idx}/evaluation_ref`),
      expected_revision: checkOpaqueId(itemObj.expected_revision, `${path}/items/${idx}/expected_revision`)
    });
  }));
  const cursor = checkCursor(obj.cursor, `${path}/cursor`);
  const limit = checkSafeInteger(obj.limit, 1, MAX_EVALUATION_PAGE_LIMIT, `${path}/limit`);
  return Object.freeze({
    items,
    cursor,
    limit
  });
}
function validateEvaluationsCompareResult(raw, path = "result") {
  const obj = asObj3(raw, path);
  if (typeof obj.status !== "string" || !["ready", "changed", "missing"].includes(obj.status)) {
    fail3("INVALID_INPUT", `${path}/status`, `Invalid compare status: ${String(obj.status)}`);
  }
  if (obj.status === "ready") {
    checkNoUnknownKeys(obj, ["status", "source_revisions", "groups", "next_cursor", "returned_bytes"], path);
    if (!Array.isArray(obj.source_revisions)) {
      fail3("INVALID_INPUT", `${path}/source_revisions`, "source_revisions must be an array");
    }
    const sourceRevisions = Object.freeze(obj.source_revisions.map((rev, idx) => {
      const revObj = asObj3(rev, `${path}/source_revisions/${idx}`);
      checkNoUnknownKeys(revObj, ["evaluation_ref", "observed_revision"], `${path}/source_revisions/${idx}`);
      return Object.freeze({
        evaluation_ref: checkOpaqueId(revObj.evaluation_ref, `${path}/source_revisions/${idx}/evaluation_ref`),
        observed_revision: checkOpaqueId(revObj.observed_revision, `${path}/source_revisions/${idx}/observed_revision`)
      });
    }));
    if (!Array.isArray(obj.groups)) {
      fail3("INVALID_INPUT", `${path}/groups`, "groups must be an array");
    }
    const groups = Object.freeze([...obj.groups]);
    const nextCursor = checkCursor(obj.next_cursor, `${path}/next_cursor`);
    const returnedBytes = checkSafeInteger(obj.returned_bytes, 0, MAX_PAGE_RESULT_BYTES, `${path}/returned_bytes`);
    return Object.freeze({
      status: "ready",
      source_revisions: sourceRevisions,
      groups,
      next_cursor: nextCursor,
      returned_bytes: returnedBytes
    });
  }
  checkNoUnknownKeys(obj, ["status", "evaluation_ref", "observed_revision"], path);
  const evaluationRef = checkOpaqueId(obj.evaluation_ref, `${path}/evaluation_ref`);
  let observedRevision = null;
  if (obj.observed_revision !== null) {
    observedRevision = checkOpaqueId(obj.observed_revision, `${path}/observed_revision`);
  }
  return Object.freeze({
    status: obj.status,
    evaluation_ref: evaluationRef,
    observed_revision: observedRevision
  });
}
