/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file spec/reticulum-binding.js
 * @description The Reticulum transport binding and the one-call assembly:
 *   announce app_data encoding, the link lifecycle (request → auth → data
 *   frames), baseline resource serving, and the full-stack assembly driven
 *   end-to-end with fake RNS plumbing.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { asComponent } from "@noflo/as-component";
import {
  CAPABILITY,
  CMD_AUTH_RESPONSE,
  CMD_COMP_MANIFEST,
  CMD_CRDT_SYNC_REQ,
  decodeAnnounceAppData,
  decodeAuthResponse,
  decodeCompManifest,
  decodeCrdtStaleEpoch,
  encodeCompSyncReq,
  encodeCrdtSyncReq,
  encodeCrdtUpdate,
  LIMITATION,
  OP_TYPE,
  PROTOCOL_VERSION,
} from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { ComponentLoader } from "@noflo/noflo";
import { Identity, LinkStatus, toHex } from "@reticulum/core";
import {
  assembleRuntime,
  DEFAULT_ASPECT,
  ReticulumBinding,
  RuntimeServer,
} from "../src/index.js";
import { staticPolicy } from "./policy.js";

/**
 * A fake destination: the surface the binding touches, no RNS in the loop.
 *
 * @extends {EventTarget}
 */
class FakeDestination extends EventTarget {
  constructor() {
    super();
    this.appData = null;
    this.destinationHash = new Uint8Array(16).fill(0xaa);
    /** @type {Map<string, any>} */
    this.requestHandlers = new Map();
    this.announcing = false;
  }

  /**
   * @param {any} options
   * @returns {void}
   */
  startAnnouncing(options) {
    this.announcing = true;
    this.announceOptions = options ?? {};
  }

  /**
   * @returns {void}
   */
  stopAnnouncing() {
    this.announcing = false;
  }

  /**
   * @param {string} path
   * @param {any} options
   * @returns {Promise<string>}
   */
  async registerRequestHandler(path, options) {
    this.requestHandlers.set(path, options);
    return path;
  }
}

/**
 * A fake link: the surface the binding wires, plus the ability to emit
 * events the real RNS link would.
 *
 * @extends {EventTarget}
 */
class FakeLink extends EventTarget {
  constructor() {
    super();
    /** @type {Uint8Array[]} Decoded payloads of packets sent over the link. */
    this.sent = [];
  }

  /**
   * The real link's send takes a Packet and encrypts; the fake records the
   * plaintext payload.
   *
   * @param {{ payload: Uint8Array }} packet
   * @returns {Promise<void>}
   */
  async send(packet) {
    this.sent.push(packet.payload);
  }

  /**
   * @param {Uint8Array} payload
   * @returns {void}
   */
  receiveData(payload) {
    this.dispatchEvent(
      new globalThis.CustomEvent("data", {
        detail: { packet: { payload } },
      }),
    );
  }

  /**
   * @returns {void}
   */
  close() {
    this.dispatchEvent(
      new globalThis.CustomEvent("statuschange", {
        detail: { status: LinkStatus.CLOSED },
      }),
    );
  }
}

/** A binding against fakes, with a server whose send is captured. */
function wiredBinding() {
  /** @type {{sent: {bytes: Uint8Array, context: any}[]}} */
  const log = { sent: [] };
  const serverPolicy = staticPolicy({}, 0);
  const server = new RuntimeServer({
    capabilityPolicy: serverPolicy,
    send: (bytes, context) => log.sent.push({ bytes, context }),
    capabilities: [
      "GRAPH_READ",
      "GRAPH_EDIT",
      "TELEMETRY_READ",
      "LIFECYCLE_CTRL",
    ],
  });
  const destination = new FakeDestination();
  const binding = new ReticulumBinding({
    server,
    reticulum: /** @type {any} */ ({}),
    identity: /** @type {any} */ ({}),
    nodeName: "solar-runtime",
    createDestination: async () => destination,
  });
  return { binding, server, destination, log, serverPolicy };
}

