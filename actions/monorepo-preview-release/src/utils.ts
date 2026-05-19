import path from "node:path";
import * as core from "@actions/core";
import { x } from "tinyexec";
import type { Octokit } from "./types.ts";

export type WorkspaceDep = {
  from: string;
  version: string;
  resolved?: string;
  path?: string;
};

export type WorkspacePackage = {
  name: string;
  version: string;
  path: string;
  private: boolean;
  dependencies?: Record<string, WorkspaceDep>;
  devDependencies?: Record<string, WorkspaceDep>;
  optionalDependencies?: Record<string, WorkspaceDep>;
  peerDependencies?: Record<string, WorkspaceDep>;
};

export function formatError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error("Unknown error");
}

// pnpm list -r --json --depth 0
export async function getWorkspacesPackages(cwd: string = process.cwd()): Promise<WorkspacePackage[]> {
  const result = await x("pnpm", ["list", "-r", "--json", "--depth", "0"], { nodeOptions: { cwd } });
  if (result.exitCode !== 0) {
    throw new Error(`pnpm list failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout) as WorkspacePackage[];
}

// pnpm view <name> --json — exit 0 means the package exists on the registry;
// non-zero (typically because the package name is unknown) means unpublished.
export async function isUnpublished(name: string): Promise<boolean> {
  const result = await x("pnpm", ["view", name, "--json"]);
  return result.exitCode !== 0;
}

export function isPublishable(pkg: WorkspacePackage): boolean {
  return !pkg.private && !!pkg.name && !!pkg.version;
}

// Paginated PR change list via Octokit.
export async function getPrChangedFiles(
  octokit: Octokit,
  ctx: { owner: string; repo: string; prNumber: number },
): Promise<string[]> {
  const files: string[] = [];
  let page = 1;
  const MAX_PAGES = 30;
  while (page <= MAX_PAGES) {
    const response = await octokit.rest.pulls.listFiles({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.prNumber,
      per_page: 100,
      page,
    });
    for (const file of response.data) files.push(file.filename);
    if (response.data.length < 100) break;
    page++;
  }
  return files;
}

// Match changed files to workspace packages by walking up the path until we
// hit a package root. Replicates the algorithm pnpm uses internally.
export function getChangedPackages(
  packages: WorkspacePackage[],
  workspaceDir: string,
  changedFiles: string[],
): WorkspacePackage[] {
  const packagesByPath = new Map<string, WorkspacePackage>();
  for (const pkg of packages) {
    if (isPublishable(pkg)) packagesByPath.set(pkg.path, pkg);
  }
  const matched = new Set<string>();
  for (const file of changedFiles) {
    let current = path.resolve(workspaceDir, file);
    while (!packagesByPath.has(current)) {
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
    if (packagesByPath.has(current)) matched.add(current);
  }
  const changed = Array.from(matched).map((p) => {
    const pkg = packagesByPath.get(p);
    if (!pkg) throw new Error(`Missing workspace package for path ${p}`);
    return pkg;
  });
  core.debug(`Changed packages:\n${changed.map((p) => p.name).join("\n")}`);
  return changed;
}

// Walk workspace-internal deps of changed packages; any unpublished workspace
// dep gets added to the publish list so dependents resolve correctly on npm.
export async function getPackagesToPublish(
  changed: WorkspacePackage[],
  allPackages: WorkspacePackage[],
): Promise<WorkspacePackage[]> {
  const byName = new Map<string, WorkspacePackage>();
  for (const pkg of allPackages) byName.set(pkg.name, pkg);

  const toPublish = new Map<string, WorkspacePackage>();
  const visited = new Set<string>();

  async function walk(pkg: WorkspacePackage) {
    if (visited.has(pkg.name)) return;
    visited.add(pkg.name);
    const allDeps: Record<string, WorkspaceDep> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    for (const depName of Object.keys(allDeps)) {
      const depPkg = byName.get(depName);
      if (!depPkg || !isPublishable(depPkg)) continue;
      if (!toPublish.has(depPkg.name) && (await isUnpublished(depPkg.name))) {
        toPublish.set(depPkg.name, depPkg);
      }
      await walk(depPkg);
    }
  }

  for (const pkg of changed) {
    toPublish.set(pkg.name, pkg);
    await walk(pkg);
  }

  const result = Array.from(toPublish.values());
  core.debug(`Packages to publish:\n${result.map((p) => p.name).join("\n")}`);
  return result;
}
