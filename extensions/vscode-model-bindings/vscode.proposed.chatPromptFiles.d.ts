// Minimal ambient TypeScript subset derived from upstream VS Code 1.140.0
// (commit 07f806f999227108933c2e30515b26eecc1fda74) vscode.d.ts and vscode.proposed.chatPromptFiles.d.ts.

declare module 'vscode' {
  export type Thenable<T> = PromiseLike<T>;

  export interface Disposable {
    dispose(): unknown;
  }

  export type Event<T> = (
    listener: (e: T) => unknown,
    thisArgs?: unknown,
    disposables?: Disposable[]
  ) => Disposable;

  export class EventEmitter<T> implements Disposable {
    readonly event: Event<T>;
    fire(data: T): void;
    dispose(): void;
  }

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

  export namespace Uri {
    export function file(path: string): Uri;
    export function parse(value: string, strict?: boolean): Uri;
  }

  export interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
    readonly index: number;
  }

  export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Thenable<void>;
    keys(): readonly string[];
  }

  export interface ExtensionContext {
    readonly subscriptions: Disposable[];
    readonly globalStorageUri: Uri;
    readonly storageUri?: Uri;
    readonly globalState: Memento;
    readonly workspaceState: Memento;
  }

  export namespace commands {
    export function registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
      thisArgs?: unknown
    ): Disposable;
  }

  export interface QuickPickItem {
    label: string;
    description?: string;
    detail?: string;
  }

  export namespace window {
    export function showQuickPick<T extends QuickPickItem>(
      items: readonly T[] | Thenable<readonly T[]>,
      options?: unknown
    ): Thenable<T | undefined>;
    export function showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    export function showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    export function showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>;
  }

  export namespace workspace {
    export const isTrusted: boolean;
    export const onDidGrantWorkspaceTrust: Event<void>;
    export const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    export const onDidChangeWorkspaceFolders: Event<unknown>;
  }

  export namespace env {
    export const remoteAuthority: string | undefined;
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