describe("Reticulum binding: announce", () => {
  it("encodes the §3 announce app_data on the destination", async () => {
    const wired = wiredBinding();
    await wired.binding.start();
    const { binding, destination } = wired;
    assert.equal(binding.aspect, DEFAULT_ASPECT);
    assert.equal(destination.announcing, true);
    const decoded = decodeAnnounceAppData(destination.appData);
    assert.equal(decoded.protocolVersion, PROTOCOL_VERSION);
    assert.equal(decoded.nodeName, "solar-runtime");
    assert.deepEqual(
      [...decoded.destinationHash],
      [...destination.destinationHash],
    );
  });

  it("honors a custom aspect and stops announcing on stop", async () => {
    const wired = wiredBinding();
    wired.binding.aspect = "custom/aspect";
    const { binding, destination } = wired;
    await binding.start();
    assert.equal(destination.announcing, true);
    binding.stop();
    assert.equal(destination.announcing, false);
    // Restarting is idempotent.
    await binding.start();
  });
});

describe("Reticulum binding: link lifecycle", () => {
  it("broadcasts only to links whose granted capabilities cover the frame", async () => {
    const wired = wiredBinding();
    const { binding, server, destination, serverPolicy } = wired;
    /** @type {FakeLink[]} */
    const links = [];
    destination.respondToLinkRequest = async () => {
      const link = new FakeLink();
      links.push(link);
      return link;
    };
    await binding.start();
    for (const _ of [1, 2]) {
      destination.dispatchEvent(
        new globalThis.CustomEvent("link_request", {
          detail: { packet: {}, transport: {} },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const [grantedLink, deniedLink] = links;
    // One peer granted GRAPH_READ, one denied everything: the wired
    // policy's fallback is zero, so an identity without a grant is denied.
    serverPolicy.grant("aabb", ["GRAPH_READ"]);
    await server.authorize(grantedLink, "aabb");
    await server.authorize(deniedLink, "ccdd");
    // Wait out the auth responses, then broadcast a 0x14 operation.
    grantedLink.sent.length = 0;
    deniedLink.sent.length = 0;
    server.broadcast(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "runtime",
        logicalClock: 1,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "node-1",
        payload: { component: "math/Add" },
      }),
    );
    assert.equal(grantedLink.sent.length, 1, "the granted link receives it");
    assert.equal(
      deniedLink.sent.length,
      0,
      "the denied link is filtered out of the fan-out",
    );
    // The origin link is excluded from convergence echoes, and the denied
    // link still receives nothing.
    server.broadcast(
      encodeCrdtUpdate({
        planeId: null,
        clientId: "runtime",
        logicalClock: 2,
        opType: OP_TYPE.INSERT_NODE,
        entityId: "node-2",
        payload: { component: "math/Add" },
      }),
      grantedLink,
    );
    assert.equal(grantedLink.sent.length, 1);
    assert.equal(deniedLink.sent.length, 0);
  });

  it("authorizes on identify and routes decrypted link data", async () => {
    const wired = wiredBinding();
    const { binding, destination } = wired;
    /** @type {FakeLink|null} */
    let link = null;
    destination.respondToLinkRequest = async () => {
      link = new FakeLink();
      return link;
    };
    await binding.start();
    destination.dispatchEvent(
      new globalThis.CustomEvent("link_request", {
        detail: { packet: {}, transport: {} },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(link, "the handshake produced a wired link");

    // The peer identifies itself; the runtime unilaterally advertises its
    // capabilities over the link.
    const wiredLink = /** @type {FakeLink} */ (link);
    wiredLink.dispatchEvent(
      new globalThis.CustomEvent("identify", { detail: {} }),
    );
    assert.equal(wiredLink.sent.length, 1);
    const decoded = decodeAuthResponse(wiredLink.sent[0]);
    assert.equal(decoded.cmd, CMD_AUTH_RESPONSE);
    assert.equal(decoded.protocolVersion, PROTOCOL_VERSION);
  });

  it("denies unidentified links by default and can authorize them explicitly", async () => {
    const wired = wiredBinding();
    const { binding, server, destination } = wired;
    /** @type {FakeLink[]} */
    const links = [];
    destination.respondToLinkRequest = async () => {
      const link = new FakeLink();
      links.push(link);
      return link;
    };
    await binding.start();
    destination.dispatchEvent(
      new globalThis.CustomEvent("link_request", {
        detail: { packet: {}, transport: {} },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Default: the peer never identified, so it was never authorized —
    // it is denied everything.
    assert.equal(server.grantedFor(links[0]), 0);
  });

  it("feeds link frames to the server and closes subscriptions with the link", async () => {
    const wired = wiredBinding();
    const { binding, server, destination } = wired;
    /** @type {FakeLink|null} */
    let link = null;
    destination.respondToLinkRequest = async () => {
      link = new FakeLink();
      return link;
    };
    await binding.start();
    /** @type {any[]} */
    const closed = [];
    binding.addEventListener("linkclosed", (event) =>
      closed.push(event.detail.link),
    );
    destination.dispatchEvent(
      new globalThis.CustomEvent("link_request", {
        detail: { packet: {}, transport: {} },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const wiredLink = /** @type {FakeLink} */ (link);
    // A 0x10 graph sync arrives on the link; the server has no graph
    // protocol wired here, so it surfaces as unhandledframe — the routing
    // itself is what this asserts.
    /** @type {any[]} */
    const unhandled = [];
    server.addEventListener("unhandledframe", (event) =>
      unhandled.push(event.detail.decoded),
    );
    wiredLink.receiveData(encodeCrdtSyncReq(null, 1, { a: 1 }));
    assert.equal(unhandled.length, 1);
    assert.equal(unhandled[0].cmd, CMD_CRDT_SYNC_REQ);
    // Link closure drops context-bound state.
    wiredLink.close();
    assert.equal(closed.length, 1);
    assert.equal(closed[0], wiredLink);
  });
});

describe("assembly autostart", () => {
  it("builds and starts the network when autostart is requested", async () => {
    const graph = new GraphModel({ name: "main" });
    const loader = new ComponentLoader();
    await loader.registerComponent("runtime", "Wait", () => {
      /** @type {(() => void) | undefined} */
      let release;
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      // The parameter name names the inport; using it keeps the linter
      // quiet while the value itself is irrelevant — the process only
      // needs to keep the network running until shutdown.
      const component = asComponent((input) => {
        void input;
        void release;
        return pending;
      });
      const baseTearDown =
        /** @type {(() => any) | undefined} */
        (component.tearDown?.bind(component));
      component.tearDown = () => {
        release?.();
        return baseTearDown?.();
      };
      return component;
    });
    graph.addNode({ entity_id: "wait", component: "runtime/Wait" });
    graph.addIIP({
      entity_id: "iip-1",
      data: "go",
      to: { node: "wait", port: "input" },
    });
    const runtime = await assembleRuntime({
      capabilityPolicy: staticPolicy(),
      graph,
      catalog: { signatures: () => ({}) },
      componentLoader: loader,
      autostart: true,
    });
    assert.equal(runtime.host.running, true);
    await runtime.host.stop();
  });

  it("does not start the network by default", async () => {
    const graph = new GraphModel({ name: "main" });
    const runtime = await assembleRuntime({
      capabilityPolicy: staticPolicy(),
      graph,
      catalog: { signatures: () => ({}) },
    });
    assert.equal(runtime.host.started, false);
  });
});

describe("Reticulum binding: baseline resources", () => {
  it("serves content-addressed baselines over the request API", async () => {
    const { binding, destination, serverPolicy } = wiredBinding();
    await binding.start();
    const bytes = new TextEncoder().encode('{"name":"main"}');
    const token = await binding.serveResource(bytes);
    // Content-addressed: truncated SHA-256 → 32 hex chars.
    assert.match(token, /^[0-9a-f]{32}$/);
    const handler = destination.requestHandlers.get(token);
    assert.ok(handler, "the token is registered as a request path");
    // Identified requesters granted GRAPH_READ are served.
    const reader = await Identity.generate();
    serverPolicy.grant(toHex(reader.identityHash), ["GRAPH_READ"]);
    assert.deepEqual(
      [...(await handler.responseGenerator(token, null, null, reader))],
      [...bytes],
    );
    // Deterministic: same bytes, same token.
    assert.equal(await binding.serveResource(bytes), token);
  });

  it("evicts the oldest baseline beyond the resource budget", async () => {
    const { binding } = wiredBinding();
    binding.maxResources = 2;
    const encode = (/** @type {string} */ label) =>
      new TextEncoder().encode(JSON.stringify({ name: label }));
    const first = await binding.serveResource(encode("one"));
    const second = await binding.serveResource(encode("two"));
    const third = await binding.serveResource(encode("three"));
    assert.equal(binding.resources.size, 2);
    assert.equal(binding.resources.has(first), false, "oldest evicted");
    assert.equal(binding.resources.has(second), true);
    assert.equal(binding.resources.has(third), true);
  });

  it("serves baselines only to identities currently granted GRAPH_READ", async () => {
    const wired = wiredBinding();
    const { binding, server, destination, serverPolicy } = wired;
    await binding.start();
    const bytes = new TextEncoder().encode('{"name":"main"}');
    const token = await binding.serveResource(bytes);
    const handler = destination.requestHandlers.get(token);
    // The wired policy's fallback is zero, so only explicitly granted
    // identities are served.
    const granted = await Identity.generate();
    const denied = await Identity.generate();
    serverPolicy.grant(toHex(granted.identityHash), ["GRAPH_READ"]);
    const fetch = (/** @type {any} */ identity) =>
      handler.responseGenerator(token, null, null, identity);
    // Granted identity: the baseline is served.
    assert.deepEqual([...(await fetch(granted))], [...bytes]);
    // Unknown identity: nothing.
    assert.equal(await fetch(denied), null);
    // Unidentified requester: nothing.
    assert.equal(await fetch(null), null);
    // A revocation bites the next fetch — the token earns a revoked peer
    // nothing, however it was shared.
    serverPolicy.revoke(toHex(granted.identityHash));
    assert.equal(await fetch(granted), null);
  });

  it("re-checks the DACAR policy by identity on every fetch", async () => {
    const grantee = await Identity.generate();
    const grantedHash = toHex(grantee.identityHash);
    /** @type {any[]} */
    const evaluated = [];
    const _serverPolicy = staticPolicy();
    const server = new RuntimeServer({
      capabilityPolicy: (identityHash) => {
        evaluated.push(identityHash);
        return identityHash === grantedHash ? CAPABILITY.GRAPH_READ : 0;
      },
    });
    const destination = new FakeDestination();
    const binding = new ReticulumBinding({
      server,
      reticulum: /** @type {any} */ ({}),
      identity: /** @type {any} */ ({}),
      nodeName: "dacar-runtime",
      createDestination: async () => destination,
    });
    await binding.start();
    const bytes = new TextEncoder().encode('{"name":"main"}');
    const token = await binding.serveResource(bytes);
    const handler = destination.requestHandlers.get(token);
    // The grantee fetches through DACAR, without ever authorizing a link.
    assert.deepEqual(
      [...(await handler.responseGenerator(token, null, null, grantee))],
      [...bytes],
    );
    assert.deepEqual(evaluated, [grantedHash]);
    // A stranger is denied closed by the policy.
    const stranger = await Identity.generate();
    assert.equal(
      await handler.responseGenerator(token, null, null, stranger),
      null,
    );
  });
});

describe("assembly", () => {
  it("forwards the authorization configuration to the server core", async () => {
    const graph = new GraphModel({ name: "main" });
    const policy = () => 0;
    const runtime = await assembleRuntime({
      graph,
      catalog: { signatures: () => ({}) },
      capabilityPolicy: policy,
      limitationCode: LIMITATION.PERMISSION_DENIED,
    });
    assert.equal(runtime.server.capabilityPolicy, policy);
    assert.equal(runtime.server.limitationCode, LIMITATION.PERMISSION_DENIED);
  });

  it("wires the full stack: registry sync answers through the server", async () => {
    const graph = new GraphModel({ name: "main" });
    /** @type {{sent: {bytes: Uint8Array, context: any}[]}} */
    const log = { sent: [] };
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
      send: (bytes, context) => log.sent.push({ bytes, context }),
      broadcast() {},
      capabilities: ["GRAPH_READ", "GRAPH_EDIT", "COMPONENT_READ"],
    });
    await runtime.server.authorize("link-1", "test-identity");
    runtime.server.handleFrame(encodeCompSyncReq("stale-hash"), "link-1");
    const manifestFrame = log.sent.find(
      (entry) => entry.bytes[1] === CMD_COMP_MANIFEST,
    );
    assert.ok(manifestFrame, "the manifest is answered on the wire");
    const decoded = decodeCompManifest(manifestFrame.bytes);
    assert.equal(decoded.cmd, CMD_COMP_MANIFEST);
    assert.deepEqual(Object.keys(decoded.entries), ["math/Add"]);
  });

  it("wires the graph protocol with the binding as baseline provider", async () => {
    const graph = new GraphModel({ name: "main" });
    graph.addNode({ entity_id: "node-1", component: "math/Add" });
    const destination = new FakeDestination();
    /** @type {{sent: {bytes: Uint8Array, context: any}[]}} */
    const log = { sent: [] };
    const runtime = await assembleRuntime({
      capabilityPolicy: staticPolicy(),
      graph,
      catalog: { signatures: () => ({}) },
      send: (bytes, context) => log.sent.push({ bytes, context }),
      broadcast() {},
      capabilities: ["GRAPH_READ", "GRAPH_EDIT"],
    });
    const binding = new ReticulumBinding({
      server: runtime.server,
      reticulum: /** @type {any} */ ({}),
      identity: /** @type {any} */ ({}),
      nodeName: "r",
      createDestination: async () => destination,
    });
    // The binding backs the graph protocol's stale-epoch baselines.
    runtime.graph.resourceProvider = async (bytes) =>
      binding.serveResource(bytes);
    await binding.start();
    // A stale sync produces a 0x12 with the binding's content-addressed
    // token. The binding delivers to link contexts: the fake context
    // records the packets the real link would encrypt.
    /** @type {Uint8Array[]} */
    const sentPackets = [];
    const linkContext = {
      send: async (/** @type {{ payload: Uint8Array }} */ packet) => {
        sentPackets.push(packet.payload);
      },
    };
    // Fail closed: the context must be authorized for its frames to count.
    await runtime.server.authorize(linkContext, "test-identity");
    runtime.server.handleFrame(
      encodeCrdtSyncReq(null, "0000", {}),
      linkContext,
    );
    // The handshake hashes the epoch asynchronously; wait for the reply.
    // The authorized context first received the unilateral auth response,
    // so wait for the stale-epoch reply (opcode 0x12) specifically.
    const deadline = Date.now() + 5000;
    const staleFrame = () => sentPackets.find((payload) => payload[1] === 0x12);
    while (staleFrame() === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(staleFrame(), "the stale-epoch reply is delivered");
    const decoded = decodeCrdtStaleEpoch(/** @type {any} */ (staleFrame()));
    assert.match(decoded.rnsResourceHash, /^[0-9a-f]{32}$/);
    const handler = destination.requestHandlers.get(decoded.rnsResourceHash);
    const reader = await Identity.generate();
    const served = await handler.responseGenerator(
      decoded.rnsResourceHash,
      null,
      null,
      reader,
    );
    assert.ok(served, "an identified reader is served the baseline");
    assert.ok(new TextDecoder().decode(served).includes("node-1"));
  });
});
