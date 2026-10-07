import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as noflo from "../src/lib/NoFlo.js";

let browser;
if (
  typeof process !== "undefined" &&
  process.execPath &&
  process.execPath.match(/node|iojs/)
) {
  browser = false;
} else {
  browser = true;
}

describe("NoFlo interface", () => {
  it("should be able to tell whether it is running on browser", () => {
    assert.equal(noflo.isBrowser(), browser);
  });
});
