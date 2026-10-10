/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/integration-rnsd.js
 * @description The true end-to-end verification (work document #28): two
 *   Reticulum instances on a real rnsd — one running the assembled FBP
 *   runtime, one acting as a protocol client — discovering each other
 *   through announce app_data, establishing a link, authenticating, and
 *   exchanging real protocol frames.
 *
 *   Opt-in: skipped unless `RUNTIME_E2E_RNSD` is set to the rnsd's TCP
 *   interface as `host:port` (a transport-mode rnsd reachable from this
 *   machine). Requires no build, no mocks: the announce is decoded through
 *   the protocol codec, the link handshake is Reticulum's, and every frame
 *   travels link-encrypted.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import {
  ANNOUNCE_ASPECT,
  CMD_AUTH_RESPONSE,
  CMD_COMP_MANIFEST,
  CMD_CRDT_STALE_EPOCH,
  decodeAnnounceAppData,
  decodeAuthResponse,
  decodeCompManifest,
  decodeCrdtStaleEpoch,
  encodeCompSyncReq,
  encodeCrdtSyncReq,
  PROTOCOL_VERSION,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import {
  Destination,
  Identity,
  LinkStatus,
  Packet,
  PacketType,
  Reticulum,
} from "@reticulum/core";
import { TCPClientInterface } from "@reticulum/node/src/interfaces/tcp.js";
import { assembleRuntime, bindReticulum } from "../src/index.js";
import { staticPolicy } from "./policy.js";

const RNSD = process.env.RUNTIME_E2E_RNSD;

/** The E2E suite only runs when an rnsd target is provided. */
const describeE2E = RNSD ? describe : describe.skip;

/**
 * @param {string} hostPort
 * @returns {{ host: string, port: number }}
 */
function parseTarget(hostPort) {
  const [host, port] = hostPort.split(":");
  return { host, port: Number(port || 4242) };
}

/**
 * Poll until the predicate holds or the deadline passes.
 *
 * @param {() => boolean} predicate
 * @param {number} timeoutMs
 * @param {string} what
 * @returns {Promise<void>}
 */
async function waitFor(predicate, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Build a Reticulum instance wired to the rnsd's TCP interface. */
async function instance(target, name) {
  const rns = new Reticulum({ logLevel: "warning" });
  const iface = new TCPClientInterface({
    name,
    host: target.host,
    port: target.port,
  });
  // The application connects its interfaces and marks the rnsd uplink as
  // the default: the leaf fallback routes replies (LRPROOFs, responses)
  // when no path entry exists yet.
  await iface.connect();
  rns.addInterface(iface, true);
  return rns;
}

describeE2E("FBP runtime over a real rnsd", () => {
  const target = parseTarget(/** @type {string} */ (RNSD));

  it("discovers, links, authenticates, and exchanges protocol frames", async () => {
    // --- The runtime under test: server side ---
    const serverRns = await instance(target, "fbp-runtime-e2e-server");
    //** @type {any} */
    let binding;
    try {
      const serverIdentity = await Identity.generate();
      const graph = new GraphModel({ name: "main" });
      graph.addNode({ entity_id: "node-1", component: "math/Add" });
      const runtime = await assembleRuntime({
        capabilityPolicy: staticPolicy(),
        graph,
        catalog: {
          signatures: () => ({
            "math/Add": {
              type: "elementary",
              in: [{ id: "a", type: "number" }],
              out: [{ id: "sum", type: "number" }],
            },
          }),
        },
        capabilities: [
          "GRAPH_READ",
          "GRAPH_EDIT",
          "TELEMETRY_READ",
          "COMPONENT_READ",
        ],
      });
      binding = await bindReticulum({
        runtime,
        reticulum: serverRns,
        identity: serverIdentity,
        nodeName: "e2e-runtime",
      });

      // --- The client: discovery through announce app_data (§3) ---
      const clientRns = await instance(target, "fbp-runtime-e2e-client");
      try {
        /** @type {{ destinationHash: Uint8Array, nodeName: string }|null} */
        let discovered = null;
        clientRns.transport.addEventListener(
          "announce",
          (/** @type {any} */ event) => {
            if (discovered || !event.detail.appData) {
              return;
            }
            try {
              const decoded = decodeAnnounceAppData(event.detail.appData);
              if (decoded.protocolVersion === PROTOCOL_VERSION) {
                discovered = {
                  destinationHash: decoded.destinationHash,
                  nodeName: decoded.nodeName,
                };
              }
            } catch {
              // Not an FBP announce; ignore.
            }
          },
        );
        await waitFor(
          () => discovered !== null,
          30_000,
          "the runtime's announce (check RUNTIME_E2E_RNSD reachability)",
        );
        assert.equal(
          /** @type {{ nodeName: string }} */ (discovered).nodeName,
          "e2e-runtime",
        );

        // --- Link establishment with zero-trust identity ---
        const clientIdentity = await Identity.generate();
        const destination = await Destination.recalled(
          ANNOUNCE_ASPECT,
          /** @type {{ destinationHash: Uint8Array }} */ (discovered)
            .destinationHash,
          clientRns,
        );
        const link = await destination.createLink();
        assert.equal(link.status, LinkStatus.ACTIVE);

        /** @type {Uint8Array[]} */
        const frames = [];
        link.addEventListener("data", (/** @type {any} */ event) => {
          frames.push(event.detail.packet.payload);
        });

        // The client identifies itself; the runtime unilaterally responds
        // with the 0x02 auth response (§4).
        await link.identify(clientIdentity);
        await waitFor(() => frames.length > 0, 15_000, "the auth response");
        const auth = decodeAuthResponse(frames[0]);
        assert.equal(auth.cmd, CMD_AUTH_RESPONSE);
        assert.equal(auth.protocolVersion, PROTOCOL_VERSION);
        assert.equal(auth.capabilityMask & 0x01, 0x01); // GRAPH_READ

        // --- Registry sync over the link (§6) ---
        await link.send(
          new Packet({
            packetType: PacketType.DATA,
            payload: encodeCompSyncReq("stale"),
          }),
        );
        await waitFor(() => frames.length > 1, 15_000, "the registry manifest");
        const manifest = decodeCompManifest(frames[1]);
        assert.equal(manifest.cmd, CMD_COMP_MANIFEST);
        assert.deepEqual(Object.keys(manifest.entries), ["math/Add"]);

        // --- Graph sync: stale epoch answers with a servable baseline (§5) ---
        await link.send(
          new Packet({
            packetType: PacketType.DATA,
            payload: encodeCrdtSyncReq("0000", {}),
          }),
        );
        await waitFor(() => frames.length > 2, 15_000, "the stale-epoch reply");
        const stale = decodeCrdtStaleEpoch(frames[2]);
        assert.equal(stale.cmd, CMD_CRDT_STALE_EPOCH);
        assert.notEqual(stale.newEpochId, "0000");

        // The resource token fetches the canonical graph baseline.
        const baseline = await link.request(stale.rnsResourceHash);
        const canonical = JSON.parse(new TextDecoder().decode(baseline));
        assert.equal(canonical.name, "main");
        assert.deepEqual(
          canonical.nodes.map((/** @type {any} */ n) => n.entity_id),
          ["node-1"],
        );
        await link.teardown();
      } finally {
        await clientRns.stop().catch(() => {});
      }
    } finally {
      binding.stop();
      await serverRns.stop().catch(() => {});
    }
  });
});
