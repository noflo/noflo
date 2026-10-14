//     @noflo/fbp-client - Command-line tool for FBP Protocol 2.0
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file e2e spec
 * @description The true end-to-end verification (work document #34): the
 *   committed `fbp-client` binary driving a live `@noflo/runtime` — the
 *   README's hello-world editing session, exactly as a user would run it.
 *
 *   Topology: the spec process assembles the runtime with real components.
 *   By default the runtime hosts a `TCPServerInterface` on an ephemeral
 *   loopback port and every CLI command is a spawned child process
 *   connecting to it — no rnsd needed, since sequential single-client
 *   sessions need no third-party relay. Announce echo does not reliably
 *   reach late-joining clients, so the spec nudges the runtime's announce
 *   while a command's discovery window is open; after the first link the
 *   CLI's persisted destination cache carries the rest of the session.
 *
 *   The watch-and-run flow needs two concurrent CLI clients, and a
 *   leaf-mode Reticulum cannot route link replies to more than one peer —
 *   that requires a transport node. When `RUNTIME_E2E_RNSD` is set to the
 *   rnsd's TCP interface (`host:port`), the runtime instead connects to
 *   the rnsd as a client and the whole session — watch included — runs
 *   through it. That mode is opt-in: the rnsd should have AutoInterface
 *   disabled unless mesh traffic is wanted.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CAPABILITY } from "@noflo/fbp-protocol";
import { GraphModel } from "@noflo/graph";
import { Component, ComponentLoader } from "@noflo/noflo";
import { assembleRuntime, bindReticulum } from "@noflo/runtime";
import { Identity, Reticulum } from "@reticulum/core";
import { TCPClientInterface, TCPServerInterface } from "@reticulum/node";

const RNSD = process.env.RUNTIME_E2E_RNSD;

const ALL = Object.values(CAPABILITY).reduce((mask, bit) => mask | bit, 0);

/**
 * A passthrough component: `in` -> `out`.
 *
 * @returns {Component}
 */
function makeRepeat() {
  const c = new Component({
    inPorts: { in: { datatype: "all", required: true } },
    outPorts: { out: { datatype: "all" } },
    process(input, output) {
      if (!input.hasData("in")) {
        return;
      }
      output.sendDone(input.get("in"));
    },
  });
  return c;
}

/**
 * A sink component logging packets to the server console.
 *
 * @returns {Component}
 */
function makeOutput() {
  const c = new Component({
    inPorts: { in: { datatype: "all", required: true } },
    process(input, output) {
      if (!input.hasData("in")) {
        return;
      }
      const packet = input.get("in");
      console.log(`[output] ${JSON.stringify(packet.data ?? packet)}`);
      output.done();
    },
  });
  return c;
}

/**
 * Resolve a registry entry for the hello-world catalog.
 *
 * @param {string} name
 * @returns {{ getComponent: () => Component }|undefined}
 */
function makeComponent(name) {
  if (name === "core/Repeat") return { getComponent: () => makeRepeat() };
  if (name === "core/Output") return { getComponent: () => makeOutput() };
  return undefined;
}

