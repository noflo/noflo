import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { Component, ComponentLoader } from "@noflo/noflo";
import { catalogFromLoader, componentDetail } from "../src/catalog.js";

class Forward extends Component {
  constructor() {
    super({
      description: "Forwards",
      inPorts: {
        in: { datatype: "string", required: true },
        config: { datatype: "string", control: true, required: true },
      },
      outPorts: { out: { datatype: "string" } },
    });
    this.process(function process(input, output) {
      if (!input.hasData("in")) {
        return;
      }
      output.sendDone({ out: input.getData("in") });
    });
  }
}

class NoPorts extends Component {
  constructor() {
    super({});
    this.process(function process() {});
  }
}

const registry = {
  list: () => ({
    "test/Forward": { getComponent: () => new Forward() },
    "test/NoPorts": { getComponent: () => new NoPorts() },
  }),
  get: (name) => {
    const implementations = {
      "test/Forward": { getComponent: () => new Forward() },
      "test/NoPorts": { getComponent: () => new NoPorts() },
    };
    const implementation = implementations[name];
    return implementation
      ? Promise.resolve(implementation)
      : Promise.resolve(undefined);
  },
};

describe("catalog", () => {
  describe("componentDetail", () => {
    it("derives the wire signature from an instantiated component", async () => {
      const detail = await componentDetail(new Forward());
      assert.equal(detail.type, "elementary");
      assert.deepEqual(
        detail.in.map((p) => p.id),
        ["in", "config"],
      );
      assert.equal(detail.in[0].type, "string");
      assert.equal(detail.in[0].required, true);
      assert.equal(detail.in[0].control, undefined);
      assert.equal(detail.in[1].control, true);
      assert.deepEqual(
        detail.out.map((p) => p.id),
        ["out"],
      );
      assert.equal(detail.out[0].type, "string");
    });

    it("advertises schema references and derived guards from source", async () => {
      const { Component: Base } = await import("@noflo/noflo");
      class Typed extends Base {
        constructor() {
          super({
            inPorts: {
              count: { datatype: "string", schema: { enum: ["a", "b"] } },
              named: { datatype: "object", schema: "example/thing" },
              pinned: {
                datatype: "object",
                schema: { id: "example/thing", digest: "c".repeat(64) },
              },
              guarded: {
                datatype: "number",
                guard: { type: "number", min: 0 },
              },
            },
            outPorts: { out: { datatype: "all" } },
          });
          this.process(() => {});
        }
      }
      const detail = await componentDetail(new Typed());
      const byId = Object.fromEntries(detail.in.map((p) => [p.id, p]));
      assert.deepEqual(byId.count.guard, { enum: ["a", "b"] });
      assert.match(byId.count.schema.digest, /^[0-9a-f]{64}$/);
      assert.deepEqual(byId.named.schema, { id: "example/thing" });
      assert.deepEqual(byId.pinned.schema, {
        id: "example/thing",
        digest: "c".repeat(64),
      });
      assert.deepEqual(byId.guarded.guard, { type: "number", min: 0 });
    });

    it("fails loudly on a guard outside the closed vocabulary", async () => {
      const { Component: Base } = await import("@noflo/noflo");
      class Bad extends Base {
        constructor() {
          super({
            inPorts: {
              x: { datatype: "all", guard: { pattern: "^a" } },
            },
            outPorts: { out: { datatype: "all" } },
          });
          this.process(() => {});
        }
      }
      await assert.rejects(() => componentDetail(new Bad()), /vocabulary/);
    });
  });

  describe("catalogFromLoader", () => {
    it("harvests every component in the loader's catalog", async () => {
      const loader = new ComponentLoader({
        registry: /** @type {any} */ (registry),
      });
      const catalog = await catalogFromLoader(loader);
      const signatures = await catalog.signatures();
      assert.deepEqual(Object.keys(signatures).sort(), [
        "test/Forward",
        "test/NoPorts",
      ]);
      assert.equal(signatures["test/Forward"].type, "elementary");
      assert.equal(signatures["test/NoPorts"].in.length, 0);
      assert.equal(signatures["test/NoPorts"].out.length, 0);
    });

    it("reports stub components as the stub kind (work document #19)", async () => {
      const { StubComponent } = await import("@noflo/noflo");
      const detail = await componentDetail(
        StubComponent.fromSignature("test/Planned", {
          description: "Declared, not implemented",
          inports: [{ name: "in", datatype: "string" }],
          outports: [{ name: "out", datatype: "all" }],
        }),
      );
      assert.equal(detail.type, "stub");
      assert.deepEqual(
        detail.in.map((p) => p.id),
        ["in"],
      );
    });
  });

  describe("catalogFromLoader with the registry source hooks (work document #19)", () => {
    /** @type {string|null} */
    let baseDir = null;
    /** @type {any} */
    let registry = null;
    /** @type {Array<any>} */
    let invalidations = null;
    /** @type {Array<any>} */
    let storedSources = null;

    before(async () => {
      baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "noflo-catalog-"));
    });

    beforeEach(() => {
      invalidations = [];
      storedSources = [];
      // A minimal NodeModulesRegistry stand-in: the catalog hook uses the
      // registry's persistence root, registration surface, and change
      // signaling — the real registry's discovery specs cover those
      registry = new EventTarget();
      registry.baseDir = baseDir;
      registry.components = {};
      registry.sourcesForComponents = {};
      registry.registerComponent = (packageId, name, definition) => {
        const prefix = packageId
          ? packageId.replace(/^@[a-z-]+\//, "").replace(/^noflo-/, "")
          : "";
        registry.components[packageId ? `${prefix}/${name}` : name] =
          definition;
      };
      registry.setSource = async (packageId, name, source, language) => {
        storedSources.push({ packageId, name, source, language });
      };
      registry.getSource = async () => {
        throw new Error("Can't provide source. Not a file");
      };
      registry.addEventListener("invalidate", () => {
        invalidations.push(true);
      });
      registry.invalidate = () => {
        registry.dispatchEvent(new Event("invalidate"));
      };
    });

    it("materializes a signature upload as a sidecar and registers the stub", async () => {
      const loader = new ComponentLoader({
        registry: { list: () => ({}) },
      });
      const catalog = await catalogFromLoader(loader, registry);
      const sidecar = {
        name: "Planned",
        description: "Uploaded from the design session",
        inports: [{ name: "in", type: "string" }],
        outports: [{ name: "out", type: "all" }],
      };
      await catalog.writeSource("test/Planned", JSON.stringify(sidecar));
      // The sidecar materialized in the project workdir, canonicalized
      const written = await fs.readFile(
        path.join(baseDir, "components", "Planned.json"),
        "utf-8",
      );
      assert.deepEqual(JSON.parse(written), sidecar);
      assert.match(written, /^\{\n {2}"description"/);
      // The stub registered as a factory and the catalog signaled the change
      const definition = registry.components["test/Planned"];
      const instance = definition.getComponent();
      assert.equal(instance.isStub(), true);
      assert.equal(instance.stubName, "test/Planned");
      assert.equal(instance.inPorts.ports.in.getDataType(), "string");
      assert.equal(invalidations.length, 1);
    });

    it("stores non-signature payloads as component source", async () => {
      const loader = new ComponentLoader({
        registry: { list: () => ({}) },
      });
      const catalog = await catalogFromLoader(loader, registry);
      const source = "exports.getComponent = () => ({});";
      await catalog.writeSource("test/Impl", source);
      assert.deepEqual(storedSources, [
        { packageId: "test", name: "Impl", source, language: "javascript" },
      ]);
      assert.equal(invalidations.length, 0);
    });

    it("refuses to stub over an existing implementation", async () => {
      await fs.writeFile(
        path.join(baseDir, "components", "Real.js"),
        "exports.getComponent = () => ({});",
        "utf-8",
      );
      const loader = new ComponentLoader({
        registry: { list: () => ({}) },
      });
      const catalog = await catalogFromLoader(loader, registry);
      const sidecar = {
        name: "Real",
        inports: [],
        outports: [],
      };
      await assert.rejects(
        () => catalog.writeSource("test/Real", JSON.stringify(sidecar)),
        /already implemented/,
      );
    });

    it("round-trips a stub's source as its signature sidecar", async () => {
      const loader = new ComponentLoader({
        registry: { list: () => ({}) },
      });
      const catalog = await catalogFromLoader(loader, registry);
      const sidecar = {
        name: "Roundtrip",
        inports: [{ name: "in", type: "string" }],
        outports: [],
      };
      await catalog.writeSource("test/Roundtrip", JSON.stringify(sidecar));
      const read = await catalog.readSource("test/Roundtrip");
      assert.deepEqual(JSON.parse(/** @type {string} */ (read)), sidecar);
    });

    it("answers nil source for components without code or sidecar", async () => {
      const loader = new ComponentLoader({
        registry: { list: () => ({}) },
      });
      const catalog = await catalogFromLoader(loader, registry);
      assert.equal(await catalog.readSource("test/Missing"), null);
    });
  });
});
