import fs from "node:fs/promises";
import * as core from "@actions/core";
import { $ } from "bun";
import type { Octokit } from "./types.js";
import {
  formatError,
  getChangedPackages,
  getPackagesToPublish,
  getWorkspacesPackages,
  isUnpublished,
  type Package,
} from "./utils.js";

export type PublishResults = Array<{
  packageName: string;
  nextVersion: string;
}>;

type Options = {
  octokit: Octokit;
  prNumber: number;
  latestCommitSha: string;
  npmToken?: string;
};

enum PublishMode {
  OIDC_WITH_TOKEN_FALLBACK = "oidc-with-token-fallback",
  OIDC_ONLY = "oidc-only",
  TOKEN_ONLY = "token-only",
}

async function bumpPackage(pkg: Package, preid: string) {
  return (await $`cd ${pkg.path} && pnpm version prerelease --preid="${preid}" --no-git-tag-version`.text()).trim();
}

async function publishPackage(pkg: Package, tag: string, mode: PublishMode) {
  async function publish(pkg: Package, options: { tag: string; provenance?: boolean }) {
    await $`cd ${pkg.path} && pnpm publish --tag="${options.tag}" --no-git-checks ${options.provenance ? "--provenance" : ""}`;
  }

  if (mode === PublishMode.TOKEN_ONLY) {
    await publish(pkg, { tag });
    return;
  }

  try {
    await publish(pkg, { tag, provenance: true });
  } catch (cause) {
    if (mode === PublishMode.OIDC_ONLY) throw cause;

    // Only fall back when this is genuinely a first-time publish (the chicken-and-egg
    // case with OIDC trusted publishing). Other OIDC failures bubble up.
    if (!(await isUnpublished(pkg))) throw cause;

    core.warning(
      `First-time publish detected for ${pkg.name}; using NPM_TOKEN auth without provenance ` +
        `because no Trusted Publisher is configured yet.`,
    );
    await publish(pkg, { tag });
  }
}

export function getPublishTag(prNumber: number) {
  return `pr-${prNumber}`;
}

export async function publishPackages(options: Options): Promise<PublishResults> {
  const { prNumber, latestCommitSha, octokit, npmToken } = options;

  const hasNpmRc = await fs.exists(".npmrc");
  const hasNpmToken = !!npmToken;

  const mode: PublishMode = hasNpmRc
    ? PublishMode.TOKEN_ONLY
    : hasNpmToken
      ? PublishMode.OIDC_WITH_TOKEN_FALLBACK
      : PublishMode.OIDC_ONLY;
  core.debug(`mode: ${mode}, hasNpmToken: ${hasNpmToken}, hasNpmRc: ${hasNpmRc}`);

  if (hasNpmToken && !hasNpmRc) {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Don't interpolate NPM_TOKEN for security reasons
    await fs.writeFile(".npmrc", "//registry.npmjs.org/:_authToken=${NPM_TOKEN}");
    core.debug(`Wrote .npmrc file with NPM_TOKEN template`);
  }

  const allPackages = await getWorkspacesPackages();
  const changedPackages = await getChangedPackages(octokit, allPackages, prNumber);
  const packagesToPublish = await getPackagesToPublish(changedPackages, allPackages);

  if (!packagesToPublish.length) {
    core.info("No packages have changed");
    return [];
  }

  const nextVersions = new Map<string, string>();

  try {
    const shortGitSha = latestCommitSha.substring(0, 7);
    const preid = `git-${shortGitSha}`;

    for (const pkg of packagesToPublish) {
      const nextVersion = await bumpPackage(pkg, preid);
      nextVersions.set(pkg.name, nextVersion);
    }
  } catch (cause) {
    const error = formatError(cause);
    throw new Error(`Failed to bump packages: ${error.message}`);
  }

  try {
    const tag = getPublishTag(prNumber);

    for (const pkg of packagesToPublish) {
      await publishPackage(pkg, tag, mode);
    }
  } catch (cause) {
    const error = formatError(cause);
    throw new Error(`Failed to publish packages: ${error.message}`);
  }

  return Array.from(nextVersions.entries()).map(([packageName, nextVersion]) => ({ packageName, nextVersion }));
}
