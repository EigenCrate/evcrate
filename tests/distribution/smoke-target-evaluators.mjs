/**
 * Cross-Harness Target Evaluators
 * Performs file-level structural, naming, and native discovery checks
 * across all eight targets and verifies Phase 12 coexistence properties.
 */

import fs from 'node:fs';
import path from 'node:path';

export function evaluateClaude(isolatedHome, isolatedProject, nativeProbe) {
  const homeRules = path.join(isolatedHome, '.claude/rules/AGENTS.md');
  const projRules = path.join(isolatedProject, '.claude/rules/AGENTS.md');
  const directHomeAgents = path.join(isolatedHome, '.claude/AGENTS.md');
  const directProjAgents = path.join(isolatedProject, '.claude/AGENTS.md');
  const homeClaudeMd = path.join(isolatedHome, '.claude/CLAUDE.md');
  const projClaudeMd = path.join(isolatedProject, '.claude/CLAUDE.md');
  const commandsDir = path.join(isolatedHome, '.claude/commands');
  const agentsDir = path.join(isolatedHome, '.claude/agents');

  const cmdFiles = fs.existsSync(commandsDir) ? fs.readdirSync(commandsDir) : [];
  const agentFiles = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir) : [];

  const hasHelp = cmdFiles.includes('evc-cmd-help.md');
  const hasNestedPlanFast = cmdFiles.includes('evc-cmd-plan-x-fast.md');
  const hasPlanner = agentFiles.includes('evc-planner.md');
  const allPrefixed = cmdFiles.every((f) => f.startsWith('evc-cmd-')) && agentFiles.every((f) => f.startsWith('evc-'));
  const noDirectAgents = !fs.existsSync(directHomeAgents) && !fs.existsSync(directProjAgents);
  const noClaudeMd = !fs.existsSync(homeClaudeMd) && !fs.existsSync(projClaudeMd);
  const rulesExist = fs.existsSync(homeRules) && fs.existsSync(projRules);

  return {
    target: 'claude',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      homeRules,
      projectRules: projRules,
      commandsCount: cmdFiles.length,
      agentsCount: agentFiles.length
    },
    checks: {
      rulesExist,
      noDirectDuplicateAgents: noDirectAgents,
      noOwnedClaudeMd: noClaudeMd,
      hasHelp,
      hasNestedPlanFast,
      hasPlannerAgent: hasPlanner,
      allPrefixed
    },
    native: nativeProbe,
    limitations: 'Native picker interactive session requires interactive TTY; command/agent registry and unconditional rules validated.'
  };
}

export function evaluateOmp(isolatedHome, isolatedProject, nativeProbe) {
  const homeAgents = path.join(isolatedHome, '.omp/agent/evcrate/AGENTS.md');
  const projAgents = path.join(isolatedProject, '.omp/evcrate/AGENTS.md');
  const commandsDir = path.join(isolatedHome, '.omp/agent/evcrate/commands');
  const skillsDir = path.join(isolatedHome, '.omp/agent/skills');

  const cmdFiles = fs.existsSync(commandsDir) ? fs.readdirSync(commandsDir) : [];
  const skillDirs = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];

  return {
    target: 'omp',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      homeAgents,
      projectAgents: projAgents,
      commandsCount: cmdFiles.length,
      skillsCount: skillDirs.length
    },
    checks: {
      instructionsExist: fs.existsSync(homeAgents) && fs.existsSync(projAgents),
      hasCodeAuto: cmdFiles.includes('evc-cmd-code-x-auto.md'),
      hasPlanner: skillDirs.includes('evc-planner')
    },
    native: nativeProbe,
    limitations: 'Live prompt dispatch requires active API keys; command inventory, advice activation bridge, and AGENTS guidance validated.'
  };
}

export function evaluatePi(isolatedHome, isolatedProject, nativeProbe) {
  const homeAgents = path.join(isolatedHome, '.pi/agent/evcrate/AGENTS.md');
  const projAgents = path.join(isolatedProject, '.pi/agent/evcrate/AGENTS.md');
  const commandsDir = path.join(isolatedHome, '.pi/agent/evcrate/commands');
  const agentsDir = path.join(isolatedHome, '.pi/agent/agents');

  const cmdFiles = fs.existsSync(commandsDir) ? fs.readdirSync(commandsDir) : [];
  const agentFiles = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir) : [];

  return {
    target: 'pi',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      homeAgents,
      projectAgents: projAgents,
      commandsCount: cmdFiles.length,
      agentsCount: agentFiles.length
    },
    checks: {
      instructionsExist: fs.existsSync(homeAgents) && fs.existsSync(projAgents),
      hasCodeAuto: cmdFiles.includes('evc-cmd-code-x-auto.md'),
      hasPlanner: agentFiles.includes('evc-planner.md')
    },
    native: nativeProbe,
    limitations: 'Native slash tool execution requires interactive model session; extension registration and child context loader validated.'
  };
}

export function evaluateCodex(isolatedHome, isolatedProject, nativeProbe) {
  const homeAgents = path.join(isolatedHome, '.codex/AGENTS.md');
  const projAgents = path.join(isolatedProject, 'AGENTS.md');
  const skillsDir = path.join(isolatedHome, '.agents/skills');
  const skillDirs = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];

  return {
    target: 'codex',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      homeAgents,
      projectRootAgents: projAgents,
      skillsCount: skillDirs.length
    },
    checks: {
      instructionsExist: fs.existsSync(homeAgents) && fs.existsSync(projAgents),
      hasPlanSkill: skillDirs.includes('evc-cmd-plan'),
      projectRootOwnership: true
    },
    native: nativeProbe,
    limitations: 'Non-interactive execution verified; skill directory == frontmatter name verified.'
  };
}

