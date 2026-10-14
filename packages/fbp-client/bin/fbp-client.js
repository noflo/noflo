#!/usr/bin/env node

//     @noflo/fbp-client - Command-line tool for FBP Protocol 2.0
//     SPDX-License-Identifier: EUPL-1.2

/**
 * @file fbp-client binary
 * @description The `fbp-client` CLI (work document #34): a leaf entry
 *   point that owns the platform wiring (`@reticulum/node` transports,
 *   process I/O, argument parsing) and renders the command functions from
 *   the library. Library code never imports this file, so bundlers don't
 *   pull server-only code into browser builds.
 *
 *   Usage:
 *     fbp-client scan [--name <name>] [--interface host:port]
 *     fbp-client status [--name <name>] [--json]
 *     fbp-client planes [--json]
 *     fbp-client graph [--format json|fbp|dot] [--json]
 *
 *   The client identity is ephemeral for now; persisted identities land
 *   with the modification phase.
 */

import { readFile, writeFile } from "node:fs/promises";
import { EVENT_TYPE } from "@noflo/fbp-protocol";
import { Identity, Reticulum } from "@reticulum/core";
import { TCPClientInterface } from "@reticulum/node";
import {
	capture,
	clearBreakpoints,
	component,
	components,
	connectSession,
	discoverRuntime,
	getSource,
	graph,
	planes,
	processes,
	replayTraceFile,
	runControl,
	sendPacket,
	setBreakpoint,
	setHwm,
	setProcessState,
	setSource,
	status,
	watch,
} from "../src/index.js";

/** The human names for the flowtrace event vocabulary. */
const EVENT_NAMES = {
	[EVENT_TYPE.DATA]: "DATA",
	[EVENT_TYPE.BEGIN_BRACKET]: "BEGIN_BRACKET",
	[EVENT_TYPE.END_BRACKET]: "END_BRACKET",
	[EVENT_TYPE.ERROR]: "ERROR",
	[EVENT_TYPE.CONSOLE]: "CONSOLE",
	[EVENT_TYPE.LIFECYCLE]: "LIFECYCLE",
	[EVENT_TYPE.VISUAL_STATE]: "VISUAL_STATE",
};

/** Parse `host:port` (port optional). */
function parseTarget(value) {
	const [host, port] = value.split(":");
	return { host, port: port ? Number(port) : 4242 };
}

/** Minimal argument walker: flags and `--flag value` pairs. */
function parseArgs(argv) {
	/** @type {string[]} */
	const positional = [];
	/** @type {Record<string, string|boolean>} */
	const flags = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			positional.push(arg);
			continue;
		}
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith("--")) {
			flags[key] = next;
			i += 1;
		} else {
			flags[key] = true;
		}
	}
	return { positional, flags };
}

function usage() {
	console.log(`fbp-client — FBP Protocol 2.0 command line (wd #34)

Usage:
  fbp-client <command> [options]

Commands:
  scan                 List announced FBP runtimes on the mesh
  status               Run state, uptime, epoch, capabilities (0x48)
  planes               List the runtime's graph planes (0x16)
  graph                Render the mirrored graph (default: json)
  components           List the registry catalog (Two-Step Cache)
  component <name>     One registry entry with its signature
  source get <name>    Read a component's source (0x26)
  source set <name> <file>  Write a component's source (0x25)
  watch                Stream decoded telemetry events (0x30/0x32)
  trace <file>         Capture a 0xF0 tracefile (default 5s window)
  replay <file>        Play back a stored tracefile (offline)
  run|pause|step|stop  Execution control (0x40)
  send <port> <data>   Inject a packet into an inport (0x47)
  breakpoint set|clear  Data breakpoints (0x41/0x42)
  processes            The live process listing (0x44/0x45)
  enable|disable <id>  Per-process control (0x43)
  hwm <n|nil>          Default edge capacity (0x46)

Options:
  --name <name>        Pin discovery to one runtime name
  --interface <h:p>    rnsd TCP interface (default 127.0.0.1:4242)
  --format <fmt>       Output format for graph: json or fbp (dot: later phase)
  --json               Machine-readable JSON output
  --help               This help`);
}

