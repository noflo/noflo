import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fail, failed, fork, merge } from "../src/index.js";

describe("Message helpers", () => {
  describe("failing and detection", () => {
    it("fail() adds errors", () => {
      const err = new Error("Something went wrong");
      const msg = fail({ errors: [] }, err);
      assert.equal(msg.errors.length, 1);
      assert.equal(msg.errors[0], err);
    });

    it("failed() checks for errors", () => {
      const msg = fail({ errors: [] }, new Error("Boom"));
      assert.equal(failed(msg), true);
      assert.equal(failed({ errors: [] }), false);
    });

    it("fail() accepts an array of errors", () => {
      const one = new Error("One");
      const two = new Error("Two");
      const msg = fail({ errors: [] }, [one, two]);
      assert.deepEqual(msg.errors, [one, two]);
    });
  });

  describe("fork", () => {
    it("copies the message excluding keys", () => {
      const msg = { errors: [], id: 123, secret: "hide" };
      const forked = fork(msg, ["secret"]);
      assert.equal(forked.id, 123);
      assert.equal("secret" in forked, false);
      // The fork shares the errors array by default
      assert.equal(forked.errors, msg.errors);
    });

    it("clones selected keys", () => {
      const chassis = { frame: "Steel" };
      const msg = { errors: [], id: 1, chassis };
      const forked = fork(msg, [], ["chassis"]);
      assert.deepEqual(forked.chassis, chassis);
      assert.notEqual(forked.chassis, chassis);
    });
  });

  describe("merge", () => {
    it("fills missing keys from the extra", () => {
      const base = { errors: [], id: 123 };
      const merged = merge(base, { engine: "V8" });
      assert.equal(merged.engine, "V8");
      assert.equal(merged.id, 123);
    });

    it("does not overwrite defined base keys", () => {
      const base = { errors: [], id: 123 };
      const merged = merge(base, { id: 456, extra: 1 });
      assert.equal(merged.id, 123);
      assert.equal(merged.extra, 1);
    });
  });
});
