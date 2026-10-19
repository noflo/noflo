import assert from "node:assert/strict";
import { describe, it } from "node:test";
import noflo from "@noflo/noflo";
import { getComponent as getExtractField } from "../components/ExtractField.js";

/**
 * Instantiate the extractor with the given field path and attach the
 * message socket; return the sockets and the collected outputs/errors.
 *
 * @param {string} field
 * @returns {{ msg: noflo.internalSocket.InternalSocket, out: noflo.internalSocket.InternalSocket, error: noflo.internalSocket.InternalSocket, values: Array<any>, errors: Array<any> }}
 */
function makeExtractor(field) {
  const c = getExtractField({ "assembly.field": field });
  const msg = new noflo.internalSocket.InternalSocket();
  c.inPorts.ports.msg.attach(msg);
  /** @type {Array<any>} */
  const values = [];
  const out = new noflo.internalSocket.InternalSocket();
  c.outPorts.ports.out.attach(out);
  out.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      values.push(event.detail.data);
    }
  });
  /** @type {Array<any>} */
  const errors = [];
  const error = new noflo.internalSocket.InternalSocket();
  c.outPorts.ports.error.attach(error);
  error.addEventListener("ip", (event) => {
    if (event.detail.type === "data") {
      errors.push(event.detail.data);
    }
  });
  return { msg, out, error, values, errors };
}

describe("ExtractField field paths", () => {
  it("extracts a flat field", async () => {
    const e = makeExtractor("path");
    e.msg.post(new noflo.IP("data", { path: "/x/index.html", body: "b" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(e.values, ["/x/index.html"]);
    assert.deepEqual(e.errors, []);
  });

  it("extracts a nested path", async () => {
    const e = makeExtractor("frontmatter.head");
    e.msg.post(
      new noflo.IP("data", {
        frontmatter: { head: "title: Hello", body: "<p>hi</p>" },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(e.values, ["title: Hello"]);
    assert.deepEqual(e.errors, []);
  });

  it("extracts a deep path", async () => {
    const e = makeExtractor("a.b.c");
    e.msg.post(new noflo.IP("data", { a: { b: { c: 42 } } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(e.values, [42]);
  });

  it("delivers a present-but-null nested value", async () => {
    const e = makeExtractor("frontmatter.head");
    e.msg.post(new noflo.IP("data", { frontmatter: { head: null } }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(e.values, [null]);
  });

  it("errors on an absent nested segment, naming the full path", async () => {
    const e = makeExtractor("frontmatter.head");
    e.msg.post(new noflo.IP("data", { path: "/x" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(e.values, []);
    assert.equal(e.errors.length, 1);
    assert.match(
      String(e.errors[0].message ?? e.errors[0]),
      /lacks the mapped field 'frontmatter\.head'/,
    );
  });

  it("errors on an intermediate primitive", async () => {
    const e = makeExtractor("frontmatter.head");
    e.msg.post(new noflo.IP("data", { frontmatter: "raw string" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(e.values, []);
    assert.equal(e.errors.length, 1);
  });

  it("errors on an intermediate null", async () => {
    const e = makeExtractor("frontmatter.head");
    e.msg.post(new noflo.IP("data", { frontmatter: null }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(e.values, []);
    assert.equal(e.errors.length, 1);
  });
});
