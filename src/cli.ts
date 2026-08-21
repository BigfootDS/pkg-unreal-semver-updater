#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  defaultUnrealProjectSettingsSection,
  defaultUnrealProjectVersionKey,
  updateUnrealProjectVersion,
} from "./index.js";

const help = `Usage: unreal-semver-updater --version <version> [options]

Update an Unreal project version in an INI configuration file.

Options:
  -p, --project <path>     Configuration file (default: Config/DefaultGame.ini)
  -v, --version <version>  Semantic version to write (required)
      --section <name>     INI section (default: ${defaultUnrealProjectSettingsSection})
      --key <name>         INI key (default: ${defaultUnrealProjectVersionKey})
      --strip-leading-v    Remove one leading v from the version
      --allow-non-semver   Do not validate the version as semantic versioning
      --dry-run            Report the change without writing the file
  -h, --help               Show this help message
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      project: { type: "string", short: "p", default: "Config/DefaultGame.ini" },
      version: { type: "string", short: "v" },
      section: { type: "string", default: defaultUnrealProjectSettingsSection },
      key: { type: "string", default: defaultUnrealProjectVersionKey },
      "strip-leading-v": { type: "boolean", default: false },
      "allow-non-semver": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (values.version === undefined) throw new Error("--version is required. Run with --help for usage.");

  const version = values["strip-leading-v"] && values.version.startsWith("v")
    ? values.version.slice(1)
    : values.version;
  const result = await updateUnrealProjectVersion({
    projectPath: values.project ?? "Config/DefaultGame.ini",
    version,
    section: values.section ?? defaultUnrealProjectSettingsSection,
    key: values.key ?? defaultUnrealProjectVersionKey,
    validateSemver: !values["allow-non-semver"],
    dryRun: values["dry-run"],
  });

  const verb = values["dry-run"] ? "Would update" : "Updated";
  const previous = result.previousVersion === undefined ? "(unset)" : result.previousVersion;
  process.stdout.write(
    `${verb} ${result.projectPath} [${result.section}] ${result.key}: ${previous} -> ${result.version}${result.changed ? "" : " (unchanged)"}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`unreal-semver-updater: ${message}\n`);
  process.exitCode = 1;
});
