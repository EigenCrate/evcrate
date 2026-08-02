import { readFile } from "node:fs/promises";
import { z } from "zod";

const RoleSchema = z.object({
  allowed_models: z.array(z.string().min(1)).min(1),
  default_model: z.string().min(1),
  reasoning_effort: z.enum(["low", "medium", "high"]),
}).strict().superRefine((role, context) => {
  if (!role.allowed_models.includes(role.default_model)) {
    context.addIssue({ code: "custom", message: "default_model must be allowed" });
  }
});

const RegistrySchema = z.object({
  schema_version: z.literal(1),
  platforms: z.object({
    claude: z.object({ roles: z.object({ executor: RoleSchema, advisor: RoleSchema }).strict() }).strict(),
    codex: z.object({ roles: z.object({ executor: RoleSchema, advisor: RoleSchema }).strict() }).strict(),
  }).strict(),
}).strict().superRefine((registry, context) => {
  for (const [platform, policy] of Object.entries(registry.platforms)) {
    if (policy.roles.executor.default_model === policy.roles.advisor.default_model) {
      context.addIssue({ code: "custom", path: ["platforms", platform], message: "executor and advisor defaults must differ" });
    }
  }
});

export type Registry = z.infer<typeof RegistrySchema>;
export type Platform = keyof Registry["platforms"];
export type AdvisorPolicy = { model: string; effort: "low" | "medium" | "high" };

export async function loadRegistry(path: string): Promise<Registry> {
  return RegistrySchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export function resolveAdvisorPolicy(registry: Registry, platform: Platform, callerModel?: unknown): AdvisorPolicy {
  if (callerModel !== undefined) throw new Error("CALLER_MODEL_OVERRIDE");
  const role = registry.platforms[platform].roles.advisor;
  return { model: role.default_model, effort: role.reasoning_effort };
}
