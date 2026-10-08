/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @module @noflo/runtime
 * @description `@noflo/runtime` — an isomorphic FBP Protocol 2.0 runtime for
 *   NoFlo over Reticulum (work document #28): wires the 2.x engine (native
 *   graph model, component registry, networks) to the wire format of
 *   `@noflo/fbp-protocol`, transported over Reticulum links. Runs on servers
 *   and in browsers under the no-build contract (work document #18); the
 *   application supplies its own `Reticulum` instance with whichever
 *   network interfaces suit the platform.
 */

/* @ts-self-types="./index.d.ts" */

export { RegistryProtocol } from "./registry-protocol.js";
export { capabilitiesMask, RuntimeServer } from "./runtime-server.js";
