//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module debug
 * @description Packet-event logging for the host: subscribes to the
 *   network-host's lifecycle and IP events and prints them to stdout with
 *   minimal ANSI coloring. The cli-color dependency of the legacy host is
 *   gone — a handful of escape codes cover everything the output needs.
 */
/* @ts-self-types="./debug.d.ts" */

const colors = {
  reset: "\u001b[0m",
  green: "\u001b[32m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  red: "\u001b[31m",
  dim: "\u001b[2m",
};

/**
 * @param {string} text
 * @param {string} code
 * @returns {string}
 */
function paint(text, code) {
  if (!process.stdout.isTTY) {
    return text;
  }
  return `${code}${text}${colors.reset}`;
}

/**
 * Subscribe debug output to a running network host.
 *
 * @param {import("@noflo/runtime").NetworkHost} host
 * @param {object} [options]
 * @param {boolean} [options.verbose] Also log packet contents
 * @returns {() => void} A detach function
 */
export function addDebug(host, options = {}) {
  const listeners = /** @type {Array<[string, any]>} */ ([
    [
      "start",
      () => {
        console.log(paint("Network started", colors.green));
      },
    ],
    [
      "end",
      () => {
        const uptime = host.network?.uptime() ?? 0;
        console.log(
          paint(
            `Network stopped after ${Math.round(uptime / 1000)} seconds`,
            colors.green,
          ),
        );
      },
    ],
    [
      "process-error",
      (/** @type {any} */ event) => {
        const error = event.detail?.error ?? event.detail;
        console.error(
          paint(
            error?.message ? String(error.message) : String(error ?? "error"),
            colors.red,
          ),
        );
      },
    ],
    [
      "ip",
      (/** @type {any} */ event) => {
        const ip = event.detail ?? {};
        const socket = ip.socket ?? {};
        const from = socket.from
          ? `${socket.from.process.id}(${socket.from.port})`
          : "DATA";
        const to = socket.to
          ? `${socket.to.process.id}(${socket.to.port})`
          : "DATA";
        const subgraph = ip.subgraph?.length
          ? `${paint(ip.subgraph.join(":"), colors.magenta)} `
          : "";
        let line = `${subgraph}${paint(`${from} -> ${to}`, colors.blue)} ${ip.type ?? ""}`;
        if (options.verbose && ip.type === "data") {
          line += ` ${JSON.stringify(ip.data)}`;
        }
        console.log(line);
      },
    ],
  ]);
  for (const [event, listener] of listeners) {
    host.addEventListener(event, listener);
  }
  return () => {
    for (const [event, listener] of listeners) {
      host.removeEventListener(event, listener);
    }
  };
}