describe("fbp-client hello-world session over a live runtime", () => {
  /** @type {any} */
  let binding = null;
  /** @type {import("@reticulum/core").Reticulum} */
  let rns = null;
  /** @type {string} */
  let stateDir = "";
  /** @type {string} */
  let target = "";

  /**
   * Spawn the committed CLI binary with the session identity.
   *
   * @param {string[]} args
   * @param {{ timeout?: number }} [options]
   * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
   */
  async function runCli(args, { timeout = 60_000 } = {}) {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../bin/fbp-client.js", import.meta.url)),
        "--identity",
        path.join(stateDir, "client.key"),
        "--interface",
        target,
        ...args,
      ],
      { timeout },
    );
    // Nudge the runtime's announce while the command's discovery window is
    // open: after the first link the destination cache takes over, so the
    // extra announces only matter for the first commands
    if (binding) {
      for (const delay of [1_500, 6_000]) {
        const timer = setTimeout(() => binding.destination.announce(), delay);
        timer.unref?.();
      }
    }
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    child.stdout.on("data", (/** @type {Buffer} */ d) => out.push(d));
    child.stderr.on("data", (/** @type {Buffer} */ d) => err.push(d));
    return new Promise((resolve) => {
      child.on("close", (code) => {
        resolve({
          code: code ?? -1,
          stdout: Buffer.concat(out).toString(),
          stderr: Buffer.concat(err).toString(),
        });
      });
      child.on("error", () => {
        resolve({ code: -1, stdout: "", stderr: "spawn failed" });
      });
    });
  }

  before(async () => {
    rns = new Reticulum({ logLevel: "warning" });
    if (RNSD) {
      // Opt-in mesh topology: the runtime connects to a transport node so
      // concurrent clients (watch + run) get their link replies relayed
      const [host, port] = /** @type {string} */ (RNSD).split(":");
      const iface = new TCPClientInterface({
        name: "fbp-client-e2e-runtime",
        host,
        port: Number(port || 4242),
      });
      await iface.connect();
      rns.addInterface(iface, true);
      target = /** @type {string} */ (RNSD);
    } else {
      // Self-hosted topology: the runtime serves its own TCP clients on an
      // ephemeral loopback port
      const server = new TCPServerInterface({
        port: 0,
        listenIp: "127.0.0.1",
      });
      await server.connect();
      rns.addInterface(server, true);
      server.addEventListener("connection", (/** @type {any} */ event) => {
        rns.addInterface(event.detail, true);
      });
      target = `127.0.0.1:${/** @type {any} */ (server).server.address().port}`;
    }
    const graph = new GraphModel({ name: "main" });
    const runtime = await assembleRuntime({
      capabilityPolicy: () => ALL,
      graph,
      componentLoader: new ComponentLoader({
        registry: {
          list: () => ({
            "core/Repeat": makeComponent("core/Repeat"),
            "core/Output": makeComponent("core/Output"),
          }),
          get: async (name) => makeComponent(name),
        },
      }),
      capabilities: ALL,
      catalog: {
        signatures: () => ({
          "core/Repeat": {
            type: "elementary",
            in: [{ id: "in", type: "all", required: true }],
            out: [{ id: "out", type: "all" }],
          },
          "core/Output": {
            type: "elementary",
            in: [{ id: "in", type: "all", required: true }],
            out: [],
          },
        }),
      },
    });
    const serverIdentity = await Identity.generate();
    binding = await bindReticulum({
      runtime,
      reticulum: rns,
      identity: serverIdentity,
      nodeName: "hello-runtime",
    });
    stateDir = await mkdtemp(path.join(tmpdir(), "fbp-client-e2e-"));
  });

  after(async () => {
    binding?.stop?.();
    await rns?.stop?.().catch?.(() => {});
    if (stateDir) {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("scan discovers the runtime by announce", async () => {
    const { code, stdout, stderr } = await runCli(["scan"]);
    assert.equal(code, 0, stdout + stderr);
    assert.match(stdout, /hello-runtime [0-9a-f]{32}/);
  });

  it("add-node instantiates components on the runtime's graph", async () => {
    const first = await runCli(["add-node", "core/Repeat", "--id", "repeat"]);
    assert.equal(first.code, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /repeat applied at epoch [0-9a-f]{64}/);
    const second = await runCli(["add-node", "core/Output", "--id", "out"]);
    assert.equal(second.code, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /out applied at epoch [0-9a-f]{64}/);
  });

  it("add-edge and add-iip wire the hello world", async () => {
    const edge = await runCli(["add-edge", "repeat", "out", "out", "in"]);
    assert.equal(edge.code, 0, edge.stdout + edge.stderr);
    assert.match(
      edge.stdout,
      /edge repeat:out -> out:in applied at epoch [0-9a-f]{64}/,
    );
    const iip = await runCli(["add-iip", "repeat", "in", "Hello, world!"]);
    assert.equal(iip.code, 0, iip.stdout + iip.stderr);
    assert.match(iip.stdout, /iip -> repeat:in applied at epoch [0-9a-f]{64}/);
  });

  it("graph renders the runtime's mirror as .fbp source", async () => {
    const { code, stdout } = await runCli(["graph", "--format", "fbp"]);
    assert.equal(code, 0, stdout);
    assert.match(stdout, /'Hello, world!' -> in repeat\(core\/Repeat\)/);
    assert.match(stdout, /repeat out -> in out\(core\/Output\)/);
  });

  it("refuses a duplicate add with the runtime's reason", async () => {
    const { code, stderr } = await runCli([
      "add-node",
      "core/Repeat",
      "--id",
      "repeat",
    ]);
    assert.equal(code, 1);
    assert.match(stderr, /rejected .*(already exists)/);
  });

  // The watch-and-run flow needs two concurrent CLI clients; a leaf-mode
  // Reticulum cannot route link replies to more than one peer, so this
  // runs only over a transport node (opt-in via RUNTIME_E2E_RNSD)
  const itRelay = RNSD ? it : it.skip;
  itRelay(
    "run starts the network and watch sees the packet travel",
    async () => {
      const watch = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../bin/fbp-client.js", import.meta.url)),
          "--identity",
          path.join(stateDir, "client.key"),
          "--interface",
          target,
          "watch",
        ],
        { timeout: 30_000 },
      );
      /** @type {Buffer[]} */
      const watched = [];
      /** @type {Buffer[]} */
      const watchErr = [];
      watch.stdout.on("data", (/** @type {Buffer} */ d) => watched.push(d));
      watch.stderr.on("data", (/** @type {Buffer} */ d) => watchErr.push(d));
      // The watch command must be subscribed before the network runs: the
      // hello world completes in tens of milliseconds
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      binding.destination.announce();
      const run = await runCli(["run"]);
      assert.equal(run.code, 0, run.stdout + run.stderr);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      watch.kill("SIGKILL");
      const output = Buffer.concat(watched).toString();
      assert.match(
        output,
        /DATA.*Hello, world!/,
        `watch stderr: ${Buffer.concat(watchErr).toString()}`,
      );
    },
  );

  it("status reports the runtime and the granted capabilities", async () => {
    const { code, stdout } = await runCli(["status"]);
    assert.equal(code, 0, stdout);
    assert.match(stdout, /node:\s+hello-runtime/);
    assert.match(stdout, /granted 0xff of advertised 0xff/);
  });
});
