import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createResourceResult } from '../protocol/resource-control.js';
import type { ResourceRequest, ResourceResult } from '../protocol/resource-control.js';
import type {
  ImportApplyPayload, ImportPreviewPayload, ResourceGetPayload, ResourceListPayload,
  ResourceListResultPayload, ResourceGetResultPayload, ImportApplyResultPayload
} from '../protocol/resource-payloads.js';
import { validateResourceResultPayload } from '../protocol/resource-payloads.js';
import type { InvocationContext } from '../context/invocation-context.js';
import { loadResourceRegistry, listResources, getResource } from '../registry/store.js';
import { createScopeHandler } from '../scopes/handler.js';
import { applyImport } from './apply.js';
import { prepareImport } from './preview.js';
import { saveImportPreview } from './preview-store.js';
import type { JsonValue } from '../protocol/json.js';

export interface ResourceHandler {
  handle(request: ResourceRequest, context: InvocationContext): ResourceResult | Promise<ResourceResult>;
}
export interface ResourceHandlerOptions { readonly now?: () => number; }
function registryPath(context: InvocationContext): string { return join(context.packageRoot, '.evcrate', 'registry.json'); }
function payload(value: unknown): JsonValue { return value as JsonValue; }
function result(request: ResourceRequest, value: unknown, status: 'ok' | 'preview' | 'applied'): ResourceResult {
  const checked = validateResourceResultPayload(request.operation, value);
  return createResourceResult(request, checked, status);
}
function handler(options: ResourceHandlerOptions): ResourceHandler {
  const now = options.now ?? Date.now;
  const scopeHandler = createScopeHandler({ now });
  return {
    handle(request, context): ResourceResult {
      if (request.operation.startsWith('scopes.') || request.operation.startsWith('changes.')) return scopeHandler(request, context);
      if (request.operation === 'resources.list') {
        const input = request.payload as unknown as ResourceListPayload;
        const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
        const listed = listResources(registry.document, input.filters, input.cursor, input.limit);
        const value: ResourceListResultPayload = { resources: listed.resources, nextCursor: listed.nextCursor, registryRevision: registry.document.revision };
        return result(request, value, 'ok');
      }
      if (request.operation === 'resources.get') {
        const input = request.payload as unknown as ResourceGetPayload;
        const registry = loadResourceRegistry(registryPath(context), context.canonicalSourceRoot, context.resourceRoots);
        const value: ResourceGetResultPayload = { resource: getResource(registry.document, input.id), registryRevision: registry.document.revision };
        return result(request, value, 'ok');
      }
      if (request.operation === 'imports.preview') {
        const input = request.payload as unknown as ImportPreviewPayload;
        const prepared = prepareImport(input, context, now());
        try {
          saveImportPreview(context.stateRoot, prepared.tokenRecord);
          return result(request, payload(prepared.result), 'preview');
        } finally { prepared.cleanup(); }
      }
      if (request.operation === 'imports.apply') {
        const value: ImportApplyResultPayload = applyImport(request.payload as unknown as ImportApplyPayload, context, now());
        return result(request, value, 'applied');
      }
      throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
    }
  };
}
export function createResourceHandler(options: ResourceHandlerOptions = {}): ResourceHandler { return handler(options); }
export const defaultResourceHandler = createResourceHandler();
