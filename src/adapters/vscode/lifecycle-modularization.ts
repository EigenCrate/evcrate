import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeLocalTool } from './tool-inputs.js';
import type { InstallationRoots } from './session-context-types.js';
import type {
  LifecycleOptions,
  PostToolUsePayload,
  ModularizationResult
} from './lifecycle-types.js';

export function buildModularizationContext(
  payload: PostToolUsePayload,
  _roots: InstallationRoots,
  _options?: LifecycleOptions
): ModularizationResult {
  const toolOp = normalizeLocalTool(
    payload.tool_name,
    payload.tool_input,
    payload.tool_use_id,
    payload.cwd
  );

  if (toolOp.kind !== 'edit') {
    return { continue: true };
  }

  const warnings: string[] = [];
  const baseDir = payload.cwd || process.cwd();

  for (const operand of toolOp.operands) {
    try {
      const fullPath = path.isAbsolute(operand) ? operand : path.resolve(baseDir, operand);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.size < 1024 * 1024) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const loc = content.split('\n').length;
          if (loc > 200) {
            warnings.push(
              `[EVCrate Modularization Warning] File "${operand}" has ${loc} LOC (threshold: 200). Consider modularization: analyze logical boundaries, use kebab-case naming, ensure self-documenting names.`
            );
          }
        }
      }
    } catch {}
  }

  if (warnings.length > 0) {
    return {
      continue: true,
      systemMessage: warnings.join('\n'),
      warnings
    };
  }

  return { continue: true };
}
