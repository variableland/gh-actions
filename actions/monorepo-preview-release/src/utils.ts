import { relative } from "node:path";
import { $ } from "bun";

export type Package = {
  name: string;
  version: string;
  path: string;
  // biome-ignore lint:
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

export async function getChangedPackages(allPackages: Array<Package>) {
  function getRelativeFolderPath(absPath: string) {
    const relativePath = relative(process.cwd(), absPath);
    return relativePath.length > 0 ? relativePath : null;
  }

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

export async function getPackagesToPublish(changedPackages: Array<Package>, allPackages: Array<Package>) {
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

  return Array.from(packagesToPublish.values());
}
