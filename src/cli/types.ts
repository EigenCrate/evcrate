import type { AdvisorSettingsRequest, AdvisorSettingsResult } from '../protocol/advisor-settings.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { ResourceHandler } from '../imports/handler.js';
import type { ProcessResult, RunBoundedProcessOptions } from './process-runner.js';
import type { PublicationHandler, PublicationOptions } from '../distribution/publication.js';
import type { EngineSelectionOptions } from '../distribution/cutover.js';

export interface CliOutput {
  readonly isTTY: boolean;
  write(value: string): void;
}

export interface AdvisorSettingsHandler {
  handle(
    request: AdvisorSettingsRequest,
    context: InvocationContext
  ): AdvisorSettingsResult | Promise<AdvisorSettingsResult>;
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
  readonly settingsHandler?: AdvisorSettingsHandler;
  readonly resourceHandler?: ResourceHandler;
  readonly processRunner?: ProcessRunner;
  readonly publicationHandler?: PublicationHandler;
  readonly publicationOptions?: PublicationOptions;
  readonly engineSelectionOptions?: EngineSelectionOptions;
}

export type RuntimeProcessOptions = Omit<RunBoundedProcessOptions, 'signal'> & {
  readonly signal?: AbortSignal;
};

export type { ProcessResult, RunBoundedProcessOptions };
