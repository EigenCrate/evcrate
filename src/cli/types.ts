import type { ResourceHandler } from '../imports/handler.js';
import type { ProcessResult, RunBoundedProcessOptions } from './process-runner.js';
import type { PublicationHandler, PublicationOptions } from '../distribution/publication.js';
import type { EngineSelectionOptions } from '../distribution/cutover.js';

export interface CliOutput {
  readonly isTTY: boolean;
  write(value: string): void;
}

export interface VscodeSettingsConsole {
  readonly isInputTTY?: boolean;
  readonly isOutputTTY?: boolean;
  readonly isErrorTTY?: boolean;
  readonly confirm: (question: string, signal?: AbortSignal) => Promise<boolean>;
  readonly writeNotice?: (text: string) => void;
}
export interface VscodeCompanionConsole {
  readonly isInputTTY?: boolean;
  readonly isOutputTTY?: boolean;
  readonly isErrorTTY?: boolean;
  readonly confirm: (question: string, signal?: AbortSignal) => Promise<boolean>;
  readonly writeStderr?: (text: string) => void;
}


export interface ProcessRunner {
  run(options: RunBoundedProcessOptions): Promise<ProcessResult>;
}

export interface CliRuntime {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly packageRoot?: string;
  readonly packageVersion?: string;
  readonly platformHome?: string;
  readonly execPath?: string;
  readonly pythonExecutable?: string;
  readonly now?: () => number;
  readonly requestId?: () => string;
  readonly abortSignal?: AbortSignal;
  readonly signalCode?: 130 | 143;
  readonly output?: CliOutput;
  readonly resourceHandler?: ResourceHandler;
  readonly processRunner?: ProcessRunner;
  readonly publicationHandler?: PublicationHandler;
  readonly publicationOptions?: PublicationOptions;
  readonly engineSelectionOptions?: EngineSelectionOptions;
  readonly vscodeSettingsConsole?: VscodeSettingsConsole;
  readonly vscodeCompanionConsole?: VscodeCompanionConsole;
  readonly vscodeEditorExecutable?: string;
  readonly extensionsDirectory?: string;
  readonly userDataDirectory?: string;
  readonly platform?: NodeJS.Platform;
}

export type RuntimeProcessOptions = Omit<RunBoundedProcessOptions, 'signal'> & {
  readonly signal?: AbortSignal;
};

export type { ProcessResult, RunBoundedProcessOptions };
