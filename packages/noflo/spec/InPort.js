// Direct InPort.has coverage: the validator-factory contract (work
// document #47). ProcessInput exercises the happy paths through every
// firing-pattern spec; these pin the guard against old-style calls
// regressing into a bare makeValidate TypeError.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import InPort from "../src/lib/InPort.js";

describe("InPort.has validator-factory contract", () => {
  const makePort = () => new InPort({ datatype: "all" });

  it("fails descriptively on an old-style two-arg call", () => {
    const port = makePort();
    assert.throws(
      () => port.has(null, () => true),
      /InPort\.has takes a validator factory/,
    );
  });

  it("fails descriptively when the factory is missing", () => {
    const port = makePort();
    assert.throws(
      () => port.has(null, null, /** @type {any} */ (undefined)),
      /InPort\.has takes a validator factory/,
    );
  });

  it("fails descriptively in hasStream when the factory is missing", () => {
    const port = makePort();
    assert.throws(
      () => port.hasStream(null, /** @type {any} */ (undefined)),
      /InPort\.hasStream takes a validator factory/,
    );
  });
});
