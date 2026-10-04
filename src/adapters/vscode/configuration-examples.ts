import { PINNED_REVIEWED_MCP_VERSIONS } from './configuration-types.js';

export function renderRegistrationExamples(options?: {
  readonly pluginPath?: string;
}): { readonly vscodeSettings: Record<string, unknown>; readonly content: string } {
  const selectedPath = options?.pluginPath ?? '/absolute/selected/.evcrate-vscode';

  const vscodeSettings = {
    'chat.pluginLocations': {
      [selectedPath]: false
    },
    'chat.plugins.enabled': true,
    'chat.useHooks': true
  };

  const content = JSON.stringify(vscodeSettings, null, 2) + '\n';

  return Object.freeze({
    vscodeSettings: Object.freeze(vscodeSettings),
    content
  });
}

export function renderMcpExamples(_sourceMcp?: Record<string, unknown>): {
  readonly mcpServersExample: Record<string, unknown>;
  readonly content: string;
} {
  const servers: Record<string, unknown> = {
    context7: {
      command: 'npx',
      args: ['-y', PINNED_REVIEWED_MCP_VERSIONS['context7']],
      env: {
        CONTEXT7_API_KEY: '${input:context7ApiKey}'
      }
    },
    'chrome-devtools': {
      command: 'npx',
      args: ['-y', PINNED_REVIEWED_MCP_VERSIONS['chrome-devtools']]
    },
    'sequential-thinking': {
      command: 'npx',
      args: ['-y', PINNED_REVIEWED_MCP_VERSIONS['sequential-thinking']]
    }
  };

  const inputs = [
    {
      id: 'context7ApiKey',
      type: 'promptString',
      description: 'Context7 API Key (stored in secure credential store, never in project settings)',
      password: true
    }
  ];

  const mcpServersExample = {
    servers,
    inputs
  };

  const content = JSON.stringify(mcpServersExample, null, 2) + '\n';

  return Object.freeze({
    mcpServersExample: Object.freeze(mcpServersExample),
    content
  });
}

export function renderEvcrateConfigExample(sourceConfig?: Record<string, unknown>): {
  readonly configExample: Record<string, unknown>;
  readonly content: string;
} {
  const configExample = sourceConfig ?? {
    codingLevel: -1,
    privacyBlock: true,
    docs: {
      maxLoc: 800
    },
    plan: {
      namingFormat: '{date}-{issue}-{slug}',
      dateFormat: 'YYMMDD-HHmm',
      issuePrefix: 'GH-',
      reportsDir: 'reports',
      resolution: {
        order: ['session', 'branch'],
        branchPattern: '(?:feat|fix|chore|refactor|docs)/(?:[^/]+/)?(.+)'
      },
      validation: {
        mode: 'prompt',
        minQuestions: 3,
        maxQuestions: 8,
        focusAreas: ['assumptions', 'risks', 'tradeoffs', 'architecture']
      }
    },
    paths: {
      docs: 'docs',
      plans: 'plans'
    },
    locale: {
      thinkingLanguage: null,
      responseLanguage: null
    },
    trust: {
      passphrase: null,
      enabled: false
    },
    project: {
      type: 'auto',
      packageManager: 'auto',
      framework: 'auto'
    },
    assertions: []
  };

  const content = JSON.stringify(configExample, null, 2) + '\n';

  return Object.freeze({
    configExample: Object.freeze(configExample),
    content
  });
}
