//     @noflo/runtime - FBP Protocol 2.0 runtime over Reticulum
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @module guards
 * @description The Tier A runtime guard diagnostics (work document #37 §6):
 *   packets entering the runtime over the wire are checked against the
 *   target port's in-band guard with comparisons alone — no schema body is
 *   ever loaded, no validator module exists here. Violations are
 *   diagnostic-only: convergence integrity outranks schema enforcement, so
 *   an invalid insert is never structurally rejected; the runtime records
 *   it (telemetry `0x04 ERROR` flowtrace events or LXMF `[errors]`, per
 *   local policy).
 */

/* @ts-self-types="./guards.d.ts" */

import { checkGuard } from "@noflo/fbp-protocol";

/**
 * Resolve the in-band guard of a port in a component signature.
 *
 * @typedef {(component: string, port: string, isInport: boolean) => import("@noflo/fbp-protocol").PortInfo|null} SignatureResolver
 */

/**
 * Check one packet value against the guard the signature resolver finds
 * for the target port. Returns the verdict; the caller decides how to
 * record it and never how to reject the packet.
 *
 * @param {object} options
 * @param {SignatureResolver|null} options.resolveSignature The catalog lookup;
 *   null when the runtime has no signature for the component (guards are
 *   simply unchecked — absence is not a violation).
 * @param {string} options.component The target node's component.
 * @param {string} options.port The target port name.
 * @param {boolean} options.isInport
 * @param {any} options.value The packet value.
 * @returns {{ checked: boolean, ok: boolean, detail?: string }} `checked` is
 *   false when no guard applies (no signature, no guard field, or a value
 *   the guard vocabulary cannot speak about).
 */
export function checkPacketGuard({
  resolveSignature,
  component,
  port,
  isInport,
  value,
}) {
  if (!resolveSignature) {
    return { checked: false, ok: true };
  }
  const signature = resolveSignature(component, port, isInport);
  const guard = signature?.guard;
  if (!guard) {
    return { checked: false, ok: true };
  }
  const ok = checkGuard(guard, value);
  return ok
    ? { checked: true, ok: true }
    : {
        checked: true,
        ok: false,
        detail: `value fails the port's in-band guard for ${component}.${port} (${JSON.stringify(guard)})`,
      };
}
