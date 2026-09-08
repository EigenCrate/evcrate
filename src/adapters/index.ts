export * from './types.js';
export * from './resource-graph.js';
export * from './projection-utils.js';
export * from './registry.js';
export * from './qualification.js';
export * from './advisory.js';

import { antigravityAdapter } from './antigravity.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex/index.js';
import { copilotAdapter } from './copilot/index.js';
import { geminiAdapter } from './gemini/index.js';
import { ompAdapter } from './omp/index.js';
import { piAdapter } from './pi/index.js';
import { registerProjectionAdapters } from './registry.js';

registerProjectionAdapters([
  claudeAdapter,
  geminiAdapter,
  antigravityAdapter,
  codexAdapter,
  piAdapter,
  ompAdapter,
  copilotAdapter
]);
