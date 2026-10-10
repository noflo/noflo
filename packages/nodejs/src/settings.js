//     NoFlo - Flow-Based Programming for JavaScript
//     (c) 2021-2026 Henri Bergius
//     NoFlo may be freely distributed under the MIT license

/**
 * @module settings
 * @description Layered configuration for the NoFlo Node.js host (the
 *   modernization of legacy `settings.js`, work document #31). Loading
 *   order, each level overriding the previous:
 *
 *   1. Defaults
 *   2. `~/.noflo.json` (user-level)
 *   3. `<baseDir>/.noflo.json` (project-level)
 *   4. Environment variables
 *   5. CLI arguments (CLI entry only)
 *   6. Generated values, as needed
 *
 *   Values that differ from their default and are not marked transient get
 *   persisted back into the project-level `.noflo.json`, so a first run
 *   records its generated node name for subsequent runs.
 *
 *   The 2.x host speaks Reticulum, not sockets: there is no listening
 *   address, secret, or registry to configure. Authorization is Dacar
 *   (work document #4's capability plane): the host evaluates grants from
 *   the node store the `dacar` CLI maintains, so trust anchors and grants
 *   never appear in this configuration at all.
 */
/* @ts-self-types="./settings.d.ts" */

import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Whether a value is recordable as a CLI/JSON boolean: absent (unset) or a
 * boolean-ish string.
 *
 * @param {string|boolean|undefined} value
 * @returns {boolean|undefined}
 */
function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

/**
 * The configuration surface. Keys map to CLI flags by kebab-casing
 * (`baseDir` → `--base-dir`) unless a `cli` alias is given.
 *
 * @type {Record<string, {
 *   description: string,
 *   cli?: string,
 *   boolean?: boolean,
 *   env?: string,
 *   default?: any,
 *   generate?: (packageData: any) => any,
 *   skipSave?: boolean,
 *   convert?: (value: string) => any,
 * }>}
 */
const config = {
  name: {
    description: "Node name announced on the Reticulum mesh",
    generate: (packageData) =>
      packageData?.name ? `${packageData.name} NoFlo runtime` : "NoFlo runtime",
  },
  graph: {
    description: "Path to the graph file to run",
    skipSave: true,
  },
  baseDir: {
    cli: "base-dir",
    env: "PROJECT_HOME",
    description: "Project base directory used for component loading",
    default: process.cwd(),
    skipSave: true,
  },
  batch: {
    description: "Exit the process when the network stops",
    boolean: true,
    skipSave: true,
  },
  rnsHost: {
    cli: "rns-host",
    env: "RNS_HOST",
    description:
      "Hostname of a Reticulum rnsd uplink to connect to when no shared instance is available",
  },
  rnsPort: {
    cli: "rns-port",
    env: "RNS_PORT",
    description: "TCP port of the Reticulum rnsd uplink",
    convert: (value) => Number.parseInt(value, 10),
  },
  storage: {
    description:
      "Directory for the Reticulum transport storage; holds the generated identity key",
  },
  debug: {
    description: "Log NoFlo packet events to stdout",
    boolean: true,
    skipSave: true,
  },
  verbose: {
    description: "Log NoFlo packet contents to stdout",
    boolean: true,
    skipSave: true,
  },
  trace: {
    description: "Record a flowtrace of the graph execution",
    boolean: true,
  },
  cache: {
    description: "Read the component catalog from the fbp.json manifest cache",
    boolean: true,
  },
  catchExceptions: {
    cli: "catch-exceptions",
    description: "Catch uncaught exceptions, flush the trace, and exit",
    boolean: true,
    skipSave: true,
  },
  dacarStore: {
    cli: "dacar-store",
    env: "DACAR_HOME",
    description:
      "Dacar node store to evaluate grants against (the one `dacar sync` maintains); when missing, every client is denied",
  },
  dacarObject: {
    cli: "dacar-object",
    description:
      "Dacar object id the runtime's commands address; defaults to noflo.runtime/<name>",
  },
  dacarAllRelation: {
    cli: "dacar-all-relation",
    default: "access",
    description:
      "Dacar relation whose grant on the object confers the full capability mask",
  },
};

/**
 * The default Dacar store location, matching the `dacar` CLI
 * (`DACAR_HOME` or `~/.dacar`).
 *
 * @returns {string}
 */
export function defaultDacarStore() {
  return process.env.DACAR_HOME || path.join(os.homedir(), ".dacar");
}

/**
 * The host package's version, read once from the package manifest.
 *
 * @type {string|undefined}
 */
let packageVersion;

/**
 * The package version for `--version`.
 *
 * @returns {string}
 */
