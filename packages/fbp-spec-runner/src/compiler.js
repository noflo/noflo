/**
 * @file compiler module
 * @description Compile fbp-spec suites into `node:test` describe/it blocks.
 */

import { describe, it } from "node:test";
import { createNodeModulesRegistry } from "@noflo/loader-node";
import * as noflo from "noflo";
import { loadSuitesFromFile } from "./loader.js";
import { executeTestCase } from "./network.js";

/**
 * Compile one suite into a `node:test` describe block.
 *
 * Honors fbp-spec's `skip` (suite and case level, string reason) and
 * `timeout` (suite default, per-case override; fbp-spec default 2000ms).
 * Case names combine the case `name` with its required `assertion`
 * description.
 *
 * @param {Record<string, any>} suite
 * @param {{ loader: import("noflo").ComponentLoader }} context
 */
export function compileSuite(suite, context) {
  const describeOptions = suite.skip ? { skip: suite.skip } : {};
  describe(suite.name || suite.topic, describeOptions, () => {
    for (const testCase of suite.cases || []) {
      const timeout = testCase.timeout ?? suite.timeout ?? 2000;
      const testOptions = /** @type {{ timeout: number, skip?: string }} */ ({
        timeout,
      });
      if (testCase.skip) testOptions.skip = testCase.skip;
      const label = testCase.assertion
        ? `${testCase.name} — ${testCase.assertion}`
        : testCase.name;
      it(label, testOptions, () =>
        executeTestCase(context.loader, suite.topic, testCase, timeout),
      );
    }
  });
}

/**
 * Compile suites loaded from files, sharing one ComponentLoader. The
 * loader consumes a Node.js component registry discovering the project
 * under test (work document #16).
 *
 * @param {string[]} files - Spec file paths
 * @param {{ baseDir?: string }} [options]
 */
export async function compileSpecFiles(files, options = {}) {
  const registry = await createNodeModulesRegistry(
    options.baseDir ?? process.cwd(),
  );
  const loader = new noflo.ComponentLoader({ registry });
  for (const file of files) {
    const suites = await loadSuitesFromFile(file);
    for (const suite of suites) {
      compileSuite(suite, { loader });
    }
  }
}
