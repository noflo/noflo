// Diagnostics emitted by the component lifecycle in debug mode: the
// shutdown hang report (unconsumed buffered IPs), the discarded bracket
// context report, and the option case-typo warning. All debug-visible
// only; none change behavior for working code.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as noflo from "../src/lib/NoFlo.js";

/**
 * Captures console.error output while running the callback with the
 * given DEBUG namespaces enabled.
 * @param {string} namespaces
 * @param {() => Promise<void>} callback
 * @returns {Promise<string[]>}
 */
const captureDebug = async (namespaces, callback) => {
  const previousDebug = process.env.DEBUG;
  const originalError = console.error;
  /** @type {string[]} */
  const lines = [];
  console.error = (...args) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  process.env.DEBUG = namespaces;
  try {
    await callback();
  } finally {
    console.error = originalError;
    if (previousDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = previousDebug;
    }
  }
  return lines;
};

describe("Component shutdown diagnostics", () => {
  it("reports unconsumed buffered IPs at shutdown", async () => {
    const lines = await captureDebug("noflo:component", async () => {
      const c = new noflo.Component({
        inPorts: { in: { datatype: "string" } },
      });
      const ins = new noflo.internalSocket.InternalSocket();
      c.inPorts.in.attach(ins);
      // Buffer an IP without any process consuming it
      ins.post(new noflo.IP("data", "unconsumed"));
      await c.shutdown();
    });
    assert.ok(
      lines.some((line) =>
        line.includes(
          "still holds 1 unconsumed IPs at shutdown",
        ),
      ),
      `expected the unconsumed-IP report, got: ${JSON.stringify(lines)}`,
    );
  });

  it("stays silent when nothing is buffered", async () => {
    const lines = await captureDebug("noflo:component", async () => {
      const c = new noflo.Component({
        inPorts: { in: { datatype: "string" } },
      });
      const ins = new noflo.internalSocket.InternalSocket();
      c.inPorts.in.attach(ins);
      await c.shutdown();
    });
    assert.ok(
      !lines.some((line) => line.includes("unconsumed IPs")),
      `expected no unconsumed-IP report, got: ${JSON.stringify(lines)}`,
    );
  });

  it("reports discarded bracket contexts at shutdown", async () => {
    const lines = await captureDebug("noflo:component:brackets", async () => {
      const c = new noflo.Component({
        inPorts: { in: { datatype: "all" } },
        outPorts: { out: { datatype: "all" } },
      });
      // Simulate an activation that opened a forwarded bracket context
      // but never sent on the out port
      c.bracketContext.out.out = {
        null: [
          new noflo.IP("openBracket", "dangling"),
        ],
      };
      await c.shutdown();
    });
    assert.ok(
      lines.some((line) =>
        line.includes(
          "bracket context on 'out' discarded at shutdown",
        ),
      ),
      `expected the discarded-context report, got: ${JSON.stringify(lines)}`,
    );
  });
});

describe("Component option diagnostics", () => {
  it("warns on case-typo option keys", async () => {
    const lines = await captureDebug("noflo:component", async () => {
      new noflo.Component({
        // 1.x-era casing the 2.x engine ignores
        forwardbrackets: {},
      });
    });
    assert.ok(
      lines.some((line) =>
        line.includes("unknown option 'forwardbrackets'") &&
        line.includes("'forwardBrackets'"),
      ),
      `expected the option-typo warning, got: ${JSON.stringify(lines)}`,
    );
  });

  it("does not warn for unknown non-matching options", async () => {
    const lines = await captureDebug("noflo:component", async () => {
      // Extension-provided options (e.g. base-class hooks) are not
      // case-typed typos and must not trigger the warning
      new noflo.Component({
        validatess: { id: "num" },
      });
    });
    assert.ok(
      !lines.some((line) => line.includes("unknown option")),
      `expected no option warning, got: ${JSON.stringify(lines)}`,
    );
  });
});
