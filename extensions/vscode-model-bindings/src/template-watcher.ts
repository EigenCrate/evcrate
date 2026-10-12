import { existsSync, watch, type FSWatcher } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export interface ScopedWatcherDisposable {
  dispose(): void;
}

function isPathEqualOrInside(candidateFsPath: string, baseFsPath: string): boolean {
  const rel = relative(resolve(baseFsPath), resolve(candidateFsPath));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function isDerivedStoragePath(candidateFsPath: string, baseStorageFsPath: string): boolean {
  if (!candidateFsPath || !baseStorageFsPath) return false;
  return isPathEqualOrInside(candidateFsPath, baseStorageFsPath);
}

export function isEnrolledTemplateInventoryPath(
  candidateFsPath: string,
  pluginFsPath: string,
  baseStorageFsPath: string
): boolean {
  if (!candidateFsPath || !pluginFsPath) return false;
  if (isDerivedStoragePath(candidateFsPath, baseStorageFsPath)) {
    return false;
  }
  const resolvedCandidate = resolve(candidateFsPath);
  const resolvedPlugin = resolve(pluginFsPath);
  const evcrateDir = resolve(resolvedPlugin, 'evcrate');
  const manifestPath = resolve(evcrateDir, 'agent-intent.json');
  const templatesDir = resolve(evcrateDir, 'agent-templates');

  return (
    resolvedCandidate === resolvedPlugin
    || resolvedCandidate === evcrateDir
    || resolvedCandidate === manifestPath
    || isPathEqualOrInside(resolvedCandidate, templatesDir)
  );
}

export function createScopedTemplateWatcher(
  pluginFsPath: string,
  baseStorageFsPath: string,
  onRelevantChange: (changedPath: string) => void
): ScopedWatcherDisposable {
  const resolvedPlugin = resolve(pluginFsPath);
  const parentDir = dirname(resolvedPlugin);
  const pluginBase = basename(resolvedPlugin);
  const evcrateDir = join(resolvedPlugin, 'evcrate');
  const templatesDir = join(evcrateDir, 'agent-templates');

  let parentWatcher: FSWatcher | null = null;
  let childWatchers: FSWatcher[] = [];
  let disposed = false;

  const closeChildWatchers = (): void => {
    for (const w of childWatchers) {
      try {
        w.close();
      } catch {
        // Ignore close errors
      }
    }
    childWatchers = [];
  };

  const attachChildWatcher = (dirPath: string, reattachOnRename: boolean): void => {
    if (disposed || !existsSync(dirPath)) return;
    try {
      const watcher = watch(dirPath, { persistent: false }, (eventType, filename) => {
        if (disposed) return;
        if (reattachOnRename && eventType === 'rename') {
          syncChildWatchers();
        }
        const targetPath = typeof filename === 'string' && filename.length > 0
          ? join(dirPath, filename)
          : dirPath;
        if (isEnrolledTemplateInventoryPath(targetPath, resolvedPlugin, baseStorageFsPath)) {
          onRelevantChange(targetPath);
        }
      });
      watcher.on('error', () => {
        if (disposed) return;
        syncChildWatchers();
        onRelevantChange(dirPath);
      });
      childWatchers.push(watcher);
    } catch {
      // Directory may be mid-swap; parent watcher will re-trigger
    }
  };

  const useRecursiveParentWatch = process.platform === 'win32';

  const syncChildWatchers = (): void => {
    closeChildWatchers();
    if (disposed || useRecursiveParentWatch) return;
    attachChildWatcher(resolvedPlugin, true);
    attachChildWatcher(evcrateDir, true);
    attachChildWatcher(templatesDir, false);
  };

  if (existsSync(parentDir)) {
    try {
      parentWatcher = watch(
        parentDir,
        { persistent: false, ...(useRecursiveParentWatch ? { recursive: true } : {}) },
        (_eventType, filename) => {
          if (disposed) return;
          const name = typeof filename === 'string' ? filename : '';
          if (useRecursiveParentWatch) {
            if (name.length === 0) {
              onRelevantChange(resolvedPlugin);
              return;
            }
            const targetPath = join(parentDir, name);
            if (isEnrolledTemplateInventoryPath(targetPath, resolvedPlugin, baseStorageFsPath)) {
              onRelevantChange(targetPath);
            }
            return;
          }
          if (name === '' || name === pluginBase) {
            syncChildWatchers();
            onRelevantChange(resolvedPlugin);
          }
        }
      );
      parentWatcher.on('error', () => {
        if (!disposed) onRelevantChange(resolvedPlugin);
      });
    } catch {
      // Parent directory watch unavailable
    }
  }

  syncChildWatchers();

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (parentWatcher) {
        try {
          parentWatcher.close();
        } catch {
          // Ignore close errors
        }
        parentWatcher = null;
      }
      closeChildWatchers();
    }
  };
}
