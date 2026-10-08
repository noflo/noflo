// (c) 2021-2026 Henri Bergius
/**
 * Spec helper bridging the legacy EventEmitter-style listener contract
 * (handler receives the payload) onto the native EventTarget API, which
 * delivers a `DetailEvent`. Test-only sugar; the library surface is
 * addEventListener-only since the LegacyEventMixin removal (work
 * document #8).
 */

/**
 * @param {EventTarget} emitter
 * @param {string} type
 * @param {Function} handler - receives the event detail
 * @returns {Function} The registered native listener (for removeEventListener)
 */
export function listen(emitter, type, handler) {
  const listener = (event) => handler(event.detail, event);
  emitter.addEventListener(type, listener);
  return listener;
}

/**
 * @param {EventTarget} emitter
 * @param {string} type
 * @param {Function} handler - receives the event detail
 * @returns {Function} The registered native listener
 */
export function listenOnce(emitter, type, handler) {
  const listener = (event) => {
    emitter.removeEventListener(type, listener);
    handler(event.detail, event);
  };
  emitter.addEventListener(type, listener);
  return listener;
}

/**
 * @param {EventTarget} emitter
 * @param {string} type
 * @param {Function} listener - a listener previously returned by listen/listenOnce
 * @returns {void}
 */
export function unlisten(emitter, type, listener) {
  emitter.removeEventListener(type, listener);
}
