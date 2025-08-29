import fs from "node:fs";
import { $ } from "bun";
import type { Octokit } from "./types.js";
import { formatError, getChangedPackages, getPackagesToPublish, getWorkspacesPackages, type Package } from "./utils.js";

export type PublishResults = Array<{
  packageName: string;
  nextVersion: string;
}>;

type Options = {
  octokit: Octokit;
  prNumber: number;
  latestCommitSha: string;
  authToken?: string;
};

async function bumpPackage(pkg: Package, preid: string) {
  return (await $`cd ${pkg.path} && pnpm version prerelease --preid="${preid}" --no-git-tag-version`.text()).trim();
}

async function publishPackage(pkg: Package, tag: string) {
  await $`cd ${pkg.path} && pnpm publish --tag="${tag}" --no-git-checks`;
}

export function getPublishTag(prNumber: number) {
  return `pr-${prNumber}`;
}

export async function publishPackages(options: Options): Promise<PublishResults> {
  const { prNumber, authToken, latestCommitSha, octokit } = options;

  if (!fs.existsSync(".npmrc")) {
    if (!authToken) {
      throw new Error("The auth_token is required");
    }

    // biome-ignore lint/suspicious/noTemplateCurlyInString: Don't interpolate AUTH_TOKEN for security reasons
    fs.writeFileSync(".npmrc", "//registry.npmjs.org/:_authToken=${AUTH_TOKEN}");
  }

  const allPackages = await getWorkspacesPackages();
  const changedPackages = await getChangedPackages(octokit, allPackages);
  const packagesToPublish = await getPackagesToPublish(changedPackages, allPackages);

  if (!packagesToPublish.length) {
    console.log("No packages have changed");
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
      await publishPackage(pkg, tag);
    }
  } catch (cause) {
    const error = formatError(cause);
    throw new Error(`Failed to publish packages: ${error.message}`);
  }

  return Array.from(nextVersions.entries()).map(([packageName, nextVersion]) => ({ packageName, nextVersion }));
}
