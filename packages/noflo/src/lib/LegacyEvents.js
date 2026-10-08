/**
 * NoFlo - Flow-Based Programming for JavaScript
 * (c) 2021-2026 Henri Bergius
 * (c) 2013-2020 Flowhub UG
 * (c) 2011-2012 Henri Bergius, Nemein
 * NoFlo may be freely distributed under the MIT license
 *
 * @file LegacyEvents module
 * @description EventTarget support layer for NoFlo's engine classes. The
 *   public event registration API is the native one
 *   (`addEventListener`/`removeEventListener`); the legacy EventEmitter
 *   surface (`on`, `once`, `emit`, and friends) was removed for 2.0.0
 *   (work document #8).
 *
 *   What remains is the internal machinery the engine needs and native
 *   `EventTarget` cannot provide:
 *
 *   - A per-instance listener registry enabling **synchronous, ordered
 *     dispatch with exception propagation**
 *     ({@link LegacyEventBase#dispatchLifecycleEvent}): Node's
 *     `dispatchEvent` isolates listener exceptions (surfacing them as
 *     uncaught exceptions) instead of propagating them synchronously to
 *     the caller. NoFlo's error semantics depend on synchronous
 *     propagation — a listener throw must reach the dispatcher so the
 *     socket/network error-escalation chain works.
 *   - **Listener-count queries** ({@link LegacyEventBase#listeners}):
 *     the escalation contract (work document #8, P2) throws process
 *     errors when nobody is listening, which requires knowing whether
 *     any listener is registered — a question `EventTarget` cannot
 *     answer.
 *   - **Bulk removal** ({@link LegacyEventBase#removeAllListeners}),
 *     since `EventTarget` cannot enumerate listeners either.
 *
 *   Listeners registered through `addEventListener` receive the
 *   dispatched `DetailEvent`, with the payload in its `detail` property.
 */

/* @ts-self-types="./LegacyEvents.d.ts" */

/**
 * CustomEvent fallback for runtimes predating the global constructor.
 * @typedef {Event & { detail: any }} DetailEvent
 */
const makeDetailEvent =
  typeof globalThis.CustomEvent === "function"
    ? (type, detail) =>
        new globalThis.CustomEvent(type, {
          detail,
          bubbles: false,
          composed: false,
        })
    : (type, detail) => {
        const event = new Event(type, { bubbles: false, composed: false });
        /** @type {DetailEvent} */ (event).detail = detail;
        return event;
      };

/**
 * Per-instance listener registry.
 * @typedef {Object} ListenerRegistry
 * @property {Map<string, { listener: Function, once: boolean }[]>} active - event type → registrations in order
 */

/** @type {WeakMap<object, ListenerRegistry>} */
const registries = new WeakMap();

/**
 * @param {object} instance
 * @returns {ListenerRegistry}
 */
function registryFor(instance) {
  let registry = registries.get(instance);
  if (!registry) {
    registry = { active: new Map() };
    registries.set(instance, registry);
  }
  return registry;
}

/**
 * Apply the EventTarget support layer to an `EventTarget`-derived base
 * class.
 *
 * @param {any} Base
 */
export function LegacyEventMixin(Base) {
  return class LegacyEventBase extends Base {
    /**
     * Track listener registrations, so `listeners()` can answer the
     * "is anyone listening" question EventTarget can't, and so
     * `dispatchLifecycleEvent` can invoke listeners synchronously.
     *
     * @param {string} type
     * @param {Function} listener
     * @param {any} [options]
     */
    addEventListener(type, listener, options) {
      const registry = registryFor(this);
      if (!registry.active.has(type)) registry.active.set(type, []);
      const listeners = /** @type {{ listener: Function, once: boolean }[]} */ (
        registry.active.get(type)
      );
      // Mirror the EventTarget de-duplication of identical listener functions
      if (listeners.some((entry) => entry.listener === listener)) {
        return;
      }
      const once =
        typeof options === "object" && options !== null && options.once;
      listeners.push({ listener, once });
      super.addEventListener(type, listener, options);
    }

    /**
     * @param {string} type
     * @param {Function} listener
     * @param {any} [options]
     */
    removeEventListener(type, listener, options) {
      const registry = registryFor(this);
      const listeners = registry.active.get(type);
      if (listeners) {
        const index = listeners.findIndex(
          (entry) => entry.listener === listener,
        );
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
      super.removeEventListener(type, listener, options);
    }

    /**
     * Listeners registered for an event type. The count is the contractual
     * part (the engine's error escalation checks it); the array is provided
     * for introspection.
     *
     * @param {string} type
     * @returns {Function[]}
     */
    listeners(type) {
      const registry = registryFor(this);
      return (registry.active.get(type) || []).map((entry) => entry.listener);
    }

    /**
     * Remove registrations for one event type, or for all types when no
     * type is given. `EventTarget` cannot enumerate listeners, so the
     * registry provides the removal path.
     *
     * @param {string} [type]
     * @returns {this}
     */
    removeAllListeners(type) {
      const registry = registryFor(this);
      const types = type ? [type] : [...registry.active.keys()];
      for (const eventType of types) {
        for (const entry of [...(registry.active.get(eventType) || [])]) {
          this.removeEventListener(eventType, entry.listener);
        }
      }
      return this;
    }

    /**
     * Internal, clean-room dispatch used by engine code paths. Invokes the
     * registered listeners synchronously, in registration order, letting
     * listener exceptions propagate to the caller (matching the
     * synchronous propagation NoFlo's error escalation relies on).
     *
     * @param {string} type
     * @param {any} [detail]
     * @returns {boolean}
     */
    dispatchLifecycleEvent(type, detail) {
      const registry = registryFor(this);
      const listeners = registry.active.get(type) || [];
      if (!listeners.length) {
        return false;
      }
      const event = makeDetailEvent(type, detail);
      // Snapshot: a listener may remove itself or others during dispatch
      for (const entry of [...listeners]) {
        if (entry.once) {
          this.removeEventListener(type, entry.listener);
        }
        entry.listener(event);
      }
      return true;
    }
  };
}

/** Ready-made EventTarget base for classes that have no other base class. */
export const LegacyEventBase = LegacyEventMixin(EventTarget);
