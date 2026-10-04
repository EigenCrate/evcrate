import * as readline from 'node:readline/promises';
import type { VscodeSettingsConsole } from './types.js';

export function createDefaultVscodeSettingsConsole(): VscodeSettingsConsole {
  return {
    isInputTTY: Boolean(process.stdin.isTTY),
    isOutputTTY: Boolean(process.stdout.isTTY),
    isErrorTTY: Boolean(process.stderr.isTTY),
    async confirm(question: string, signal?: AbortSignal): Promise<boolean> {
      if (signal?.aborted) return false;
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr
      });
      try {
        const answer = await rl.question(question, { signal });
        const trimmed = answer.trim().toLowerCase();
        return trimmed === 'y' || trimmed === 'yes';
      } catch {
        return false;
      } finally {
        rl.close();
      }
    },
    writeNotice(text: string): void {
      process.stderr.write(text);
    }
  };
}
