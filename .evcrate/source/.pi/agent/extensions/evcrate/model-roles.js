const THINKING_LEVELS = new Set([
  "off", "minimal", "low", "medium", "high", "xhigh", "max",
]);
const ROLE_NAMES = new Set(["strong", "standard", "fast", "parent"]);

export const CODEX_ROLE_DEFAULTS = Object.freeze({
  strong: { model: "openai-codex/gpt-5.6-sol", thinking: "high" },
  standard: { model: "openai-codex/gpt-5.6-terra", thinking: "high" },
  fast: { model: "openai-codex/gpt-5.6-luna", thinking: "low" },
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function modelId(model) {
  if (!isObject(model) || typeof model.provider !== "string" || typeof model.id !== "string") {
    return undefined;
  }
  return `${model.provider}/${model.id}`;
}

export function availableModelIds(registry) {
  const models = Array.isArray(registry) ? registry : registry?.getAvailable?.() ?? [];
  return new Set(models.map(modelId).filter(Boolean));
}

export function parseModelRoles(settings) {
  const configured = settings?.evcrate?.modelRoles ?? settings?.modelRoles ?? {};
  const providers = isObject(configured.providers) ? configured.providers : {};
  const routes = new Map();
  const errors = new Map();
  for (const [provider, roles] of Object.entries(providers)) {
    if (!isObject(roles)) {
      errors.set(provider, "provider routes must be an object");
      continue;
    }
    const parsed = {};
    for (const [role, route] of Object.entries(roles)) {
      if (!ROLE_NAMES.has(role) || role === "parent") continue;
      if (!isObject(route) || typeof route.model !== "string" || !route.model.trim()) {
        errors.set(`${provider}:${role}`, "route model must be a non-empty string");
        continue;
      }
      if (route.thinking !== undefined && (!THINKING_LEVELS.has(route.thinking) || typeof route.thinking !== "string")) {
        errors.set(`${provider}:${role}`, "route thinking is invalid");
        continue;
      }
      parsed[role] = { model: route.model.trim(), ...(route.thinking ? { thinking: route.thinking } : {}) };
    }
    routes.set(provider, parsed);
  }
  return { routes, errors };
}

export function validateExplicitModel(model, registry) {
  if (model === undefined) return undefined;
  if (typeof model !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(model)) {
    return "explicit model must be a provider/model identifier";
  }
  if (!availableModelIds(registry).has(model)) return `explicit model '${model}' is unavailable`;
  return undefined;
}

export function validateExplicitThinking(thinking) {
  if (thinking === undefined) return undefined;
  return typeof thinking === "string" && THINKING_LEVELS.has(thinking)
    ? undefined
    : "explicit thinking is invalid";
}

function warnOnce(warnings, warn, key, message) {
  if (!warnings?.has(key)) {
    warnings?.add(key);
    warn?.(message);
  }
  return message;
}

/** Resolve semantic roles without mutating the user-owned settings object. */
export function resolveModelRole({
  settings,
  provider,
  agent,
  agentRoles = {},
  role,
  registry,
  model,
  thinking,
  warnings = new Set(),
  warn,
}) {
  const modelError = validateExplicitModel(model, registry);
  if (modelError) return { error: modelError };
  const thinkingError = validateExplicitThinking(thinking);
  if (thinkingError) return { error: thinkingError };
  if (model !== undefined) return { model, ...(thinking !== undefined ? { thinking } : {}) };

  const semanticRole = role ?? agentRoles?.[agent]?.role;
  if (!ROLE_NAMES.has(semanticRole)) {
    const message = warnOnce(warnings, warn, `missing-agent:${agent}`, `EVCrate model role missing for '${agent}'; inheriting parent model.`);
    return { inherited: true, warning: message, ...(thinking !== undefined ? { thinking } : {}) };
  }
  if (semanticRole === "parent") {
    const message = warnOnce(warnings, warn, `parent:${agent}`, `EVCrate role '${agent}' inherits the parent model.`);
    return { inherited: true, warning: message, ...(thinking !== undefined ? { thinking } : {}) };
  }

  const parsed = parseModelRoles(settings);
  const configured = parsed.routes.get(provider)?.[semanticRole];
  const malformed = parsed.errors.get(`${provider}:${semanticRole}`) ?? parsed.errors.get(provider);
  const route = configured ?? (provider === "openai-codex" ? CODEX_ROLE_DEFAULTS[semanticRole] : undefined);
  if (malformed || !route || !provider) {
    const reason = malformed ?? `no '${semanticRole}' route for provider '${provider ?? "unknown"}'`;
    const message = warnOnce(warnings, warn, `route:${provider}:${semanticRole}:${reason}`, `EVCrate ${reason}; inheriting parent model.`);
    return { inherited: true, warning: message, ...(thinking !== undefined ? { thinking } : {}) };
  }
  if (!route.model.startsWith(`${provider}/`) || !availableModelIds(registry).has(route.model)) {
    const message = warnOnce(warnings, warn, `unavailable:${provider}:${semanticRole}:${route.model}`, `EVCrate route '${route.model}' is unavailable; inheriting parent model.`);
    return { inherited: true, warning: message, ...(thinking !== undefined ? { thinking } : {}) };
  }
  return { model: route.model, ...(thinking ?? route.thinking ? { thinking: thinking ?? route.thinking } : {}) };
}


/** Pi registration seam: keeps one warning set per extension session. */
export function registerModelRoles(pi, options = {}) {
  let warnings = new Set();
  pi.on("session_start", () => { warnings = new Set(); });
  return (request, context) => resolveModelRole({
    ...options,
    ...request,
    provider: request.provider ?? context?.model?.provider ?? options.provider,
    registry: context?.modelRegistry ?? options.registry,
    warnings,
    warn: options.warn ?? ((message) => context?.ui?.notify?.(message, "warning")),
  });
}
