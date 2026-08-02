import type { Advice, AdvisorRequest } from "./contract.js";
import type { EvidenceExcerpt } from "./evidence.js";
import type { AdvisorPolicy } from "./registry.js";
import type { Usage } from "./audit.js";

export type AdvisorInvocation = {
  request: AdvisorRequest;
  evidence: EvidenceExcerpt[];
  policy: AdvisorPolicy;
  prompt: string;
};

export type AdvisorAdapter = { consult(input: AdvisorInvocation): Promise<unknown> };

export type AdapterResult = { advice: Advice; usage?: Usage };

export function createFakeAdapter(result: AdapterResult): AdvisorAdapter {
  return { consult: async () => structuredClone(result) };
}
