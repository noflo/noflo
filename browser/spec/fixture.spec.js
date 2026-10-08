// (c) 2021-2026 Henri Bergius
/**
 * @file browser/spec/fixture.spec.js
 * @description Asserts the no-build browser fixture (#18) runs the full
 *   static-registry flow in a real browser: import-map-resolved workspace
 *   packages, graph construction, network start, packet flow, live
 *   component registration via a registry `change` event, and network stop.
 */
import { expect, test } from "@playwright/test";

test("no-build static-registry flow completes in the browser", async ({
  page,
}) => {
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/browser/index.html");
  await expect(page.locator("#status")).toHaveText(
    /fixture complete: .+ → .+/,
    { timeout: 30_000 },
  );

  const result = await page.evaluate(() => window.__fixtureResult);
  expect(result.ok).toBe(true);
  const names = result.steps.map((step) => step.name);
  // The flow phases the fixture promises, in order.
  expect(names).toEqual([
    "registry and loader created",
    "graph built",
    "network connected",
    "network started",
    "packet flowed",
    "live-registered component ran",
    "network stopped",
  ]);
  expect(result.steps.find((s) => s.name === "packet flowed").detail).toEqual({
    output: "Hello browser",
  });
  expect(
    result.steps.find((s) => s.name === "live-registered component ran")
      .detail,
  ).toEqual({ output: "NOFLO" });

  // The #18 CSP contract: no runtime errors, which would also surface any
  // stray eval/new Function usage (the source guard keeps those out).
  expect(consoleErrors).toEqual([]);
});
