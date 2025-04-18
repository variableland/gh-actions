import * as core from "@actions/core";
import * as github from "@actions/github";
import { markdownTable } from "markdown-table";
import { type PublishResults, publishPackages } from "./core.js";

function getPreviewReleaseMessage(result: PublishResults) {
  // biome-ignore format:
  return [
    "### Preview release",
    markdownTable([
      ["Package", "Version"],
      ...result.map((item) => [item.packageName, item.nextVersion])
    ]),
  ].join("\n");
}

export async function main() {
  try {
    const githubToken = core.getInput("github_token", { required: true });
    const prNumber = core.getInput("pr_number", { required: true });
    const authToken = core.getInput("auth_token");

    const octokit = github.getOctokit(githubToken);

    const results = await publishPackages({
      prNumber,
      authToken,
    });

    core.setOutput("results", results);
    core.setOutput("published", results.length > 0);

    await octokit.rest.issues.createComment({
      repo: github.context.repo.repo,
      owner: github.context.repo.owner,
      issue_number: Number(prNumber),
      body: getPreviewReleaseMessage(results),
    });
  } catch (error) {
    core.setFailed(error as unknown as Error);
  }
}

main();
