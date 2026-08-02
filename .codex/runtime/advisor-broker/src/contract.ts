import { z } from "zod";

const EvidencePathSchema = z.object({
  path: z.string().min(1).max(240),
  startLine: z.number().int().min(1).max(100_000).optional(),
  endLine: z.number().int().min(1).max(100_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.endLine !== undefined && value.startLine !== undefined && value.endLine < value.startLine) {
    context.addIssue({ code: "custom", message: "endLine must not precede startLine" });
  }
});

export const AdvisorRequestSchema = z.object({
  kind: z.enum(["architecture", "debugging", "security", "review"]),
  question: z.string().trim().min(20).max(4_000),
  evidence: z.array(EvidencePathSchema).min(1).max(4),
  _admission: z.object({ token: z.string().min(16).max(512) }).strict().optional(),
}).strict();

export const FindingSchema = z.object({
  severity: z.enum(["critical", "warning", "info"]),
  message: z.string().trim().min(1).max(1_000),
}).strict();

export const AdviceSchema = z.object({
  verdict: z.enum(["proceed", "revise", "escalate"]),
  recommendation: z.string().trim().min(1).max(4_000),
  findings: z.array(FindingSchema).max(8),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(8),
}).strict();

export const AdvisorErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["INVALID_REQUEST", "POLICY_DENIED", "EVIDENCE_REJECTED", "ADAPTER_FAILURE", "ADAPTER_MALFORMED", "INTERNAL_ERROR"]),
  message: z.string().max(500),
  requestId: z.string().min(1).max(100),
}).strict();

export const AdvisorSuccessSchema = z.object({
  ok: z.literal(true),
  requestId: z.string().min(1).max(100),
  advice: AdviceSchema,
});

export type AdvisorRequest = z.infer<typeof AdvisorRequestSchema>;
export type Advice = z.infer<typeof AdviceSchema>;
export type AdvisorResponse = z.infer<typeof AdvisorSuccessSchema> | z.infer<typeof AdvisorErrorSchema>;
