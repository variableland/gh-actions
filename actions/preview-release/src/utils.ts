import { readFile } from "node:fs/promises";
import path from "node:path";
import { x } from "tinyexec";

export type Package = {
  name: string;
  version: string;
  path: string;
  private: boolean;
};

export function formatError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error("Unknown error");
}

export async function getPackage(cwd: string): Promise<Package> {
  const manifestPath = path.join(cwd, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    name?: string;
    version?: string;
    private?: boolean;
  };
  if (!manifest.name) {
    throw new Error(`Missing "name" field in ${manifestPath}`);
  }
  if (!manifest.version) {
    throw new Error(`Missing "version" field in ${manifestPath}`);
  }
  return {
    name: manifest.name,
    version: manifest.version,
    path: cwd,
    private: manifest.private ?? false,
  };
}

// pnpm view <name> --json — exit 0 means the package exists on the registry;
// non-zero (typically because the package name is unknown) means unpublished.
export async function isUnpublished(name: string): Promise<boolean> {
  const result = await x("pnpm", ["view", name, "--json"]);
  return result.exitCode !== 0;
}

export function isPublishable(pkg: Package): boolean {
  return !pkg.private && !!pkg.name && !!pkg.version;
}
