/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @description Preload fixture for CLI spawns under test (loaded via
 *   `node --import`): turns off RNS 1.6.1 announce/path-request stamp
 *   emission that reticulum-js 0.10.0 defaults to. A value-25.0 destination
 *   stamp mines for ~90 s even on the fast node:crypto engine, which would
 *   blow the CLI test's spawn timeout — and the stamp cache re-mines on
 *   every process start (no persistence), so every batch-mode spawn would
 *   pay it. Peers accept unstamped traffic (stamp enforcement is off
 *   everywhere by default). Production keeps the protocol defaults; only
 *   test spawns preload this module.
 */
import { TransportCore } from "@reticulum/core/src/transport/transport.js";

TransportCore.STAMP_DESTINATIONS = false;
TransportCore.STAMP_PATH_REQUESTS = false;
