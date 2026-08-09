import hookAdapter from "./hook-adapter.cjs";

const { createChildStartRunner: createAdapterChildStartRunner } = hookAdapter;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

/** Extract only the documented hook field; raw hook data is never forwarded. */
export function parseAdditionalContext(output) {
  const parsed = parseJson(output);
  const value = isObject(parsed) ? parsed : undefined;
  const additionalContext = value?.hookSpecificOutput?.additionalContext;
  return typeof additionalContext === "string" && additionalContext.trim()
    ? additionalContext.trim()
    : undefined;
}

/** Render active roots only; settings and arbitrary hook output stay private. */
export function formatRuntimeRoots(roots = {}) {
  const labels = { workflowRoot: "workflow root", configRoot: "config root", resourceRoot: "resource root" };
  return Object.entries(labels).flatMap(([key, label]) => {
    const value = roots[key];
    return typeof value === "string" && value.trim() ? [`Active ${label}: ${value.trim()}`] : [];
  });
}

export function appendChildContext(task, additionalContext, roots) {
  return [task, additionalContext, ...formatRuntimeRoots(roots)].filter(Boolean).join("\n\n");
}

/** Compatibility export backed by the shared, bounded canonical hook adapter. */
export function createChildStartRunner(options = {}) {
  return createAdapterChildStartRunner(options);
}

/** Reusable seam: structured delegation owns child-start invocation timing. */
export async function runChildStart({ runner, canonicalEvent, task, runtimeRoots }) {
  const output = runner ? await runner(canonicalEvent) : undefined;
  const additionalContext = parseAdditionalContext(output);
  return { task: appendChildContext(task, additionalContext, runtimeRoots), additionalContext };
}
