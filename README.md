# Unreal SemVer Updater

Update an Unreal Engine project's game version from Node.js or the command line.

By default, the package updates `ProjectVersion` in Unreal's standard project settings location:

```ini
[/Script/EngineSettings.GeneralProjectSettings]
ProjectVersion=1.2.3
```

## Requirements

Node.js 20 or later.

## Command line

Run the package without installing it globally:

```sh
npx @bigfootds/unreal-semver-updater --version 1.2.3
```

The default configuration file is `Config/DefaultGame.ini`. Override the file, section, or key for projects with a custom layout:

```sh
npx @bigfootds/unreal-semver-updater \
  --project path/to/Config/DefaultGame.ini \
  --section Build \
  --key Version \
  --version 1.2.3-beta.1
```

Versions are validated as [semantic versions](https://semver.org/) by default. Use `--allow-non-semver` for a custom version string, `--strip-leading-v` for Git tags such as `v1.2.3`, and `--dry-run` to inspect an update without writing a file.

## Library

```ts
import { updateUnrealProjectVersion } from "@bigfootds/unreal-semver-updater";

const result = await updateUnrealProjectVersion({
  projectPath: "Config/DefaultGame.ini",
  version: "1.2.3",
});

console.log(result.previousVersion, result.version);
```

The updater preserves unrelated settings and line endings, adds the version key or section when necessary, and preserves existing quoted values. Pass `section` and `key` to target a different INI setting, or `dryRun: true` to calculate the change without writing.

## GitHub Actions

After Node is available, the command fits directly into a workflow:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: 24

- run: npx @bigfootds/unreal-semver-updater --version "${{ github.ref_name }}" --strip-leading-v
```

## Development

```sh
npm ci
npm test
npm run pack:check
```

## Releases

After the initial npm publication, CD releases every conventional commit that reaches `main`; do not manually edit `package.json`'s version or create release tags. The highest-impact commit since the previous release determines the version:

- `feat:` creates a minor release.
- `type!:` or a `BREAKING CHANGE:` footer creates a major release.
- Any other conventional commit type creates a patch release.

The workflow rejects a non-conventional commit that reaches `main`, commits the generated version, creates its `vX.Y.Z` tag and GitHub release, then publishes with npm Trusted Publishing. All feature work should use conventional commits and be merged into `main` through a pull request. If squash-merging, ensure the resulting squash commit (usually the pull request title) is conventional too.
