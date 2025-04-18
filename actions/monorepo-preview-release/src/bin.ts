#!/usr/bin/env bun
import { relative } from "node:path";
import { $ } from "bun";

type Package = {
  name: string;
  version: string;
  path: string;
  // biome-ignore lint:
  [key: string]: any;
};

type PackageDep = {
  from: string;
  version: string;
  resolved?: string;
  path: string;
};

async function getWorkspacesPackages(): Promise<Array<Package>> {
  return $`pnpm list -r --json`.json();
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

async function getChangedPackages(allPackages: Array<Package>): Promise<Array<Package>> {
  const changedPaths = (await $`git fetch origin main && git diff --name-only origin/main`.text()).trim().split("\n");

  const changedPackages = new Set<Package>();

  for (const pkg of allPackages) {
    const relativePath = getRelativeFolderPath(pkg.path);
    const hasChanged = changedPaths.some((file) => relativePath && file.startsWith(relativePath));

    if (hasChanged) {
      changedPackages.add(pkg);
    }
  }

  return Array.from(changedPackages);
}

async function getPackagesToPublish(changedPackages: Array<Package>, allPackages: Array<Package>): Promise<Array<string>> {
  const packagesToPublish = new Map<string, Package>();

  for (const pkg of changedPackages) {
    packagesToPublish.set(pkg.name, pkg);

    const dependencies = await getDependenciesPackages(pkg, allPackages);

    for (const dependency of dependencies) {
      if (await isUnpublished(dependency)) {
        packagesToPublish.set(dependency.name, dependency);
      }
    }
  }

  // @ts-expect-error
  return Array.from(changedPackages.values())
    .map((pkg) => getRelativeFolderPath(pkg.path))
    .filter(Boolean);
}

/**
 * @example
 * ```ts
 * const relativePath = getRelativeFolderPath('/path/to/the/repository/packages/package-1')
 * console.log(relativePath) // 'packages/package-1'
 * ```
 */
function getRelativeFolderPath(absPath: string) {
  const relativePath = relative(process.cwd(), absPath);
  return relativePath.length > 0 ? relativePath : null;
}

/**
 * Bump the package version
 *
 * @param pkg - The package directory to bump.
 * @param preid - The prerelease identifier.
 */
async function bumpPackage(pkg: string, preid: string) {
  await $`cd ${pkg} && pnpm version prerelease --preid="${preid}" --no-git-tag-version`;
}

/**
 * Publish the package
 *
 * @param pkg - The package directory to publish.
 * @param tag - The tag to publish the package with.
 */
async function publishPackage(pkg: string, tag: string) {
  await $`cd ${pkg} && pnpm publish --tag="${tag}" --no-git-checks`;
}

async function main() {
  const githubWorkspace = Bun.env.GITHUB_WORKSPACE;
  const authToken = Bun.env.AUTH_TOKEN;
  const prNumber = Bun.env.PR_NUMBER;

  if (githubWorkspace) {
    $.cwd(githubWorkspace);
  }

  if (!prNumber) {
    throw new Error("PR_NUMBER environment variable is required");
  }

  if (!(await Bun.file(".npmrc").exists())) {
    if (!authToken) {
      throw new Error("AUTH_TOKEN environment variable is required");
    }

    // Don't interpolate AUTH_TOKEN for security reasons
    await Bun.write(".npmrc", "//registry.npmjs.org/:_authToken=${AUTH_TOKEN}");
  }

  const allPackages = await getWorkspacesPackages();
  const changedPackages = await getChangedPackages(allPackages);
  const packagesToPublish = await getPackagesToPublish(changedPackages, allPackages);

  if (!packagesToPublish.length) {
    console.log("No packages have changed");
    return;
  }

  try {
    const shortGitSha = (await $`git rev-parse --short HEAD`.text()).trim();
    const preid = `git-${shortGitSha}`;

    for (const pkg of packagesToPublish) {
      await bumpPackage(pkg, preid);
    }
  } catch (error) {
    throw new Error("Failed to bump packages");
  }

  try {
    const tag = `pr-${prNumber}`;

    for (const pkg of packagesToPublish) {
      await publishPackage(pkg, tag);
    }
  } catch (error) {
    throw new Error("Failed to publish packages");
  }
}

main();
