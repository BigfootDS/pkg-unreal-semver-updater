import { readFile, writeFile } from "node:fs/promises";
import { isSemanticVersion } from "./semver.js";

export const defaultUnrealProjectSettingsSection = "/Script/EngineSettings.GeneralProjectSettings";
export const defaultUnrealProjectVersionKey = "ProjectVersion";

export interface UpdateUnrealProjectVersionOptions {
  /** Path to the Unreal configuration file, normally `Config/DefaultGame.ini`. */
  projectPath: string;
  /** The version to write. */
  version: string;
  /** INI section containing the version value. */
  section?: string;
  /** INI key containing the version value. */
  key?: string;
  /** Validate the supplied version using Semantic Versioning rules. @defaultValue true */
  validateSemver?: boolean;
  /** Calculate the update without writing the configuration file. */
  dryRun?: boolean;
}

export interface UpdateUnrealProjectVersionResult {
  projectPath: string;
  section: string;
  key: string;
  previousVersion?: string;
  version: string;
  changed: boolean;
}

interface RenderedProjectVersion {
  content: string;
  previousVersion?: string;
  changed: boolean;
}

/**
 * Updates an Unreal project version in an INI configuration file. By default this
 * writes `ProjectVersion` in Unreal's `GeneralProjectSettings` section.
 */
export async function updateUnrealProjectVersion(
  options: UpdateUnrealProjectVersionOptions,
): Promise<UpdateUnrealProjectVersionResult> {
  const section = options.section ?? defaultUnrealProjectSettingsSection;
  const key = options.key ?? defaultUnrealProjectVersionKey;
  validateOptions(options, section, key);

  const original = await readFile(options.projectPath, "utf8");
  const rendered = renderProjectVersion(original, section, key, options.version);

  if (rendered.changed && !options.dryRun) {
    await writeFile(options.projectPath, rendered.content, "utf8");
  }

  return {
    projectPath: options.projectPath,
    section,
    key,
    ...(rendered.previousVersion === undefined ? {} : { previousVersion: rendered.previousVersion }),
    version: options.version,
    changed: rendered.changed,
  };
}

function validateOptions(options: UpdateUnrealProjectVersionOptions, section: string, key: string): void {
  if (options.projectPath.trim().length === 0) throw new Error("projectPath must not be empty.");
  if (options.version.trim().length === 0) throw new Error("version must not be empty.");
  if (section.trim().length === 0) throw new Error("section must not be empty.");
  if (key.trim().length === 0) throw new Error("key must not be empty.");
  if (options.validateSemver !== false && !isSemanticVersion(options.version)) {
    throw new Error(`version must be a valid semantic version; received ${JSON.stringify(options.version)}.`);
  }
}

function renderProjectVersion(
  content: string,
  section: string,
  key: string,
  version: string,
): RenderedProjectVersion {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const targetSection = findSection(content, section);

  if (targetSection === undefined) {
    const separator = content.length === 0 || content.endsWith("\n") ? "" : newline;
    return {
      content: `${content}${separator}[${section}]${newline}${key}=${version}${newline}`,
      changed: true,
    };
  }

  const sectionContent = content.slice(targetSection.bodyStart, targetSection.end);
  const escapedKey = escapeRegex(key);
  const existingVersion = new RegExp(
    `^([\\t ]*${escapedKey}[\\t ]*=[\\t ]*)(.*?)(\\r?)(?=\\n|$)`,
    "m",
  ).exec(sectionContent);

  if (existingVersion !== null) {
    const [, prefix = "", currentValue = "", lineEnding = ""] = existingVersion;
    const previousVersion = parseIniValue(currentValue.trim());
    const replacement = `${prefix}${renderIniValue(version, currentValue)}${lineEnding}`;
    const updatedSection = sectionContent.replace(existingVersion[0], replacement);
    const updatedContent = `${content.slice(0, targetSection.bodyStart)}${updatedSection}${content.slice(
      targetSection.end,
    )}`;

    return {
      content: updatedContent,
      ...(previousVersion === undefined ? {} : { previousVersion }),
      changed: updatedContent !== content,
    };
  }

  return {
    content: `${content.slice(0, targetSection.bodyStart)}${newline}${key}=${version}${sectionContent}${content.slice(
      targetSection.end,
    )}`,
    changed: true,
  };
}

function findSection(content: string, name: string): { bodyStart: number; end: number } | undefined {
  const sectionPattern = /^[\t ]*\[([^\]]+)\][\t ]*(?:[;#].*)?\r?$/gm;
  let match: RegExpExecArray | null;
  let matchingSection: RegExpExecArray | undefined;

  while ((match = sectionPattern.exec(content)) !== null) {
    if (matchingSection !== undefined) {
      return { bodyStart: matchingSection.index + matchingSection[0].length, end: match.index };
    }
    if (match[1] === name) matchingSection = match;
  }

  return matchingSection === undefined
    ? undefined
    : { bodyStart: matchingSection.index + matchingSection[0].length, end: content.length };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseIniValue(value: string): string | undefined {
  if (value.length === 0) return undefined;
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value;
  }
}

function renderIniValue(version: string, previousValue: string): string {
  const trimmed = previousValue.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? JSON.stringify(version) : version;
}
