import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
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
      // The project's own library namespace: the reboot-stable identity a
      // signature upload materializes into (work document #19)
      await fs.writeFile(
        path.join(baseDir, "package.json"),
        JSON.stringify({ name: "proj" }),
        "utf-8",
      );
    });

    beforeEach(() => {
      invalidations = [];
      storedSources = [];
      // A minimal NodeModulesRegistry stand-in, keyed exactly like the real
      // one: registerComponent stores under the normalized `${prefix}/${name}`
      // (bare for library-less packages), while storeSource keys
      // `sourcesForComponents` as `${packageId}/${name}` — which for an
      // empty packageId is the `/${name}` form. The stand-in diverging from
      // that keying once masked a real implementation-wins bug
      registry = new EventTarget();
      registry.baseDir = baseDir;
      registry.components = {};
      registry.sourcesForComponents = {};
      registry.list = () => registry.components;
      registry.registerComponent = (packageId, name, definition) => {
        const prefix = packageId
          ? packageId.replace(/^@[a-z-]+\//, "").replace(/^noflo-/, "")
          : "";
        registry.components[packageId ? `${prefix}/${name}` : name] =
          definition;
      };
      registry.setSource = async (packageId, name, source, language) => {
        storedSources.push({ packageId, name, source, language });
        // Mirror the real storeSource's bookkeeping and change signal
        registry.sourcesForComponents[`${packageId}/${name}`] = {
          language,
          source,
        };
        registry.components[packageId ? `${packageId}/${name}` : name] = {
          getComponent: () => {},
        };
        registry.dispatchEvent(
          new CustomEvent("change", {
            detail: { name: `${packageId}/${name}` },
          }),
        );
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

    /**
     * A production-shaped catalog: the loader over the stand-in registry,
     * so re-derivation flows through the same objects the host uses.
     *
     * @returns {Promise<any>} The catalog
     */
    async function catalogUnderTest() {
      const loader = new ComponentLoader({ registry });
      return catalogFromLoader(loader, registry);
    }

    it("materializes a signature upload as a sidecar and registers the stub", async () => {
      const catalog = await catalogUnderTest();
      const sidecar = {
        name: "Planned",
        description: "Uploaded from the design session",
        inports: [{ name: "in", type: "string" }],
        outports: [{ name: "out", type: "all" }],
      };
      await catalog.writeSource("proj/Planned", JSON.stringify(sidecar));
      // The sidecar materialized in the project workdir, canonicalized
      const written = await fs.readFile(
        path.join(baseDir, "components", "Planned.json"),
        "utf-8",
      );
      assert.deepEqual(JSON.parse(written), sidecar);
      assert.match(written, /^\{\n {2}"description"/);
      // The stub registered as a factory and the catalog signaled the change
      const definition = registry.components["proj/Planned"];
      const instance = definition.getComponent();
      assert.equal(instance.isStub(), true);
      assert.equal(instance.stubName, "proj/Planned");
      assert.equal(instance.inPorts.ports.in.getDataType(), "string");
      assert.equal(invalidations.length, 1);
    });

    it("the uploaded stub is visible to clients without a restart", async () => {
      // The registry protocol refreshes from catalog.signatures() after
      // every 0x25 write; the snapshot must reflect the upload immediately,
      // and it must stay the same object the guard resolver holds
      const catalog = await catalogUnderTest();
      const snapshot = catalog.signatures();
      assert.ok(!("proj/Planned" in snapshot));
      const sidecar = {
        name: "Planned",
        inports: [{ name: "in", type: "string" }],
        outports: [],
      };
      await catalog.writeSource("proj/Planned", JSON.stringify(sidecar));
      const fresh = catalog.signatures();
      assert.strictEqual(fresh, snapshot);
      assert.equal(fresh["proj/Planned"].type, "stub");
      assert.deepEqual(
        fresh["proj/Planned"].in.map((p) => p.id),
        ["in"],
      );
    });

    it("registers a bare-name upload under the project's stable namespace", async () => {
      const catalog = await catalogUnderTest();
      const sidecar = {
        name: "BarePlanned",
        inports: [{ name: "in", type: "string" }],
        outports: [],
      };
      // Bare name: accepted, but the identity is the reboot-stable one —
      // what discovery re-derives on boot is the project-namespaced entry
      await catalog.writeSource("BarePlanned", JSON.stringify(sidecar));
      assert.ok(registry.components["proj/BarePlanned"]);
      assert.equal(
        (await catalog.signatures())["proj/BarePlanned"].type,
        "stub",
      );
    });

    it("rejects uploads naming another library", async () => {
      const catalog = await catalogUnderTest();
      const sidecar = { name: "Reverse", inports: [], outports: [] };
      // mylib is an installed library, not this project: the host does not
      // own its components, and materializing the stub under a foreign
      // prefix would change the component's identity on reboot
      await assert.rejects(
        () => catalog.writeSource("mylib/Reverse", JSON.stringify(sidecar)),
        /library prefix must be the project's own/,
      );
    });

    it("stores non-signature payloads as component source", async () => {
      const catalog = await catalogUnderTest();
      const source = "exports.getComponent = () => ({});";
      await catalog.writeSource("proj/Impl", source);
      assert.deepEqual(storedSources, [
        { packageId: "proj", name: "Impl", source, language: "javascript" },
      ]);
      assert.equal(invalidations.length, 0);
    });

    it("refuses to stub over an implementation file on disk", async () => {
      await fs.writeFile(
        path.join(baseDir, "components", "Real.js"),
        "exports.getComponent = () => ({});",
        "utf-8",
      );
      const catalog = await catalogUnderTest();
      const sidecar = { name: "Real", inports: [], outports: [] };
      await assert.rejects(
        () => catalog.writeSource("proj/Real", JSON.stringify(sidecar)),
        /already implemented/,
      );
    });

    it("refuses to stub over a stored implementation source", async () => {
      // Keyed the way the real registry's storeSource does — the form the
      // first cut of the check missed
      registry.sourcesForComponents["proj/Stored"] = {
        language: "javascript",
        source: "exports.getComponent = () => ({});",
      };
      const catalog = await catalogUnderTest();
      const sidecar = { name: "Stored", inports: [], outports: [] };
      await assert.rejects(
        () => catalog.writeSource("proj/Stored", JSON.stringify(sidecar)),
        /already implemented/,
      );
    });

    it("refuses to stub over a live non-stub catalog entry", async () => {
      registry.components["proj/Live"] = { getComponent: () => new Forward() };
      const catalog = await catalogUnderTest();
      const sidecar = { name: "Live", inports: [], outports: [] };
      await assert.rejects(
        () => catalog.writeSource("proj/Live", JSON.stringify(sidecar)),
        /already implemented/,
      );
    });

    it("rejects a constructor-invalid signature before any state changes", async () => {
      // A control-only signature under the throw policy can never fire;
      // persisting it would poison the workdir — the entry would vanish
      // from the snapshot and every boot would fail loading it
      const catalog = await catalogUnderTest();
      await assert.rejects(
        () =>
          catalog.writeSource(
            "proj/Bad",
            JSON.stringify({
              name: "Bad",
              inports: [{ name: "cfg", control: true }],
              outports: [],
            }),
          ),
        /declares no triggering inports/,
      );
      await assert.rejects(
        () =>
          catalog.writeSource(
            "proj/Bad",
            JSON.stringify({
              name: "Bad",
              inports: [
                { name: "in", type: "all" },
                { name: "in", type: "all" },
              ],
              outports: [],
            }),
          ),
        /twice/,
      );
      // No sidecar, no registration, no snapshot entry: the failed
      // upload left nothing behind
      await assert.rejects(() =>
        fs.access(path.join(baseDir, "components", "Bad.json")),
      );
      assert.equal(registry.components["proj/Bad"], undefined);
      assert.equal((await catalog.signatures())["proj/Bad"], undefined);
    });

    it("refining an existing stub's signature stays allowed", async () => {
      const catalog = await catalogUnderTest();
      await catalog.writeSource(
        "proj/Planned",
        JSON.stringify({
          name: "Planned",
          inports: [{ name: "in", type: "string" }],
          outports: [],
        }),
      );
      await catalog.writeSource(
        "proj/Planned",
        JSON.stringify({
          name: "Planned",
          inports: [{ name: "in", type: "number" }],
          outports: [],
        }),
      );
      const detail = (await catalog.signatures())["proj/Planned"];
      assert.deepEqual(
        detail.in.map((p) => p.id),
        ["in"],
      );
      assert.equal(detail.in[0].type, "number");
    });

    it("round-trips a stub's source as its signature sidecar", async () => {
      const catalog = await catalogUnderTest();
      const sidecar = {
        name: "Roundtrip",
        inports: [{ name: "in", type: "string" }],
        outports: [],
      };
      await catalog.writeSource("proj/Roundtrip", JSON.stringify(sidecar));
      const read = await catalog.readSource("proj/Roundtrip");
      assert.deepEqual(JSON.parse(/** @type {string} */ (read)), sidecar);
    });

    it("a stored implementation source wins the read over the sidecar", async () => {
      const catalog = await catalogUnderTest();
      await catalog.writeSource(
        "proj/Planned",
        JSON.stringify({
          name: "Planned",
          inports: [{ name: "in", type: "string" }],
          outports: [],
        }),
      );
      // The stub was implemented in place — source and signature are
      // orthogonal — so the read must report the implementation, not the
      // stale sidecar
      registry.sourcesForComponents["proj/Planned"] = {
        language: "javascript",
        source: "exports.getComponent = () => ({});",
      };
      assert.equal(
        await catalog.readSource("proj/Planned"),
        "exports.getComponent = () => ({});",
      );
    });

    it("answers nil source for components without code or sidecar", async () => {
      const catalog = await catalogUnderTest();
      assert.equal(await catalog.readSource("proj/Missing"), null);
    });
  });

  describe("catalogFromLoader against the real node-modules registry (work document #19)", () => {
    // The stand-in specs above pin the hook logic; this one pins the
    // integration with the real registry's own keying and discovery —
    // the layer a divergent stand-in once masked
    /** @type {string|null} */
    let baseDir = null;

    before(async () => {
      baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "noflo-catalog-real-"));
      await fs.writeFile(
        path.join(baseDir, "package.json"),
        JSON.stringify({ name: "proj" }),
        "utf-8",
      );
    });

    after(async () => {
      if (baseDir) {
        await fs.rm(baseDir, { recursive: true, force: true });
      }
    });

    it("uploads survive as sidecars and re-derive under the same name", async () => {
      const { createNodeModulesRegistry } = await import("@noflo/loader-node");
      const registry = await createNodeModulesRegistry(baseDir, {});
      const loader = new ComponentLoader({ registry });
      const catalog = await catalogFromLoader(loader, registry);
      await catalog.writeSource(
        "proj/Planned",
        JSON.stringify({
          name: "Planned",
          inports: [{ name: "in", type: "string" }],
          outports: [],
        }),
      );
      // The live snapshot sees the upload (the registry protocol's
      // post-write refresh reads exactly this)
      assert.equal((await catalog.signatures())["proj/Planned"].type, "stub");
      // A fresh boot re-derives the same identity from the sidecar
      const rebooted = await createNodeModulesRegistry(baseDir, {});
      const definition = rebooted.components["proj/Planned"];
      const instance = definition.getComponent();
      assert.equal(instance.isStub(), true);
      assert.equal(instance.stubName, "proj/Planned");
    });
  });
});
