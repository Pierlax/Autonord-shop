/**
 * Hooks Module — Public API
 */

export type { HookDefinition, HookEvent, HookHandler, KnownEvent } from './service';

export {
  seedDefaultHooks,
  registerHook,
  unregisterHook,
  listHooks,
  getHooksForEvent,
  emitEvent,
  onEvent,
  KNOWN_EVENTS,
} from './service';
