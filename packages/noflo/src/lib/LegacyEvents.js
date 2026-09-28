/**
 * @file LegacyEvents module
 * @description EventTarget compatibility layer for the 1.x EventEmitter API.
 *
 *   NoFlo 2.x core classes inherit from the native `EventTarget` API.
 *   During the migration period this mixin provides the legacy EventEmitter
 *   surface (`on`, `once`, `off`, `removeListener`, `emit`, `listeners`) on
 *   top of `addEventListener`/`dispatchEvent`, with deprecation warnings
 *   (once per event type) guiding users toward native EventTarget usage.
 *
 *   Legacy handlers are invoked with the event's `detail` as their single
 *   argument, mirroring `emit(type, payload) → handler(payload)`.
 *
 *   The mixin also tracks listener registrations per event type — native
 *   ones included — because `EventTarget` exposes no listener count and the
 *   engine's error-escalation semantics ("no process-error listener ⇒
 *   throw") depend on it. Use {@link LegacyEventBase#listeners} or
 *   {@link LegacyEventBase#dispatchLifecycleEvent} instead of assuming
 *   EventEmitter internals.
 */

import { deprecated } from "./Platform.js";

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

/** Event types already warned about, so each deprecation logs once. */
const warned = new Set();

/**
 * @param {string} method
 * @param {string} type
 */
function warnOnce(method, type) {
  const key = `${method}:${type}`;
  if (warned.has(key)) return;
  warned.add(key);
  deprecated(
    `Using '${method}' (EventEmitter API) for '${type}' events is deprecated, use addEventListener/removeEventListener`,
  );
}

/**
 * Per-instance listener registry.
 * @typedef {Object} ListenerRegistry
 * @property {Map<string, Set<Function>>} active - event type → registered listener functions
 * @property {Map<string, { handler: Function, wrapper: Function }[]>} legacy - event type → legacy handler/wrapper pairs
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
    registry = { active: new Map(), legacy: new Map() };
    registries.set(instance, registry);
  }
  return registry;
}

/**
 * Apply the legacy EventEmitter API to an `EventTarget`-derived base class.
 *
 * @param {any} Base
 */
export function LegacyEventMixin(Base) {
  return class LegacyEventBase extends Base {
    /**
     * Track listener registrations, so `listeners()` can answer the
     * "is anyone listening" question EventTarget can't.
     *
     * @param {string} type
     * @param {Function} listener
     * @param {any} [options]
     */
    addEventListener(type, listener, options) {
      const registry = registryFor(this);
      if (!registry.active.has(type)) registry.active.set(type, new Set());
      registry.active.get(type).add(listener);
      super.addEventListener(type, listener, options);
    }

    /**
     * @param {string} type
     * @param {Function} listener
     * @param {any} [options]
     */
    removeEventListener(type, listener, options) {
      const registry = registryFor(this);
      registry.active.get(type)?.delete(listener);
      registry.legacy.set(
        type,
        (registry.legacy.get(type) || []).filter(
          (entry) => entry.wrapper !== listener,
        ),
      );
      super.removeEventListener(type, listener, options);
    }

    /**
     * Listeners registered for an event type, via either API. Only the
     * count is contractual (the engine's error escalation checks it); the
     * array shape is provided for 1.x compatibility.
     *
     * @param {string} type
     * @returns {Function[]}
     */
    listeners(type) {
      const registry = registryFor(this);
      return [...(registry.active.get(type) || [])];
    }

    /**
     * Legacy `on`. The handler receives the event `detail`.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    on(type, handler) {
      warnOnce("on", type);
      /** @param {DetailEvent} event */ const wrapper = (event) =>
        handler(event.detail);
      const registry = registryFor(this);
      if (!registry.legacy.has(type)) registry.legacy.set(type, []);
      registry.legacy.get(type).push({ handler, wrapper });
      this.addEventListener(type, wrapper);
      return this;
    }

    /**
     * Legacy `once`.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    once(type, handler) {
      warnOnce("once", type);
      /**
       * @param {DetailEvent} event
       */ const wrapper = (event) => {
        this.removeEventListener(type, wrapper);
        handler(event.detail);
      };
      const registry = registryFor(this);
      if (!registry.legacy.has(type)) registry.legacy.set(type, []);
      registry.legacy.get(type).push({ handler, wrapper });
      this.addEventListener(type, wrapper);
      return this;
    }

    /**
     * Legacy `off`.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    off(type, handler) {
      warnOnce("off", type);
      const registry = registryFor(this);
      const entries = registry.legacy.get(type) || [];
      const entry = entries.find((candidate) => candidate.handler === handler);
      if (entry) {
        this.removeEventListener(type, entry.wrapper);
      }
      return this;
    }

    /**
     * Legacy alias for `off`.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    removeListener(type, handler) {
      warnOnce("removeListener", type);
      return this.off(type, handler);
    }

    /**
     * Legacy `emit` for external callers. Internal engine code uses
     * {@link LegacyEventBase#dispatchLifecycleEvent} instead, which does
     * not warn.
     *
     * @param {string} type
     * @param {any} [detail]
     * @returns {boolean}
     */
    emit(type, detail) {
      warnOnce("emit", type);
      return this.dispatchEvent(makeDetailEvent(type, detail));
    }

    /**
     * Internal, clean-room dispatch used by 2.x code paths.
     *
     * @param {string} type
     * @param {any} [detail]
     * @returns {boolean}
     */
    dispatchLifecycleEvent(type, detail) {
      return this.dispatchEvent(makeDetailEvent(type, detail));
    }
  };
}

/**
 * Ready-made base: native EventTarget with the legacy API mixed in.
 * Core NoFlo classes extend this during the 1.x migration period.
 */
export const LegacyEventBase = LegacyEventMixin(EventTarget);
