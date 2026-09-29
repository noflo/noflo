/**
 * @file LegacyEvents module
 * @description EventTarget compatibility layer for the 1.x EventEmitter API.
 *
 *   NoFlo 2.x core classes use the native `EventTarget` registration API
 *   (`addEventListener`/`removeEventListener`). During the migration period
 *   this mixin provides the legacy EventEmitter surface (`on`, `once`,
 *   `off`, `removeListener`, `emit`, `listeners`) on top, with deprecation
 *   warnings (once per event type) guiding users toward native usage.
 *
 *   Dispatching intentionally does NOT go through the native
 *   `dispatchEvent`: Node's EventTarget isolates listener exceptions
 *   (surfacing them as uncaught exceptions) instead of propagating them
 *   synchronously to the caller like EventEmitter's `emit`. NoFlo's error
 *   semantics depend on synchronous propagation — a listener throw must
 *   reach the dispatcher so the socket/network error-escalation chain
 *   works. {@link LegacyEventBase#dispatchLifecycleEvent} therefore invokes
 *   registered listeners itself, synchronously and in registration order.
 *
 *   Legacy handlers are invoked with the event's `detail` as their single
 *   argument and with the emitter as `this`, mirroring
 *   `emit(type, payload) → handler.call(emitter, payload)`.
 *
 *   The mixin tracks listener registrations per event type — native ones
 *   included — because the engine's error-escalation semantics ("no
 *   process-error listener ⇒ throw") depend on knowing the count.
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
 * Validate the legacy listener contract, matching EventEmitter's behavior
 * of rejecting non-function listeners.
 *
 * @param {Function} handler
 * @param {string} method
 */
function assertListener(handler, method) {
  if (typeof handler !== "function") {
    throw new TypeError(
      `The "${method}" handler must be a function. Received ${typeof handler}`,
    );
  }
}

/**
 * Per-instance listener registry.
 * @typedef {Object} ListenerRegistry
 * @property {Map<string, { listener: Function, once: boolean }[]>} active - event type → registrations in order
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
     * "is anyone listening" question EventTarget can't, and so
     * `dispatchLifecycleEvent` can invoke listeners synchronously.
     * An internal `prepend` option inserts at the front of the dispatch
     * order (used by the legacy prependListener methods).
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
      const entry = { listener, once };
      if (typeof options === "object" && options !== null && options.prepend) {
        listeners.unshift(entry);
      } else {
        listeners.push(entry);
      }
      super.addEventListener(type, listener, options);
    }

    /**
     * @param {string} type
     * @param {Function} listener
     * @param {any} [options]
     */
    removeEventListener(type, listener, options) {
      // Note: listeners registered with { once: true } and dispatched via
      // the *native* dispatchEvent are removed by the platform without
      // going through this override, leaving the tracked registry stale
      // (listeners() may over-report until the entry is re-registered).
      // Engine code dispatches via dispatchLifecycleEvent, which keeps
      // the registry accurate; treat native dispatching of engine events
      // as unsupported.
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
      return (registry.active.get(type) || []).map((entry) => entry.listener);
    }

    /**
     * Legacy `on`. The handler receives the event `detail`.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    on(type, handler, registrationOptions) {
      warnOnce("on", type);
      assertListener(handler, "on");
      /** @param {DetailEvent} event */ const wrapper = (event) =>
        handler.call(this, event.detail);
      const registry = registryFor(this);
      if (!registry.legacy.has(type)) registry.legacy.set(type, []);
      registry.legacy.get(type).push({ handler, wrapper });
      this.addEventListener(type, wrapper, registrationOptions);
      return this;
    }

    /**
     * Legacy `once`.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    once(type, handler, registrationOptions) {
      warnOnce("once", type);
      assertListener(handler, "once");
      /**
       * @param {DetailEvent} event
       */ const wrapper = (event) => {
        this.removeEventListener(type, wrapper);
        handler.call(this, event.detail);
      };
      const registry = registryFor(this);
      if (!registry.legacy.has(type)) registry.legacy.set(type, []);
      registry.legacy.get(type).push({ handler, wrapper });
      this.addEventListener(type, wrapper, registrationOptions);
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
      assertListener(handler, "off");
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
      assertListener(handler, "removeListener");
      return this.off(type, handler);
    }

    /**
     * Legacy `removeAllListeners`: remove registrations for one event type,
     * or for all types when no type is given.
     *
     * @param {string} [type]
     * @returns {this}
     */
    removeAllListeners(type) {
      const registry = registryFor(this);
      const types = type ? [type] : [...registry.active.keys()];
      for (const eventype of types) {
        for (const entry of [...(registry.active.get(eventype) || [])]) {
          this.removeEventListener(eventype, entry.listener);
        }
        registry.legacy.set(eventype, []);
      }
      return this;
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
      // Match EventEmitter's special handling of 'error': throwing when
      // no listener is registered
      if (type === "error" && this.listeners("error").length === 0) {
        throw detail instanceof Error ? detail : new Error(String(detail));
      }
      return this.dispatchLifecycleEvent(type, detail);
    }

    /**
     * Legacy `listenerCount`.
     *
     * @param {string} type
     * @returns {number}
     */
    listenerCount(type) {
      return this.listeners(type).length;
    }

    /**
     * Legacy `eventNames`.
     *
     * @returns {string[]}
     */
    eventNames() {
      const registry = registryFor(this);
      return [...registry.active.keys()].filter(
        (eventype) => (registry.active.get(eventype) || []).length > 0,
      );
    }

    /**
     * Legacy no-op (EventTarget has no listener limit).
     *
     * @returns {this}
     */
    setMaxListeners() {
      return this;
    }

    /**
     * Legacy `prependListener`: register at the front of the dispatch order.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    prependListener(type, handler) {
      warnOnce("prependListener", type);
      return this.on(type, handler, { prepend: true });
    }

    /**
     * Legacy `prependOnceListener`.
     *
     * @param {string} type
     * @param {Function} handler
     * @returns {this}
     */
    prependOnceListener(type, handler) {
      warnOnce("prependOnceListener", type);
      return this.once(type, handler, { prepend: true });
    }

    /**
     * Legacy `rawListeners`: the wrapper functions actually invoked.
     *
     * @param {string} type
     * @returns {Function[]}
     */
    rawListeners(type) {
      return this.listeners(type);
    }

    /**
     * Internal, clean-room dispatch used by engine code paths. Invokes the
     * registered listeners synchronously, in registration order, letting
     * listener exceptions propagate to the caller (matching EventEmitter
     * semantics that NoFlo's error escalation relies on).
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

/**
 * Ready-made base: native EventTarget with the legacy API mixed in.
 * Core NoFlo classes extend this during the 1.x migration period.
 */
export const LegacyEventBase = LegacyEventMixin(EventTarget);