/** Build a Reticulum instance wired to the rnsd TCP interface. */
async function instance(target) {
	const rns = new Reticulum({ logLevel: "warning" });
	const iface = new TCPClientInterface({
		name: "fbp-client",
		host: target.host,
		port: target.port,
	});
	await iface.connect();
	// Mark the rnsd uplink as the default: the leaf fallback routes replies
	// (LRPROOFs, responses) when no path entry exists yet
	rns.addInterface(iface, true);
	return rns;
}

async function main() {
	const { positional, flags } = parseArgs(process.argv.slice(2));
	const command = positional[0];
	if (!command || flags.help) {
		usage();
		process.exitCode = command ? 1 : 0;
		return;
	}
	// Offline command: replay needs no runtime connection
	if (command === "replay") {
		const file = positional[1];
		if (!file) {
			throw new Error("usage: fbp-client replay <file>");
		}
		const bytes = await readFile(file);
		const { snapshot, chunkCount } = replayTraceFile(bytes, {
			onChunk: (chunk) => {
				if (json) {
					console.log(JSON.stringify(chunk));
				} else {
					for (const event of chunk.events) {
						console.log(
							`${chunk.planeId ?? "main"}\t${event.timestampMs}\t${EVENT_NAMES[event.eventType] ?? event.eventType}\t${JSON.stringify(event.payload)}`,
						);
					}
				}
			},
		});
		console.error(
			`replayed ${chunkCount} chunks from ${new Date(snapshot.timestampMs).toISOString()}`,
		);
		return;
	}

	const json = Boolean(flags.json);
	const target = parseTarget(
		typeof flags.interface === "string" ? flags.interface : "127.0.0.1:4242",
	);
	const nodeName = typeof flags.name === "string" ? flags.name : null;
	const rns = await instance(target);
	try {
		if (command === "scan") {
			const found = await discoverRuntime({
				reticulum: rns,
				nodeName,
				timeoutMs: 10_000,
			});
			if (json) {
				console.log(
					JSON.stringify(
						{
							nodeName: found.nodeName,
							destinationHash: Buffer.from(found.destinationHash).toString(
								"hex",
							),
						},
						null,
						2,
					),
				);
			} else {
				console.log(
					`${found.nodeName} ${Buffer.from(found.destinationHash).toString("hex")}`,
				);
			}
			return;
		}

		// Everything below needs a session
		const identity = await Identity.generate();
		const session = await connectSession({
			reticulum: rns,
			identity,
			nodeName,
			timeoutMs: 15_000,
		});
		try {
			switch (command) {
				case "status": {
					const result = await status(session);
					if (json) {
						console.log(JSON.stringify(result, null, 2));
					} else {
						console.log(`node:      ${session.nodeName}`);
						console.log(`run state: ${result.runState}`);
						console.log(`uptime:    ${result.uptimeMs}ms`);
						console.log(`epoch:     ${result.epochId}`);
						console.log(
							`caps:      granted 0x${result.grantedMask
								.toString(16)
								.padStart(2, "0")} of advertised 0x${result.advertisedMask
								.toString(16)
								.padStart(2, "0")}`,
						);
					}
					break;
				}
				case "planes": {
					const entries = await planes(session);
					if (json) {
						console.log(JSON.stringify(entries, null, 2));
					} else {
						for (const entry of entries) {
							console.log(
								`${entry.planeId ?? "main"}\t${entry.kind ?? "graph"}\t${entry.epochId ?? ""}`,
							);
						}
					}
					break;
				}
				case "graph": {
					const format =
						typeof flags.format === "string" ? flags.format : "json";
					const document = await graph(session, { format });
					if (format === "fbp") {
						console.log(document);
					} else {
						console.log(JSON.stringify(document, null, 2));
					}
					break;
				}
				case "components": {
					const catalog = await components(session);
					if (json) {
						console.log(JSON.stringify(catalog, null, 2));
					} else {
						for (const [name, entry] of Object.entries(catalog).sort()) {
							console.log(
								`${name}\t${entry.type}${entry.signature ? "\t(detailed)" : ""}`,
							);
						}
					}
					break;
				}
				case "component": {
					const name = positional[1];
					if (!name) {
						throw new Error("usage: fbp-client component <name>");
					}
					const entry = await component(session, name);
					console.log(JSON.stringify(entry, null, 2));
					break;
				}
				case "source": {
					const sub = positional[1];
					const name = positional[2];
					if (sub === "get") {
						if (!name) {
							throw new Error("usage: fbp-client source get <name>");
						}
						const source = await getSource(session, name);
						if (source === null) {
							console.error(
								`fbp-client: the runtime holds no source for ${name}`,
							);
							process.exitCode = 1;
						} else {
							console.log(source);
						}
						break;
					}
					if (sub === "set") {
						const file = positional[3];
						if (!name || !file) {
							throw new Error("usage: fbp-client source set <name> <file>");
						}
						const source = await readFile(file, "utf8");
						await setSource(session, name, source);
						if (!json) {
							console.error(
								`wrote ${file} to ${name}; the next sync picks up the new signature`,
							);
						}
						break;
					}
					throw new Error("usage: fbp-client source get|set <name> [file]");
				}
				case "watch": {
					const types =
						typeof flags.types === "string"
							? flags.types.split(",").map(Number)
							: [];
					const handle = await watch(session, {
						filtersTypes: types,
						onChunk: (chunk) => {
							if (json) {
								console.log(JSON.stringify(chunk));
							} else {
								for (const event of chunk.events) {
									console.log(
										`${chunk.planeId ?? "main"}\t${event.timestampMs}\t${EVENT_NAMES[event.eventType] ?? event.eventType}\t${JSON.stringify(event.payload)}`,
									);
								}
							}
						},
					});
					// Stream until interrupted
					await new Promise((resolve) => {
						process.on("SIGINT", () => {
							handle.stop();
							resolve(undefined);
						});
					});
					break;
				}
				case "trace": {
					const file = positional[1];
					if (!file) {
						throw new Error("usage: fbp-client trace <file>");
					}
					const durationMs =
						typeof flags.duration === "string" ? Number(flags.duration) : 5_000;
					const bytes = await capture(session, {
						durationMs,
						runtimeMetadata: { nodeName: session.nodeName },
					});
					await writeFile(file, bytes);
					console.error(`wrote ${bytes.length} bytes to ${file}`);
					break;
				}
				case "run":
					await runControl(session, "start");
					break;
				case "pause":
					await runControl(session, "pause");
					break;
				case "step":
					await runControl(session, "step");
					break;
				case "stop":
					await runControl(session, "stop");
					break;
				case "send": {
					const port = positional[1];
					const data = positional[2];
					if (!port || data === undefined) {
						throw new Error("usage: fbp-client send <port> <data>");
					}
					await sendPacket(session, { port, payload: JSON.parse(data) });
					break;
				}
				case "breakpoint": {
					const sub = positional[1];
					if (sub === "set") {
						const nodeId = positional[2];
						if (!nodeId) {
							throw new Error("usage: fbp-client breakpoint set <node> [port]");
						}
						await setBreakpoint(session, {
							breakpointId: `bp-${nodeId}-${positional[3] ?? "any"}`,
							nodeId,
							port: positional[3] ?? null,
						});
						break;
					}
					if (sub === "clear") {
						await clearBreakpoints(session, positional[2] ?? null);
						break;
					}
					throw new Error("usage: fbp-client breakpoint set|clear [id]");
				}
				case "processes": {
					const entries = await processes(session);
					if (json) {
						console.log(JSON.stringify(entries, null, 2));
					} else {
						for (const [nodeId, entry] of Object.entries(entries).sort()) {
							console.log(`${nodeId}\t${entry.component}\t${entry.state}`);
						}
					}
					break;
				}
				case "enable":
					await setProcessState(session, positional[1], "enable");
					break;
				case "disable":
					await setProcessState(session, positional[1], "disable");
					break;
				case "hwm": {
					const value = positional[1];
					if (value === undefined) {
						throw new Error("usage: fbp-client hwm <n|nil>");
					}
					await setHwm(session, value === "nil" ? null : Number(value));
					break;
				}
				default:
					usage();
					process.exitCode = 1;
			}
		} finally {
			await session.client.close();
		}
	} finally {
		await rns.stop().catch(() => {});
	}
}

main().catch((err) => {
	console.error(`fbp-client: ${err.message}`);
	process.exit(1);
});
