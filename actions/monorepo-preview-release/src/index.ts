import * as core from "@actions/core";
import * as github from "@actions/github";
import { markdownTable } from "markdown-table";
import { type PublishResults, getLatestCommitSha, getPublishTag, publishPackages } from "./core.js";

const COMMENT_TAG = "<!-- preview-release-action -->";

async function getPreviewReleaseMessage(prNumber: string, results: PublishResults) {
  const firstResult = results[0];
  const latestCommitSha = await getLatestCommitSha();

  // biome-ignore format:
  return [
    COMMENT_TAG,
    "### Preview release",
    "",
    `Latest commit: ${latestCommitSha}`,
    "",
    "Some packages have been released:",
    markdownTable([
      ["Package", "Version", "Install"],
      ...results.map(({ packageName, nextVersion }) => [packageName, nextVersion, `\`${packageName}@${nextVersion}\``])
    ]),
    "",
    "> [!NOTE]",
    "> Use the PR number as tag to install any package. For instance:",
    "> ```",
    `> pnpm add ${firstResult?.packageName}@${getPublishTag(prNumber)}`,
    "> ```"
  ].join("\n");
}

function getNoPreviewReleaseMessage() {
  // biome-ignore format:
  return [
    COMMENT_TAG,
    "### Preview release",
    "",
    `Latest commit: ${github.context.sha}`,
    "",
    "No packages have been released.",
  ].join("\n");
}

async function getCommentBody(prNumber: string, results: PublishResults) {
  if (!results.length) {
    return getNoPreviewReleaseMessage();
  }

  return getPreviewReleaseMessage(prNumber, results);
}

export async function main() {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const prNumber = process.env.PR_NUMBER;
    const authToken = process.env.AUTH_TOKEN;

    if (!githubToken) {
      throw new Error("GITHUB_TOKEN is not set");
    }

    if (!prNumber) {
      throw new Error("PR_NUMBER is not set");
    }

    const octokit = github.getOctokit(githubToken);

    const results = await publishPackages({
      prNumber,
      authToken,
    });

    async function getCommentId() {
      const comment = await octokit.rest.issues.listComments({
        repo: github.context.repo.repo,
        owner: github.context.repo.owner,
        issue_number: Number(prNumber),
      });

      const existingComment = comment.data.find((c) => c.body?.includes(COMMENT_TAG));

      return existingComment?.id;
    }

    const commentId = await getCommentId();

    const payload = {
      repo: github.context.repo.repo,
      owner: github.context.repo.owner,
      issue_number: Number(prNumber),
      body: await getCommentBody(prNumber, results),
    };

    if (!commentId) {
      await octokit.rest.issues.createComment(payload);
    } else {
      await octokit.rest.issues.updateComment({
        ...payload,
        comment_id: commentId,
      });
    }
  } catch (error) {
    core.setFailed(error as unknown as Error);
  }
}

main();
