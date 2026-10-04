export type InstallationScope = 'project' | 'home';

export interface InstallationRoots {
  readonly scope: InstallationScope;
  readonly pluginRoot: string;
  readonly supportRoot: string;
  readonly workflowsRoot: string;
  readonly scriptsRoot: string;
  readonly catalogsRoot: string;
  readonly skillsRoot: string;
  readonly boundRoot: string;
}

export interface ExplicitInstallationRoots {
  readonly homeRoot?: string;
  readonly projectRoot?: string;
}

export interface ResolveProjectIdentityOptions {
  readonly installationRoots: InstallationRoots;
  readonly nativeCwd?: string | null;
  readonly explicitProjectRoot?: string | null;
  readonly qualifiedWorkspaceContract?: boolean;
}

export interface ProjectIdentity {
  readonly projectRoot: string;
  readonly projectKey: string;
}

export type ResolveProjectIdentityResult =
  | { readonly status: 'available'; readonly identity: ProjectIdentity }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface CreateSessionContextInput {
  readonly sessionId?: string | null;
  readonly cwd?: string | null;
  readonly explicitProjectRoot?: string | null;
}

export interface NativeSessionContext {
  readonly kind: 'native';
  readonly target: 'vscode';
  readonly projectRoot: string;
  readonly projectKey: string;
  readonly sessionKey: string;
  readonly nativeSessionId: string;
  readonly handle: string;
}

export interface StatelessContext {
  readonly kind: 'stateless';
  readonly target: 'vscode';
  readonly projectRoot: string | null;
  readonly projectKey: string | null;
  readonly reason: string;
}

export type SessionContext = NativeSessionContext | StatelessContext;