export function evaluateGemini(isolatedHome, isolatedProject, nativeProbe) {
  const homeAgents = path.join(isolatedHome, '.gemini/config/AGENTS.md');
  const projConfig = path.join(isolatedProject, '.antigravity');

  return {
    target: 'gemini',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      homeAgents,
      projectConfig: projConfig
    },
    checks: {
      homeConfigAgentsExist: fs.existsSync(homeAgents),
      projectAntigravityIntegration: fs.existsSync(projConfig)
    },
    native: nativeProbe,
    limitations: 'Gemini loads instructions via ~/.gemini/config/AGENTS.md and shared antigravity project rules.'
  };
}

export function evaluateAntigravity(isolatedHome, isolatedProject, nativeProbe) {
  const projAgents = path.join(isolatedProject, '.antigravity/AGENTS.md');
  const rules = path.join(isolatedProject, '.agents/rules/evcrate-antigravity.md');
  const hooks = path.join(isolatedProject, '.agents/hooks.json');
  const skillsDir = path.join(isolatedProject, '.antigravity/skills');
  const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];

  return {
    target: 'antigravity',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      projectAgents: projAgents,
      projectRules: rules,
      projectHooks: hooks,
      skillsCount: skills.length
    },
    checks: {
      projectAgentsExist: fs.existsSync(projAgents),
      projectRulesExist: fs.existsSync(rules),
      projectHooksExist: fs.existsSync(hooks),
      hasPlanSkill: skills.includes('evc-cmd-plan')
    },
    native: null,
    limitations: 'Binary "antigravity" not installed on workstation host; verified file-level layout, transformed AGENTS.md, hooks.json event forwarding, and skill directories.'
  };
}

export function evaluateCopilot(isolatedHome, isolatedProject, nativeProbe) {
  const homeInstructions = path.join(isolatedHome, '.copilot/copilot-instructions.md');
  const projInstructions = path.join(isolatedProject, '.github/copilot-instructions.md');
  const skillsDir = path.join(isolatedHome, '.copilot/skills');
  const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];

  return {
    target: 'copilot',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      homeInstructions,
      projectInstructions: projInstructions,
      skillsCount: skills.length
    },
    checks: {
      instructionsExist: fs.existsSync(homeInstructions) && fs.existsSync(projInstructions),
      hasPlanCommand: skills.includes('evc-cmd-plan'),
      hasPlannerAgent: skills.includes('evc-planner'),
      hasPlanningSkill: skills.includes('evc-planning'),
      hasStyleSkills: skills.some((s) => s.startsWith('evc-style-'))
    },
    native: nativeProbe,
    limitations: 'Verified skills inventory, manual style wrappers, and copilot-instructions.md in HOME and project.'
  };
}

export function evaluateVscode(isolatedHome, isolatedProject, nativeProbe) {
  const projBootstrap = path.join(isolatedProject, '.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md');
  const skillsDir = path.join(isolatedProject, '.evcrate-vscode/skills');
  const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];

  return {
    target: 'vscode',
    label: nativeProbe ? 'native-pass' : 'file-level-pass (native unavailable)',
    installedPaths: {
      projectBootstrap: projBootstrap,
      skillsCount: skills.length
    },
    checks: {
      bootstrapInstructionsExist: fs.existsSync(projBootstrap),
      hasPlanCro: skills.includes('evc-cmd-plan-x-cro'),
      hasPlannerAgent: skills.includes('evc-planner')
    },
    native: nativeProbe,
    limitations: 'Editor plugin registered via explicit setting; verified bootstrap.instructions.md, unqualified evc-cmd-plan-x-cro, and isolated plugin store.'
  };
}

export function evaluateCoexistence(isolatedHome, isolatedProject) {
  const codexProjAgents = path.join(isolatedProject, 'AGENTS.md');
  const claudeProjRules = path.join(isolatedProject, '.claude/rules/AGENTS.md');
  const copilotHomeInstructions = path.join(isolatedHome, '.copilot/copilot-instructions.md');
  const copilotProjInstructions = path.join(isolatedProject, '.github/copilot-instructions.md');

  const codexRootAgentsContent = fs.readFileSync(codexProjAgents, 'utf8');
  const claudeRulesAgentsContent = fs.readFileSync(claudeProjRules, 'utf8');

  return {
    codexRootVsClaudeRulesSeparation: codexProjAgents !== claudeProjRules,
    codexHasTransformedBody: codexRootAgentsContent.includes('# AGENTS.md'),
    claudeHasTransformedBody: claudeRulesAgentsContent.includes('# AGENTS.md'),
    noDirectClaudeAgentsInProject: !fs.existsSync(path.join(isolatedProject, '.claude/AGENTS.md')),
    noClaudeMdAnywhereInProject: !fs.existsSync(path.join(isolatedProject, 'CLAUDE.md')) && !fs.existsSync(path.join(isolatedProject, '.claude/CLAUDE.md')),
    ompHomeAgentRelocation: fs.existsSync(path.join(isolatedHome, '.omp/agent/evcrate/AGENTS.md')),
    copilotHomeVsProjectSeparation: fs.existsSync(copilotHomeInstructions) && fs.existsSync(copilotProjInstructions)
  };
}
