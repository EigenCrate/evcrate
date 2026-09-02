import { ControlPlaneError } from '../errors/control-plane-error.js';
import { planManagedJson, ManagedJsonError, type ManagedJsonPlan } from './managed-json.js';
import { planPiSettings, PiSettingsError, type PiSettingsPlan } from './pi-settings.js';
import type { SharedJsonSpec } from '../manifests/types.js';

export type SharedJsonPlan = ManagedJsonPlan | PiSettingsPlan;

export function planSharedJson(
  spec: SharedJsonSpec,
  existing: Uint8Array | null,
  fragment: Uint8Array
): SharedJsonPlan {
  try {
    if (spec.schema === 'managed-json-v1') return planManagedJson(existing, fragment, { managedKeys: spec.managedKeys });
    if (spec.schema === 'pi-settings-v1') {
      if (spec.managedKeys.length !== 1) throw new PiSettingsError('Pi shared settings requires exactly one managed key');
      return planPiSettings(existing, fragment, { managedKey: spec.managedKeys[0] });
    }
  } catch (error) {
    if (error instanceof ManagedJsonError || error instanceof PiSettingsError) {
      throw new ControlPlaneError('PUBLICATION_FAILED');
    }
    throw error;
  }
  throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
}
