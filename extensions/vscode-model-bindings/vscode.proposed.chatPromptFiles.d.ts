// Minimal ambient TypeScript subset derived from upstream VS Code 1.140.0
// (commit 07f806f999227108933c2e30515b26eecc1fda74) vscode.d.ts and vscode.proposed.chatPromptFiles.d.ts.

declare module 'vscode' {
  export interface Disposable {
    dispose(): unknown;
  }

  export type Event<T> = (
    listener: (e: T) => unknown,
    thisArgs?: unknown,
    disposables?: Disposable[]
  ) => Disposable;

  export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    readonly onCancellationRequested: Event<unknown>;
  }

  export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

  export interface Uri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;
    readonly fsPath: string;
    toString(skipEncoding?: boolean): string;
  }

  export interface LanguageModelChatSelector {
    readonly vendor?: string;
    readonly family?: string;
    readonly version?: string;
    readonly id?: string;
  }

  export interface LanguageModelChat {
    readonly name: string;
    readonly id: string;
    readonly vendor: string;
    readonly family: string;
    readonly version: string;
    readonly maxInputTokens: number;
  }

  export namespace lm {
    export const onDidChangeChatModels: Event<void>;
    export function selectChatModels(
      selector?: LanguageModelChatSelector
    ): Thenable<LanguageModelChat[]>;
  }

  export namespace chat {
    export interface ChatResource {
      readonly uri: Uri;
      readonly when?: string;
      readonly sessionTypes?: readonly string[];
    }

    export interface ChatCustomAgentProvider {
      readonly onDidChangeCustomAgents?: Event<void>;
      provideCustomAgents(token: CancellationToken): ProviderResult<ChatResource[]>;
    }

    export function registerCustomAgentProvider(
      provider: ChatCustomAgentProvider
    ): Disposable;
  }
}
