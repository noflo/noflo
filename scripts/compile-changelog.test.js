import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildCompiledSection,
  compileChangelog,
  emitDoc,
  parseCategories,
  parseDoc,
  stampPackage,
} from "./compile-changelog.js";

const DATE = "2026-07-30";
const VER = "1.6.0";

test("parseDoc / emitDoc round-trip with blank-line normalization", () => {
  const text =
    "# Changelog\n## [Unreleased]\n### Added\n- a\n\n## [1.5.2] - 2026-01-01\n### Added\n- old\n";
  const doc = parseDoc(text);
  assert.equal(doc.title.join("\n"), "# Changelog");
  assert.equal(doc.sections.length, 2);
  assert.equal(doc.sections[0].header, "## [Unreleased]");
  assert.deepEqual(doc.sections[0].body, ["### Added", "- a"]);
  // Re-emitting normalizes to single blank lines between sections + title.
  const expected =
    "# Changelog\n\n## [Unreleased]\n### Added\n- a\n\n## [1.5.2] - 2026-01-01\n### Added\n- old\n";
  assert.equal(emitDoc(doc), expected);
});

test("parseCategories splits categories and keeps entry sub-lines, drops blanks", () => {
  const body = [
    "### Added",
    "- Feature Y",
    "  - subdetail",
    "- Feature Z",
    "",
    "### Changed (breaking)",
    "- Break X",
  ];
  const cats = parseCategories(body);
  assert.equal(cats.length, 2);
  assert.equal(cats[0].name, "Added");
  assert.deepEqual(cats[0].entries, [
    ["- Feature Y", "  - subdetail"],
    ["- Feature Z"],
  ]);
  assert.equal(cats[1].name, "Changed (breaking)");
  assert.deepEqual(cats[1].entries, [["- Break X"]]);
});

test("stampPackage stamps [Unreleased] and opens a fresh one", () => {
  const text = "# Changelog\n## [Unreleased]\n### Added\n- a\n";
  const out = stampPackage(text, VER, DATE);
  assert.equal(
    out,
    "# Changelog\n\n## [Unreleased]\n\n## [1.6.0] - 2026-07-30\n### Added\n- a\n",
  );
});

test("stampPackage returns null when there is no [Unreleased] (gap package)", () => {
  const text = "# Changelog\n\n## [1.5.2] - 2026-01-01\n### Added\n- old\n";
  assert.equal(stampPackage(text, VER, DATE), null);
});

test("buildCompiledSection merges packages, breaking-first, prefixed", () => {
  const perPkg = [
    {
      pkg: "noflo",
      cats: [
        {
          name: "Added",
          entries: [["- Feature Y", "  - subdetail"], ["- Feature Z"]],
        },
        { name: "Changed (breaking)", entries: [["- Break X"]] },
      ],
    },
    {
      pkg: "fbp-runner",
      cats: [{ name: "Added", entries: [["- New package thing"]] }],
    },
  ];
  assert.equal(
    buildCompiledSection(VER, DATE, perPkg),
    [
      "## [1.6.0] - 2026-07-30",
      "### Changed (breaking)",
      "- **noflo**: Break X",
      "### Added",
      "- **noflo**: Feature Y",
      "  - subdetail",
      "- **noflo**: Feature Z",
      "- **fbp-runner**: New package thing",
    ].join("\n"),
  );
});

test("compileChangelog end-to-end: stamps, skips gaps, writes root", () => {
  const root = mkdtempSync(join(tmpdir(), "noflo-cl-"));
  try {
    mkdirSync(join(root, "packages"), { recursive: true });
    const nofloDir = join(root, "packages", "noflo");
    const runnerDir = join(root, "packages", "fbp-runner");
    const idleDir = join(root, "packages", "idle");
    mkdirSync(nofloDir, { recursive: true });
    mkdirSync(runnerDir, { recursive: true });
    mkdirSync(idleDir, { recursive: true });

    const nofloOrig =
      "# Changelog\n## [Unreleased]\n### Changed (breaking)\n- Break X\n### Added\n- Feature Y\n  - subdetail\n- Feature Z\n\n## [1.5.2] - 2026-01-01\n### Added\n- Old thing\n";
    const runnerOrig =
      "# Changelog\n\n## [Unreleased]\n### Added\n- New package thing\n";
    // idle has NO [Unreleased] — must be skipped, leaving a version gap.
    const idleOrig =
      "# Changelog\n\n## [1.5.2] - 2026-01-01\n### Added\n- preexisting\n";
    writeFileSync(join(nofloDir, "CHANGELOG.md"), nofloOrig);
    writeFileSync(join(runnerDir, "CHANGELOG.md"), runnerOrig);
    writeFileSync(join(idleDir, "CHANGELOG.md"), idleOrig);

    const res = compileChangelog({
      version: VER,
      date: DATE,
      root,
      dryRun: false,
      log: () => {},
    });

    assert.deepEqual(res.stamped, ["noflo", "fbp-runner"]);
    assert.equal(res.skipped.length, 1);
    assert.equal(res.skipped[0].pkg, "idle");

    // Gap package is untouched.
    assert.equal(readFileSync(join(idleDir, "CHANGELOG.md"), "utf8"), idleOrig);

    // NoFlo is stamped: fresh [Unreleased] on top, old one -> [1.6.0].
    assert.equal(
      readFileSync(join(nofloDir, "CHANGELOG.md"), "utf8"),
      "# Changelog\n\n## [Unreleased]\n\n## [1.6.0] - 2026-07-30\n### Changed (breaking)\n- Break X\n### Added\n- Feature Y\n  - subdetail\n- Feature Z\n\n## [1.5.2] - 2026-01-01\n### Added\n- Old thing\n",
    );

    // Root is created with the compiled [1.6.0] section only (no old history).
    assert.equal(
      readFileSync(join(root, "CHANGELOG.md"), "utf8"),
      "# Changelog\n\n## [Unreleased]\n\n## [1.6.0] - 2026-07-30\n### Changed (breaking)\n- **noflo**: Break X\n### Added\n- **noflo**: Feature Y\n  - subdetail\n- **noflo**: Feature Z\n- **fbp-runner**: New package thing\n",
    );

    // Re-running for the same version is rejected (no duplicate sections).
    assert.throws(
      () =>
        compileChangelog({
          version: VER,
          date: DATE,
          root,
          dryRun: false,
          log: () => {},
        }),
      /already present/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
