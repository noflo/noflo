import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyVersionBump,
  currentBranch,
  discoverInternalPackages,
  gitOriginUrl,
  isNpmNotFound,
  packageMetas,
} from "./release.js";

test("applyVersionBump bumps version and rewrites internal dep refs", () => {
  const before = {
    name: "fbp-runner",
    version: "1.5.2",
    dependencies: { noflo: "^1.5.2", fbp: "^1.5.0" },
  };
  const after = applyVersionBump(before, "1.6.0", ["noflo"]);
  assert.equal(after.version, "1.6.0");
  assert.equal(after.dependencies.noflo, "^1.6.0");
  // external dep untouched
  assert.equal(after.dependencies.fbp, "^1.5.0");
  // input not mutated
  assert.equal(before.version, "1.5.2");
  assert.equal(before.dependencies.noflo, "^1.5.2");
  assert.notEqual(after.dependencies, before.dependencies);
});

test("applyVersionBump leaves packages without the internal dep alone", () => {
  const noflo = { name: "noflo", version: "1.5.2" };
  const after = applyVersionBump(noflo, "1.6.0", ["noflo"]);
  assert.equal(after.version, "1.6.0");
  assert.equal(after.dependencies, undefined);
  assert.equal(noflo.version, "1.5.2");
});

test("applyVersionBump rewrites internal refs in dev and peer sections too", () => {
  const before = {
    name: "@noflo/loader-node",
    version: "2.0.0-alpha.1",
    dependencies: { "@noflo/graph": "^2.0.0-alpha.1" },
    peerDependencies: { "@noflo/noflo": "*" },
    devDependencies: { "@noflo/noflo": "*", "@types/node": "^24.0.0" },
  };
  const after = applyVersionBump(before, "2.0.0-alpha.2", [
    "@noflo/noflo",
    "@noflo/graph",
  ]);
  assert.equal(after.peerDependencies["@noflo/noflo"], "^2.0.0-alpha.2");
  assert.equal(after.devDependencies["@noflo/noflo"], "^2.0.0-alpha.2");
  // external dev dep untouched
  assert.equal(after.devDependencies["@types/node"], "^24.0.0");
  assert.equal(after.dependencies["@noflo/graph"], "^2.0.0-alpha.2");
});

test("applyVersionBump bumps a jsr.json-shaped manifest (version only)", () => {
  const jsr = {
    name: "@noflo/noflo",
    version: "1.5.2",
    exports: { ".": "./src/lib/NoFlo.js" },
    publish: { include: ["src/"] },
  };
  const after = applyVersionBump(jsr, "1.6.0", ["noflo"]);
  assert.equal(after.version, "1.6.0");
  // non-version fields preserved
  assert.deepEqual(after.exports, { ".": "./src/lib/NoFlo.js" });
  assert.deepEqual(after.publish, { include: ["src/"] });
  // input not mutated
  assert.equal(jsr.version, "1.5.2");
});