export function version() {
  if (!packageVersion) {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    packageVersion = manifest.version;
  }
  return packageVersion;
}

/**
 * Human-readable usage text, generated from the configuration schema so it
 * cannot drift from the parser.
 *
 * @returns {string}
 */
export function usage() {
  const lines = [
    `noflo-nodejs v${version()} - run NoFlo programs on Node.js as FBP Protocol 2.0 runtimes`,
    "",
    "Usage: noflo-nodejs [options]",
    "",
    "Options:",
  ];
  for (const [key, conf] of Object.entries(config)) {
    const flag = `--${conf.cli ?? kebab(key)}`;
    const type = conf.boolean ? "[true|false]" : "<value>";
    const env = conf.env ? ` [env: ${conf.env}]` : "";
    const generated = conf.generate ? " [generated]" : "";
    lines.push(
      `  ${flag} ${type}`.padEnd(34) + `${conf.description}${env}${generated}`,
    );
  }
  lines.push("");
  lines.push("  -h, --help".padEnd(34) + "Show this help");
  lines.push("  -v, --version".padEnd(34) + "Show the version");
  return lines.join("\n");
}

/**
 * Available capability names — the FBP Protocol capability vocabulary the
 * Dacar relations map onto.
 *
 * @type {string[]}
 */
export const CAPABILITIES = [
  "GRAPH_READ",
  "GRAPH_EDIT",
  "METADATA_SYNC",
  "TELEMETRY_READ",
  "COMPONENT_READ",
  "COMPONENT_WRITE",
  "LIFECYCLE_CTRL",
  "ADMIN",
];

/**
 * Kebab-case a config key the way the CLI flags spell it.
 *
 * @param {string} key
 * @returns {string}
 */
function kebab(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Parse CLI arguments into a settings object. Boolean flags accept both
 * bare form (`--batch`) and explicit values (`--batch false`), matching the
 * legacy semantics; value-taking flags take the next argument or a
 * `--flag=value` form.
 *
 * @returns {Record<string, any>}
 */
function parseArguments() {
  /** @type {Map<string, string>} */
  const flags = new Map(
    Object.entries(config).map(([key, conf]) => [conf.cli ?? kebab(key), key]),
  );
  /** @type {Record<string, any>} */
  const parsed = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (
      arg === "-h" ||
      arg === "--help" ||
      arg === "-v" ||
      arg === "--version"
    ) {
      const err = /** @type {any} */ (new Error(arg));
      if (arg === "-h" || arg === "--help") {
        err.help = true;
      } else {
        err.version = true;
      }
      throw err;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    let value = eq === -1 ? undefined : arg.slice(eq + 1);
    const key = flags.get(flag);
    if (!key) {
      throw new Error(`Unknown option --${flag}`);
    }
    const conf = config[key];
    if (value === undefined) {
      if (conf.boolean) {
        value = "true";
      } else {
        value = args[++i];
        if (value === undefined) {
          throw new Error(`--${flag} requires a value`);
        }
      }
    }
    if (conf.boolean) {
      const bool = toBoolean(value);
      if (bool === undefined) {
        throw new Error(`Invalid boolean value for --${flag}: ${value}`);
      }
      parsed[key] = bool;
    } else if (conf.convert) {
      parsed[key] = conf.convert(/** @type {string} */ (value));
    } else {
      parsed[key] = value;
    }
  }
  return parsed;
}

/**
 * Read a JSON file, returning null when it does not exist.
 *
 * @param {string} filePath
 * @returns {Promise<any|null>}
 */
async function readJson(filePath) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (err) {
    if (/** @type {any} */ (err)?.code === "ENOENT") {
      return null;
    }
    throw err;
  }
  return JSON.parse(contents);
}

/**
 * Deep-merge plain objects; arrays and primitives override.
 *
 * @param {any} target
 * @param {any} source
 * @returns {any}
 */
function merge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return source;
  }
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(result[key], value)
        : value;
  }
  return result;
}

/**
 * Apply environment variables to a settings layer.
 *
 * @param {Record<string, any>} settings
 * @returns {Record<string, any>}
 */
function applyEnv(settings) {
  const applied = { ...settings };
  for (const [key, conf] of Object.entries(config)) {
    if (!conf.env) {
      continue;
    }
    const value = process.env[conf.env];
    if (typeof value !== "undefined" && value !== "") {
      applied[key] = conf.convert ? conf.convert(value) : value;
    }
  }
  return applied;
}

/**
 * Apply an options object (programmatic entry) to a settings layer.
 *
 * @param {Record<string, any>} settings
 * @param {Record<string, any>} options
 * @returns {Record<string, any>}
 */
