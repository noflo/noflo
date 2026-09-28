import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadSuitesFromFile } from "../src/loader.js";

describe("spec file loading", () => {
  it("loads a single YAML suite", async () => {
    const suites = await loadSuitesFromFile("spec/fixtures/repeat.yaml");
    assert.equal(suites.length, 1);
    assert.equal(suites[0].topic, "Repeat");
    assert.ok(suites[0].cases.length > 0);
  });
  it("loads multi-document YAML as multiple suites", async () => {
    const suites = await loadSuitesFromFile("spec/fixtures/multi.yaml");
    assert.equal(suites.length, 2);
    assert.equal(suites[0].topic, "Repeat");
    assert.equal(suites[1].skip, "entire suite skipped");
  });
  it("loads a JSON suite", async () => {
    const suites = await loadSuitesFromFile("spec/fixtures/repeat.json");
    assert.equal(suites.length, 1);
    assert.equal(suites[0].name, "Repeat from JSON");
  });
  it("rejects suites without a topic", async () => {
    await assert.rejects(
      loadSuitesFromFile("spec/fixtures/notopic.json"),
      /missing a 'topic'/,
    );
  });
  it("rejects suites with non-array cases", async () => {
    await assert.rejects(
      loadSuitesFromFile("spec/fixtures/badcases.json"),
      /non-array 'cases'/,
    );
  });
  it("rejects unsupported file formats", async () => {
    await assert.rejects(
      loadSuitesFromFile("spec/fixtures/repeat.txt"),
      /Unsupported spec file format/,
    );
  });
});