test("packageMetas picks up jsr.json next to package.json", () => {
  const root = mkdtempSync(join(tmpdir(), "noflo-jsr-"));
  try {
    mkdirSync(join(root, "packages", "noflo"), { recursive: true });
    mkdirSync(join(root, "packages", "bare"), { recursive: true });

    writeFileSync(
      join(root, "packages", "noflo", "package.json"),
      JSON.stringify({ name: "noflo", version: "1.5.2" }),
    );
    writeFileSync(
      join(root, "packages", "noflo", "jsr.json"),
      JSON.stringify({
        name: "@noflo/noflo",
        version: "1.5.2",
        exports: { ".": "./src/lib/NoFlo.js" },
      }),
    );
    writeFileSync(
      join(root, "packages", "bare", "package.json"),
      JSON.stringify({ name: "bare-pkg", version: "1.5.2" }),
    );

    const metas = packageMetas(root);
    const noflo = metas.find((m) => m.name === "noflo");
    assert.ok(noflo.jsrPath);
    assert.ok(existsSync(noflo.jsrPath));
    assert.equal(noflo.jsrJson.version, "1.5.2");

    const bare = metas.find((m) => m.name === "bare");
    assert.equal(bare.jsrPath, null);
    assert.equal(bare.jsrJson, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverInternalPackages reads workspace names dynamically", () => {
  const root = mkdtempSync(join(tmpdir(), "noflo-rel-"));
  try {
    mkdirSync(join(root, "packages", "noflo"), { recursive: true });
    mkdirSync(join(root, "packages", "fbp-runner"), { recursive: true });
    writeFileSync(
      join(root, "packages", "noflo", "package.json"),
      JSON.stringify({ name: "noflo", version: "1.5.2" }),
    );
    writeFileSync(
      join(root, "packages", "fbp-runner", "package.json"),
      JSON.stringify({
        name: "fbp-runner",
        version: "1.5.2",
        dependencies: { noflo: "^1.5.2" },
      }),
    );

    assert.deepEqual([...discoverInternalPackages(root)].sort(), [
      "fbp-runner",
      "noflo",
    ]);

    // packageMetas carries both manifests
    const metas = packageMetas(root);
    assert.equal(metas.length, 2);
    assert.deepEqual(metas.map((m) => m.json.name).sort(), [
      "fbp-runner",
      "noflo",
    ]);

    // A companion's internal dep ref is rewritten with the discovered names
    const runner = metas.find((m) => m.name === "fbp-runner").json;
    const after = applyVersionBump(runner, "1.6.0", [
      ...discoverInternalPackages(root),
    ]);
    assert.equal(after.dependencies.noflo, "^1.6.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isNpmNotFound recognizes npm's missing-package errors", () => {
  assert.equal(
    isNpmNotFound(
      "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@noflo/ghost",
    ),
    true,
  );
  assert.equal(
    isNpmNotFound(
      "npm error code E404 '@noflo/ghost' is not in the npm registry.",
    ),
    true,
  );
  // network/auth failures must not be misread as "unpublished"
  assert.equal(isNpmNotFound("npm error network request failed"), false);
  assert.equal(isNpmNotFound("npm error code ENEEDAUTH"), false);
  assert.equal(isNpmNotFound(""), false);
});

test("gitOriginUrl reads the origin remote url", () => {
  const root = mkdtempSync(join(tmpdir(), "noflo-git-"));
  try {
    execSync("git init -q", { cwd: root });
    execSync("git remote add origin rns://abcd1234deadbeef/public/noflo", {
      cwd: root,
    });
    assert.equal(gitOriginUrl(root), "rns://abcd1234deadbeef/public/noflo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gitOriginUrl returns null when there is no origin remote", () => {
  const root = mkdtempSync(join(tmpdir(), "noflo-git-"));
  try {
    execSync("git init -q", { cwd: root });
    assert.equal(gitOriginUrl(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("currentBranch reads the checked-out branch name", () => {
  const root = mkdtempSync(join(tmpdir(), "noflo-branch-"));
  try {
    execSync("git init -q -b main", { cwd: root });
    execSync(
      'git config user.name "Test" && git config user.email test@example.com',
      { cwd: root },
    );
    writeFileSync(join(root, "seed.txt"), "seed");
    execSync("git add seed.txt && git commit -q -m seed", { cwd: root });
    assert.equal(currentBranch(root), "main");
    execSync("git checkout -q -b release-branch", { cwd: root });
    assert.equal(currentBranch(root), "release-branch");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("currentBranch returns null on a detached HEAD", () => {
  const root = mkdtempSync(join(tmpdir(), "noflo-detached-"));
  try {
    execSync("git init -q -b main", { cwd: root });
    execSync(
      'git config user.name "Test" && git config user.email test@example.com',
      { cwd: root },
    );
    writeFileSync(join(root, "seed.txt"), "seed");
    execSync("git add seed.txt && git commit -q -m seed", { cwd: root });
    execSync("git checkout -q --detach HEAD", { cwd: root });
    assert.equal(currentBranch(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
