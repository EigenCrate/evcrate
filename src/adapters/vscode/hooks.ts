import type { ProjectionBuildContext } from '../types.js';
import { outputPath, writeJson, copyFile } from './common.js';
import { writeProjectionFile, textBytes } from '../projection-utils.js';
import {
  LOCAL_HOOK_PROTOCOL_SOURCE,
  LOCAL_TOOL_INPUTS_SOURCE,
  LOCAL_POLICY_SOURCE,
  LOCAL_HOOK_BRIDGE_SOURCE,
  LOCAL_SESSION_CONTEXT_SOURCE,
  LOCAL_SESSION_STATE_SOURCE,
  LOCAL_LIFECYCLE_SOURCE
} from './runtime-sources.js';
import {
  SET_ACTIVE_PLAN_SCRIPT_SOURCE,
  VSCODE_SESSION_CONTEXT_SCRIPT_SOURCE
} from './support.js';
import { VSCODE_LOCAL_HOOK_EVENTS } from './hook-protocol.js';

export interface VscodeHookAudit {
  hooks: string[];
  scripts: string[];
  events: string[];
  unsupportedCapabilities: Array<{ name: string; reason: string }>;
}

export function convertVscodeHooks(context: ProjectionBuildContext): VscodeHookAudit {
  // 1. Emit Agent Plugins 1.0 hooks.json
  const hooksConfig: Record<string, unknown[]> = {};
  for (const event of VSCODE_LOCAL_HOOK_EVENTS) {
    hooksConfig[event] = [
      {
        type: 'command',
        command: `node "\${PLUGIN_ROOT}/evcrate/runtime/local-hook-bridge.cjs" ${event}`,
        timeout: 30
      }
    ];
  }

  writeJson(context, 'com.github.copilot/hooks/hooks.json', {
    version: 1,
    hooks: hooksConfig
  });

  // 2. Emit runtime closure CJS files
  const runtimeFiles = [
    { rel: 'evcrate/runtime/local-hook-protocol.cjs', source: LOCAL_HOOK_PROTOCOL_SOURCE, exec: false },
    { rel: 'evcrate/runtime/local-tool-inputs.cjs', source: LOCAL_TOOL_INPUTS_SOURCE, exec: false },
    { rel: 'evcrate/runtime/local-policy.cjs', source: LOCAL_POLICY_SOURCE, exec: false },
    { rel: 'evcrate/runtime/local-session-context.cjs', source: LOCAL_SESSION_CONTEXT_SOURCE, exec: false },
    { rel: 'evcrate/runtime/local-session-state.cjs', source: LOCAL_SESSION_STATE_SOURCE, exec: false },
    { rel: 'evcrate/runtime/local-lifecycle.cjs', source: LOCAL_LIFECYCLE_SOURCE, exec: false },
    { rel: 'evcrate/runtime/local-hook-bridge.cjs', source: LOCAL_HOOK_BRIDGE_SOURCE, exec: true },
    { rel: 'evcrate/scripts/set-active-plan.cjs', source: SET_ACTIVE_PLAN_SCRIPT_SOURCE, exec: true },
    { rel: 'evcrate/scripts/vscode-session-context.cjs', source: VSCODE_SESSION_CONTEXT_SCRIPT_SOURCE, exec: true }
  ];

  for (const f of runtimeFiles) {
    writeProjectionFile(context, outputPath(f.rel), textBytes(f.source), f.exec);
  }

  // 3. Copy .evcrateignore to root and evcrate/
  copyFile(context, '.evcrateignore', '.evcrateignore');
  copyFile(context, '.evcrateignore', 'evcrate/.evcrateignore');

  // 4. Unsupported capabilities
  const unsupported = [
    {
      name: 'SessionEnd',
      reason: 'Absent from VS Code Local event specification. Stop only signals execution pause, not session teardown.'
    },
    {
      name: 'StatusLine',
      reason: 'No documented native statusline API exists in VS Code Local plugin architecture.'
    },
    {
      name: 'MatcherProperties',
      reason: 'Local hooks do not support declarative matcher filtering in hook JSON. Filtering must be performed inside hook script.'
    }
  ];

  // 5. Write hook-inventory.json
  writeJson(context, 'evcrate/hook-inventory.json', {
    schema: 'evcrate-vscode-hook-inventory-v1',
    plugin_id: 'evcrate-local',
    registered_events: [...VSCODE_LOCAL_HOOK_EVENTS],
    runtime_scripts: runtimeFiles.map((f) => f.rel),
    unsupported_capabilities: unsupported
  });

  return {
    hooks: ['com.github.copilot/hooks/hooks.json'],
    scripts: runtimeFiles.map((f) => f.rel),
    events: [...VSCODE_LOCAL_HOOK_EVENTS],
    unsupportedCapabilities: unsupported
  };
}
