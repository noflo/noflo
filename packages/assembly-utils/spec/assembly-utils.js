import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSuitesFromFile } from "@noflo/fbp-spec-runner/src/loader.js";
import { executeTestCase } from "@noflo/fbp-spec-runner/src/network.js";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import noflo, { ComponentLoader } from "@noflo/noflo";

// The package root is the discovery base: the local walker registers the
// components/ directory under the package's own namespace
const baseDir = fileURLToPath(new URL("../", import.meta.url));

// fbp-spec is the preferred test format for components (work document
// #36); the YAML suites run through the monorepo runner in-process
const registry = await createNodeModulesRegistry(baseDir, {});
const loader = new noflo.ComponentLoader({ registry });

const suiteNames = [
  "ToAssembly.yaml",
  "FromAssembly.yaml",
  "Fork.yaml",
  "Merge.yaml",
  "All.yaml",
  "ComparePath.yaml",
];

// Load every suite before registering: node:test drops describes that are
// registered after an async gap once the module body has completed
const suites = [];
for (const suiteName of suiteNames) {
  const file = fileURLToPath(new URL(`../spec/${suiteName}`, import.meta.url));
  suites.push(...(await loadSuitesFromFile(file)));
}

for (const suite of suites) {
  describe(suite.name || suite.topic, () => {
    for (const testCase of suite.cases ?? []) {
      const label = testCase.assertion
        ? `${testCase.name} — ${testCase.assertion}`
        : testCase.name;
      const timeout = testCase.timeout ?? suite.timeout ?? 2000;
      it(label, { timeout }, async () => {
        await executeTestCase(loader, suite, testCase, timeout);
      });
    }
  });
}
