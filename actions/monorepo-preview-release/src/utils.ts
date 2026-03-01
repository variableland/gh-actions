import { relative } from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { $ } from "bun";
import type { Octokit } from "./types.js";

export type Package = {
  name: string;
  version: string;
  path: string;
  // biome-ignore lint/suspicious/noExplicitAny: Allow any type for additional properties
  [key: string]: any;
};

export type PackageDep = {
  from: string;
  version: string;
  resolved?: string;
  path: string;
};

export function formatError(cause: unknown) {
  return cause instanceof Error ? cause : new Error("Unknown error");
}

async function getDependenciesPackages(pkg: Package, packages: Array<Package>) {
  const isLinked = (version: string) => version.startsWith("link:");

  const dependenciesObj: Record<string, PackageDep> = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };

  const depPackages: Array<Package> = [];

  for (const [name, dep] of Object.entries(dependenciesObj)) {
    if (isLinked(dep.version)) {
      const depPackage = packages.find((pkg) => pkg.name === name);

      if (depPackage) {
        const nestedDepPackages = await getDependenciesPackages(depPackage, packages);
        depPackages.push(depPackage, ...nestedDepPackages);
      }
    }
  }

  return depPackages;
}

async function isUnpublished(pkg: Package) {
  try {
    const response = await $`pnpm view ${pkg.name} --json`.json();
    return !response.name;
  } catch {
    return true;
  }
}

export async function getWorkspacesPackages(): Promise<Array<Package>> {
  return $`pnpm list -r --json`.json();
}

export async function getChangedPackages(octokit: Octokit, allPackages: Array<Package>) {
  function getRelativeFolderPath(absPath: string) {
    const relativePath = relative(process.cwd(), absPath);
    return relativePath.length > 0 ? relativePath : null;
  }

  const lastCheckpoint = await getLastCheckpoint(octokit);
  const changedPaths = (await $`git fetch origin main && git diff --name-only ${lastCheckpoint}`.text()).trim().split("\n");

  core.debug(`Last checkpoint: ${lastCheckpoint}`);
  core.debug(`Changed paths:\n${changedPaths.join("\n")}`);

  const changedPackagesSet = new Set<Package>();

  for (const pkg of allPackages) {
    const relativePath = getRelativeFolderPath(pkg.path);
    const hasChanged = changedPaths.some((file) => relativePath && file.startsWith(relativePath));

    if (hasChanged) {
      changedPackagesSet.add(pkg);
    }
  }

  const changedPackages = Array.from(changedPackagesSet);

  core.debug(`Changed packages:\n${changedPackages.map((pkg) => pkg.name).join("\n")}`);

  return changedPackages;
}

export async function getPackagesToPublish(changedPackages: Array<Package>, allPackages: Array<Package>) {
  const packagesToPublishMap = new Map<string, Package>();

  for (const pkg of changedPackages) {
    packagesToPublishMap.set(pkg.name, pkg);

    const dependencies = await getDependenciesPackages(pkg, allPackages);

    for (const dependency of dependencies) {
      if (await isUnpublished(dependency)) {
        packagesToPublishMap.set(dependency.name, dependency);
      }
    }
  }

  const packagesToPublish = Array.from(packagesToPublishMap.values());

  core.debug(`Packages to publish:\n${packagesToPublish.map((pkg) => pkg.name).join("\n")}`);

  return packagesToPublish;
}

export async function getLastCheckpoint(octokit: Octokit) {
  const defaultCase = "origin/main";

  try {
    const { owner, repo } = github.context.repo;

    const searchResponse = await octokit.rest.search.commits({
      q: `repo:${owner}/${repo} "RELEASING:"`,
      sort: "committer-date",
      order: "desc",
      per_page: 1,
    });

    const lastReleaseCommit = searchResponse?.data?.items?.[0];

    core.debug(`Last release commit: ${lastReleaseCommit?.sha ?? "not found"}`);

    return lastReleaseCommit?.sha ?? defaultCase;
  } catch {
    return defaultCase;
  }
}
