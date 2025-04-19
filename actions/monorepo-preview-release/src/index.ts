import * as core from "@actions/core";
import * as github from "@actions/github";
import { markdownTable } from "markdown-table";
import { type PublishResults, publishPackages } from "./core.js";

const COMMENT_TAG = "<!-- preview-release-action -->";

function getPreviewReleaseMessage(results: PublishResults) {
  // biome-ignore format:
  return [
    COMMENT_TAG,
    "### Preview release",
    "",
    "Some packages have been released:",
    markdownTable([
      ["Package", "Version"],
      ...results.map((item) => [item.packageName, item.nextVersion])
    ]),
  ].join("\n");
}

function getNoPreviewReleaseMessage() {
  // biome-ignore format:
  return [
    COMMENT_TAG,
    "### Preview release",
    "",
    "No packages have been released.",
  ].join("\n");
}

function getCommentBody(results: PublishResults) {
  if (results.length > 0) {
    return getPreviewReleaseMessage(results);
  }

  return getNoPreviewReleaseMessage();
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
      body: getCommentBody(results),
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
