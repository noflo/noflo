#!/usr/bin/env node

/**
 * (c) 2021-2026 Henri Bergius
 * SPDX-License-Identifier: EUPL-1.2
 * @file cli module
 * @description fbp-spec-runner command line interface.
 *
 *   Discovers YAML/JSON fbp-spec files and runs them in-process via
 *   node:test. Output follows the default node:test reporter; the exit
 *   code reflects test results.
 *
 * Usage:
 *   fbp-spec-runner [--base-dir <dir>] <file-or-dir> [...]
 */
/* @ts-self-types="./cli.d.ts" */

import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSpecFiles } from "./compiler.js";

const HELP = `Usage: fbp-spec-runner [options] <file-or-dir> [...]

Options:
  --base-dir <dir>  Base directory for component discovery (default: cwd)
  -h, --help        Show this help

Runs fbp-spec YAML/JSON suites in-process against NoFlo components.`;

/**
 * Recursively collect spec files from a path.
 *
 * @param {string} target
 * @param {string[]} [files]
 * @returns {Promise<string[]>}
 */
async function collectSpecFiles(target, files = []) {
  const stats = await stat(target);
  if (stats.isFile()) {
    files.push(target);
    return files;
  }
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(target, entry.name);
    if (entry.isDirectory()) {
      await collectSpecFiles(path, files);
    } else if (/\.(yaml|yml|json)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/**
 * CLI entry point.
 *
 * @param {string[]} argv
 * @returns {Promise<{ code: number, targets: string[], baseDir: string, files: string[] }>} Parsed state and exit code
 */
export async function main(argv = process.argv.slice(2)) {
  let baseDir = process.cwd();
  /** @type {string[]} */
  const targets = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-dir") {
      baseDir = argv[++i];
      if (!baseDir) {
        console.error("--base-dir requires a directory argument");
        return { code: 1, targets: [], baseDir, files: [] };
      }
    } else if (arg === "-h" || arg === "--help") {
      console.log(HELP);
      return { code: 0, targets: [], baseDir, files: [] };
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}\n\n${HELP}`);
      return { code: 1, targets: [], baseDir, files: [] };
    } else {
      targets.push(arg);
    }
  }
  if (targets.length === 0) {
    console.error(`No spec files given\n\n${HELP}`);
    return { code: 1, targets, baseDir, files: [] };
  }

  /** @type {string[]} */
  const files = [];
  for (const target of targets) {
    await collectSpecFiles(target, files);
  }
  if (files.length === 0) {
    console.error(`No .yaml/.yml/.json spec files found under given paths`);
    return { code: 1, targets, baseDir, files };
  }

  return { code: 0, targets, baseDir, files };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  if (!process.env.FBP_SPEC_UNDER_TEST) {
    // Running as a plain script: parse and validate args, then re-exec under
    // `node --test` so test failures produce a non-zero exit code and
    // standard reporting. A dedicated flag (rather than NODE_TEST_CONTEXT)
    // marks the re-exec, so inherited runner environments don't confuse us.
    const state = await main();
    if (state.code !== 0) process.exit(state.code);
    const env = /** @type {Record<string, string | undefined>} */ ({
      ...process.env,
      FBP_SPEC_UNDER_TEST: "1",
      FBP_SPEC_FILES: JSON.stringify(state.files),
      FBP_SPEC_BASE_DIR: state.baseDir,
    });
    // The inner runner must behave as top-level: strip any inherited test
    // runner context, or it reports over IPC instead of stdout.
    delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=spec", fileURLToPath(import.meta.url)],
      {
        stdio: "inherit",
        env,
      },
    );
    process.exit(child.status ?? 1);
  }
  // Under the test runner: register the suites requested via env
  const files = JSON.parse(process.env.FBP_SPEC_FILES || "[]");
  const baseDir = process.env.FBP_SPEC_BASE_DIR || process.cwd();
  if (files.length) {
    await compileSpecFiles(files, { baseDir });
  }
}