function applyOptions(settings, options) {
  const applied = { ...settings };
  for (const key of Object.keys(config)) {
    if (typeof options[key] === "undefined") {
      continue;
    }
    applied[key] = options[key];
  }
  return applied;
}

/**
 * Apply config defaults for keys that have one and are still unset.
 *
 * @param {Record<string, any>} settings
 * @returns {Record<string, any>}
 */
function applyDefaults(settings) {
  const applied = { ...settings };
  for (const [key, conf] of Object.entries(config)) {
    if (typeof conf.default === "undefined") {
      continue;
    }
    if (typeof applied[key] !== "undefined") {
      continue;
    }
    applied[key] = conf.default;
  }
  return applied;
}

/**
 * Fill generated values (e.g. the node name from the project's package.json).
 *
 * @param {Record<string, any>} settings
 * @returns {Promise<Record<string, any>>}
 */
async function generateValues(settings) {
  const applied = { ...settings };
  let packageData = null;
  try {
    packageData = await readJson(path.resolve(applied.baseDir, "package.json"));
  } catch {
    // A project without a readable package.json gets generic defaults
  }
  for (const [key, conf] of Object.entries(config)) {
    if (typeof applied[key] !== "undefined" || !conf.generate) {
      continue;
    }
    applied[key] = conf.generate(packageData);
  }
  // The Reticulum storage directory (identity key included) defaults under
  // the project's .noflo/ directory
  if (typeof applied.storage === "undefined") {
    applied.storage = path.resolve(applied.baseDir, ".noflo", "rns");
  }
  return applied;
}

/**
 * Persist non-default, non-transient values into the project-level settings
 * file so a first run records its configuration.
 *
 * @param {Record<string, any>} settings
 * @returns {Promise<Record<string, any>>}
 */
async function saveSettings(settings) {
  /** @type {Record<string, any>} */
  const saveables = {};
  for (const [key, conf] of Object.entries(config)) {
    if (typeof settings[key] === "undefined" || conf.skipSave) {
      continue;
    }
    if (settings[key] === conf.default) {
      continue;
    }
    saveables[key] = settings[key];
  }
  const settingsPath = path.resolve(settings.baseDir, ".noflo.json");
  await writeFile(settingsPath, `${JSON.stringify(saveables, null, 2)}\n`);
  return settings;
}

/**
 * Validate the Dacar configuration keys.
 *
 * @param {Record<string, any>} settings
 * @returns {void}
 * @throws {Error} On a malformed Dacar object id or relation
 */
function validateDacar(settings) {
  for (const key of ["dacarObject", "dacarAllRelation"]) {
    const value = settings[key];
    if (typeof value !== "undefined" && (typeof value !== "string" || !value)) {
      throw new Error(`${key} must be a non-empty string`);
    }
  }
}

/**
 * Layered settings load for the CLI: user-level file, project-level file,
 * environment variables, CLI arguments, defaults, and generated values —
 * each layer overriding the previous. The result persists back into the
 * project-level file.
 *
 * @returns {Promise<Record<string, any>>}
 */
export async function load() {
  const cli = parseArguments();
  const env = applyEnv({});
  const baseDir = path.resolve(cli.baseDir ?? env.baseDir ?? process.cwd());
  /** @type {Record<string, any>} */
  let settings = {};
  for (const layer of [
    await readJson(path.join(os.homedir(), ".noflo.json")),
    await readJson(path.join(baseDir, ".noflo.json")),
  ]) {
    if (layer) {
      settings = merge(settings, layer);
    }
  }
  settings = applyEnv(settings);
  settings = applyOptions(settings, cli);
  settings = applyDefaults(settings);
  settings = await generateValues(settings);
  if (typeof settings.dacarStore === "undefined") {
    settings.dacarStore = defaultDacarStore();
  }
  validateDacar(settings);
  await saveSettings(settings);
  return settings;
}

/**
 * Layered settings load for the programmatic entry: env, the given options,
 * defaults, and generated values. Nothing is persisted and no CLI arguments
 * are parsed.
 *
 * @param {Record<string, any>} options
 * @returns {Promise<Record<string, any>>}
 */
export async function loadForLibrary(options = {}) {
  let settings = applyEnv({});
  settings = applyOptions(settings, options);
  settings = applyDefaults(settings);
  settings = await generateValues(settings);
  if (typeof settings.dacarStore === "undefined") {
    settings.dacarStore = defaultDacarStore();
  }
  validateDacar(settings);
  return settings;
}

/**
 * The raw configuration schema, exported for tests and tooling.
 *
 * @type {Record<string, any>}
 */
export { config };
