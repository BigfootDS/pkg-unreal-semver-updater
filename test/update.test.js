const assert = require("node:assert/strict");
const { execFile: execFileCallback } = require("node:child_process");
const { mkdtemp, readFile, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { promisify } = require("node:util");
const test = require("node:test");

const {
  defaultUnrealProjectSettingsSection,
  isSemanticVersion,
  updateUnrealProjectVersion,
} = require("../dist/index.js");
const execFile = promisify(execFileCallback);

async function createConfig(content) {
  const directory = await mkdtemp(join(tmpdir(), "unreal-semver-updater-"));
  const projectPath = join(directory, "DefaultGame.ini");
  await writeFile(projectPath, content, "utf8");
  return projectPath;
}

test("updates Unreal's default project version without changing other settings", async () => {
  const projectPath = await createConfig(
    "[/Script/EngineSettings.GeneralProjectSettings]\nProjectName=DogfooderTwo\nProjectVersion=0.0.0\n\n[/Script/Engine.Engine]\nbUseFixedFrameRate=False\n",
  );

  const result = await updateUnrealProjectVersion({ projectPath, version: "1.2.3" });

  assert.deepEqual(result, {
    projectPath,
    section: defaultUnrealProjectSettingsSection,
    key: "ProjectVersion",
    previousVersion: "0.0.0",
    version: "1.2.3",
    changed: true,
  });
  assert.match(await readFile(projectPath, "utf8"), /ProjectVersion=1\.2\.3/);
});

test("adds the version to an existing section and preserves CRLF during dry runs", async () => {
  const original = "[/Script/EngineSettings.GeneralProjectSettings]\r\nProjectName=DogfooderTwo\r\n";
  const projectPath = await createConfig(original);

  const result = await updateUnrealProjectVersion({ projectPath, version: "1.2.3-beta.1", dryRun: true });

  assert.equal(result.changed, true);
  assert.equal(result.previousVersion, undefined);
  assert.equal(await readFile(projectPath, "utf8"), original);
});

test("adds the default section when it is missing", async () => {
  const projectPath = await createConfig("[/Script/Engine.Engine]\nbUseFixedFrameRate=False\n");

  await updateUnrealProjectVersion({ projectPath, version: "1.2.3" });

  assert.match(
    await readFile(projectPath, "utf8"),
    /\[\/Script\/EngineSettings\.GeneralProjectSettings\]\nProjectVersion=1\.2\.3/,
  );
});

test("supports custom INI sections and keys", async () => {
  const projectPath = await createConfig("[Build]\nVersion=1.0.0\n");

  const result = await updateUnrealProjectVersion({
    projectPath,
    version: "2.0.0",
    section: "Build",
    key: "Version",
  });

  assert.equal(result.previousVersion, "1.0.0");
  assert.match(await readFile(projectPath, "utf8"), /\[Build\]\nVersion=2\.0\.0/);
});

test("preserves quoted INI values", async () => {
  const projectPath = await createConfig(
    "[/Script/EngineSettings.GeneralProjectSettings]\nProjectVersion=\"1.0.0\"\n",
  );

  await updateUnrealProjectVersion({ projectPath, version: "2.0.0" });

  assert.match(await readFile(projectPath, "utf8"), /ProjectVersion="2\.0\.0"/);
});

test("validates strict Semantic Versioning 2.0.0 versions without a dependency", () => {
  for (const version of ["0.0.0", "1.2.3", "1.2.3-beta.1", "1.2.3-rc.1+build.42"]) {
    assert.equal(isSemanticVersion(version), true, version);
  }
  for (const version of ["1.2", "01.2.3", "1.02.3", "1.2.03", "v1.2.3", "1.2.3-01", "1.2.3+"]) {
    assert.equal(isSemanticVersion(version), false, version);
  }
});

test("allows a custom version when requested", async () => {
  const projectPath = await createConfig("[Build]\n");
  await updateUnrealProjectVersion({
    projectPath,
    version: "2026.08-nightly",
    section: "Build",
    key: "Version",
    validateSemver: false,
  });
  assert.match(await readFile(projectPath, "utf8"), /Version=2026\.08-nightly/);
});

test("the command-line interface updates a selected configuration file", async () => {
  const projectPath = await createConfig("[Build]\nVersion=1.0.0\n");
  await execFile(process.execPath, [
    "dist/cli.js",
    "--project", projectPath,
    "--section", "Build",
    "--key", "Version",
    "--version", "2.0.0",
  ]);
  assert.match(await readFile(projectPath, "utf8"), /Version=2\.0\.0/);
});

test("the command-line interface can normalize a v-prefixed tag", async () => {
  const projectPath = await createConfig("[Build]\n");
  await execFile(process.execPath, [
    "dist/cli.js",
    "--project", projectPath,
    "--section", "Build",
    "--key", "Version",
    "--version", "v2.0.0",
    "--strip-leading-v",
  ]);
  assert.match(await readFile(projectPath, "utf8"), /Version=2\.0\.0/);
});
