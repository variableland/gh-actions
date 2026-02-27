import fs from "node:fs/promises";
import * as core from "@actions/core";
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
  npmToken?: string;
};

async function getNpmToken(packageName: string): Promise<string> {
  const idToken = await core.getIDToken("npm:registry.npmjs.org");

  const escaped = encodeURIComponent(packageName);
  const url = `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${escaped}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC token exchange failed for ${packageName} (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

async function bumpPackage(pkg: Package, preid: string) {
  return (await $`cd ${pkg.path} && pnpm version prerelease --preid="${preid}" --no-git-tag-version`.text()).trim();
}

async function publishPackage(pkg: Package, tag: string) {
  if (!(await fs.exists(".npmrc"))) {
    const token = await getNpmToken(pkg.name);
    await fs.writeFile(".npmrc", `//registry.npmjs.org/:_authToken=${token}`);
  }

  await $`cd ${pkg.path} && pnpm publish --tag="${tag}" --no-git-checks`;
}

export function getPublishTag(prNumber: number) {
  return `pr-${prNumber}`;
}

export async function publishPackages(options: Options): Promise<PublishResults> {
  const { prNumber, latestCommitSha, octokit, npmToken } = options;

  if (!(await fs.exists(".npmrc")) && !!npmToken) {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Don't interpolate NPM_TOKEN for security reasons
    await fs.writeFile(".npmrc", "//registry.npmjs.org/:_authToken=${NPM_TOKEN}");
  }

  const allPackages = await getWorkspacesPackages();
  const changedPackages = await getChangedPackages(octokit, allPackages);
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
      await publishPackage(pkg, tag);
    }
  } catch (cause) {
    const error = formatError(cause);
    throw new Error(`Failed to publish packages: ${error.message}`);
  }

  return Array.from(nextVersions.entries()).map(([packageName, nextVersion]) => ({ packageName, nextVersion }));
}
