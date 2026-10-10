#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
// CLI for publish-time manifest generation: writes the library's
// component manifest as noflo.json in the package root.
import { generateManifest } from "../src/index.js";

const baseDir = path.resolve(process.argv[2] ?? process.cwd());
const manifest = await generateManifest(baseDir);
const outPath = path.join(baseDir, "noflo.json");
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Manifest written to ${outPath} (${manifest.components.length} components)`,
);
