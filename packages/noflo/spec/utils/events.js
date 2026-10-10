import IP from "../../src/lib/IP.js";

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

/**
 * Drive an `openBracket` IP into a socket without the auto-disconnect
 * behavior of `post` — test sequences stay in explicit control of
 * connection framing.
 *
 * @param {import("../../src/lib/InternalSocket.js").InternalSocket} socket
 * @param {any} data - the group name carried by the bracket
 * @returns {void}
 */
export function openBracket(socket, data) {
  socket.post(new IP("openBracket", data), false);
}

/**
 * Drive a `data` IP into a socket without the auto-disconnect behavior of
 * `post`.
 *
 * @param {import("../../src/lib/InternalSocket.js").InternalSocket} socket
 * @param {any} data
 * @returns {void}
 */
export function sendData(socket, data) {
  socket.post(new IP("data", data), false);
}

/**
 * Drive a `closeBracket` IP into a socket without the auto-disconnect
 * behavior of `post`.
 *
 * @param {import("../../src/lib/InternalSocket.js").InternalSocket} socket
 * @returns {void}
 */
export function closeBracket(socket) {
  socket.post(new IP("closeBracket"), false);
}

/**
 * Listen for the `data` packets of a socket's `ip` stream, delivering the
 * packet payload to the handler. Bracket IPs are filtered out.
 *
 * @param {import("../../src/lib/InternalSocket.js").InternalSocket} socket
 * @param {Function} handler - receives the data payload
 * @returns {Function} The registered native listener
 */
export function listenData(socket, handler) {
  const listener = (event) => {
    if (event.detail.type !== "data") {
      return;
    }
    handler(event.detail.data, event.detail);
  };
  socket.addEventListener("ip", listener);
  return listener;
}

/**
 * Listen for the first `data` packet of a socket's `ip` stream. Bracket IPs
 * do not consume the one-shot registration.
 *
 * @param {import("../../src/lib/InternalSocket.js").InternalSocket} socket
 * @param {Function} handler - receives the data payload
 * @returns {Function} The registered native listener
 */
export function listenDataOnce(socket, handler) {
  const listener = (event) => {
    if (event.detail.type !== "data") {
      return;
    }
    socket.removeEventListener("ip", listener);
    handler(event.detail.data, event.detail);
  };
  socket.addEventListener("ip", listener);
  return listener;
}

/**
 * Collect an IP sequence from a socket in the compact token format the
 * sequence assertions use: `CONN`/`DISC` for connection framing,
 * `< ${data}` for open brackets, `DATA ${data}` for data packets, and `>`
 * for close brackets. The group name of a closing bracket is not part of
 * the token.
 *
 * @param {import("../../src/lib/InternalSocket.js").InternalSocket} socket
 * @param {Array<string>} received - array the tokens are pushed into
 * @returns {void}
 */
export function listenIPSequence(socket, received) {
  listen(socket, "connect", () => {
    received.push("CONN");
  });
  listen(socket, "disconnect", () => {
    received.push("DISC");
  });
  listen(socket, "ip", (event) => {
    if (event.type === "openBracket") {
      received.push(`< ${event.data}`);
    } else if (event.type === "closeBracket") {
      received.push(">");
    } else if (event.type === "data") {
      received.push(`DATA ${event.data}`);
    }
  });
}
