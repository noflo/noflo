#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
// CLI for publish-time manifest generation: writes the library's
// component manifest as noflo.json in the package root.
//
// (c) 2021-2026 Henri Bergius
// SPDX-License-Identifier: EUPL-1.2
import { generateManifest } from "../src/index.js";

const args = process.argv.slice(2);
let revision = null;
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--revision") {
    revision = args[i + 1] ?? null;
    i += 1;
    continue;
  }
  positional.push(args[i]);
}
if (revision === null && process.env.GITHUB_SHA) {
  // Publish CI provenance: the exact revision the manifest was
  // generated from
  revision = process.env.GITHUB_SHA;
}

const baseDir = path.resolve(positional[0] ?? process.cwd());
const manifest = await generateManifest(baseDir, { revision });
const outPath = path.join(baseDir, "noflo.json");
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Manifest written to ${outPath} (${manifest.components.length} components)`,
);
