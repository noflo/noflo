//     (c) 2021-2026 Henri Bergius

import assert from "node:assert/strict";
import path from "node:path";
import { before, describe, it } from "node:test";
import { GraphModel } from "@noflo/graph";
import { createNodeModulesRegistry } from "../src/index.js";

const fixtureDir = path.resolve(import.meta.dirname, "fixtures");
const discoveryDir = path.resolve(fixtureDir, "discovery");
const brokenDir = path.resolve(fixtureDir, "brokendeps");

/**
 * Registry entries are component definitions; instantiate one for
 * port-level assertions.
 *
 * @param {Object|Function} definition
 * @returns {any} Component instance
 */
function instantiate(definition) {
  if (typeof definition.getComponent === "function") {
    return definition.getComponent();
  }
  return definition();
}

/**
 * Discovery parity fixtures for local node_modules discovery
 * (work document #24). These specs pin the behavior of the current
 * fbp-manifest-based discovery as the contract the local walker
 * replacement must keep.
 */
describe("node_modules discovery contract", () => {
  /** @type {import("../src/index.js").NodeModulesRegistry} */
  let registry = null;

  before(async () => {
    registry = await createNodeModulesRegistry(discoveryDir, {});
  });

  it("discovers components via directory scan", () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("discoveryroot/Alpha"));
    assert.ok(Object.keys(list).includes("discoveryroot/Deep"));
  });

  it("derives component names from source annotations", () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("discoveryroot/CustomName"));
    assert.ok(!Object.keys(list).includes("discoveryroot/Named"));
  });

  it("discovers graph components from the graphs directory", async () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("discoveryroot/SomeGraph"));
    const definition = await registry.get("discoveryroot/SomeGraph");
    assert.ok(definition instanceof GraphModel);
  });

  it("excludes main graphs from discovery", () => {
    const list = registry.list();
    assert.ok(!Object.keys(list).includes("discoveryroot/Main"));
  });

  it("ignores the noflo.components map in package.json", () => {
    // fbp-manifest discovers from directories only; a components map
    // entry without a corresponding file must not appear
    const list = registry.list();
    assert.ok(!Object.keys(list).includes("discoveryroot/Ghost"));
  });

  it("discovers scoped dependencies with the scope stripped from the library name", async () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("scopedpkg/Beta"));
    const definition = await registry.get("scopedpkg/Beta");
    assert.ok(instantiate(definition).inPorts.ports.in);
    assert.strictEqual(registry.libraryIcons.scopedpkg, "heart");
  });

  it("strips the noflo- prefix from library names", async () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("tool/Gamma"));
    const definition = await registry.get("tool/Gamma");
    assert.ok(instantiate(definition).inPorts.ports.in);
  });

  it("maps a package named noflo to the empty library name", async () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("Delta"));
    const definition = await registry.get("Delta");
    assert.ok(instantiate(definition).inPorts.ports.in);
  });

  it("ignores packages without discoverable components", () => {
    const list = registry.list();
    assert.ok(!Object.keys(list).some((k) => k.startsWith("plainpkg")));
  });

  it("discovers packages through symlinks", async () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("linkpkg/Epsilon"));
    const definition = await registry.get("linkpkg/Epsilon");
    assert.ok(instantiate(definition).inPorts.ports.in);
    assert.strictEqual(registry.libraryIcons.linkpkg, "bolt");
  });

  it("discovers dependencies of dependencies recursively", () => {
    const list = registry.list();
    assert.ok(Object.keys(list).includes("outer/Outer"));
    assert.ok(Object.keys(list).includes("inner/Inner"));
  });

  it("ignores components of other runtimes", () => {
    // The msgflo-annotated component is dropped by discovery, which
    // only recognizes the noflo family of runtimes (work document #24)
    const list = registry.list();
    assert.ok(!Object.keys(list).includes("discoveryroot/wrongruntime"));
  });

  it("associates fbp-spec tests with discovered components", () => {
    // Discovered file components have no stored source, so the spec
    // association is asserted against the registry's spec map
    assert.strictEqual(
      registry.specsForComponents["discoveryroot/Alpha"],
      "spec/Alpha.yaml",
    );
  });

  it("skips dependencies without package.json", () => {
    // Work document #24: a node_modules entry without package.json is
    // not a package and is skipped, not faked from the directory name
    const list = registry.list();
    assert.ok(!Object.keys(list).includes("nopackage/Zeta"));
  });

  describe("signature sidecars (work documents #19 and #24)", () => {
    it("discovers a stub-only sidecar as a StubComponent", async () => {
      const list = registry.list();
      assert.ok(Object.keys(list).includes("discoveryroot/Stubbed"));
      const definition = await registry.get("discoveryroot/Stubbed");
      const instance = instantiate(definition);
      assert.strictEqual(instance.isStub(), true);
      assert.strictEqual(instance.stubName, "discoveryroot/Stubbed");
      // The sidecar's declared signature: type maps onto datatype,
      // description and icon come from the file
      assert.strictEqual(instance.inPorts.ports.in.getDataType(), "string");
      assert.strictEqual(
        instance.inPorts.ports.options.getDataType(),
        "object",
      );
      assert.strictEqual(instance.outPorts.ports.out.getDataType(), "all");
      assert.strictEqual(
        instance.description,
        "A declared signature with no implementation",
      );
      assert.strictEqual(instance.icon, "gear");
    });

    it("instantiates each load independently", async () => {
      const definition = await registry.get("discoveryroot/Stubbed");
      const first = instantiate(definition);
      const second = instantiate(definition);
      assert.notStrictEqual(first, second);
    });

    it("keeps the implementation when a source and a sidecar share a name", async () => {
      const list = registry.list();
      assert.ok(Object.keys(list).includes("discoveryroot/WithImpl"));
      const definition = await registry.get("discoveryroot/WithImpl");
      const instance = instantiate(definition);
      // The .js sibling wins; the sidecar is documentation, not a second
      // component
      assert.strictEqual(instance.isStub(), false);
      assert.strictEqual(
        instance.description,
        "Implemented sibling of a signature sidecar",
      );
    });

    it("ignores JSON files in components directories that are not sidecars", () => {
      // A stray JSON file (or a misplaced graph) stays undiscovered,
      // as before sidecars existed
      const list = registry.list();
      assert.ok(!Object.keys(list).includes("discoveryroot/Stray"));
    });
  });
});

describe("node_modules discovery error handling", () => {
  it("fails discovery on a malformed dependency package.json", async () => {
    await assert.rejects(createNodeModulesRegistry(brokenDir, {}));
  });
});
