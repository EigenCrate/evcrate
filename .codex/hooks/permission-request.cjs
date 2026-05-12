#!/usr/bin/env node
const fs = require('fs');

const input = JSON.parse(fs.readFileSync(0, 'utf-8') || '{}');
const command = String(input.tool_input?.command || '');
const dangerous = /(\brm\s+-rf\b|\bgit\s+reset\s+--hard\b|\bmkfs\b|\bdd\s+if=\/dev\/zero\b|:\s*>\s*[^\s]+)/i;

if (!dangerous.test(command)) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest',
    decision: {
      behavior: 'deny',
      message: 'Destructive shell command requires an explicit user-directed workflow review.'
    }
  }
}));
