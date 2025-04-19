import * as core from "@actions/core";
import * as github from "@actions/github";
import { markdownTable } from "markdown-table";
import { type PublishResults, getPublishTag, publishPackages } from "./core.js";

const COMMENT_TAG = "<!-- preview-release-action -->";

type GetMessageOptions = {
  results: PublishResults;
  prNumber: string;
  latestCommitSha: string;
};

function getPreviewReleaseMessage(options: GetMessageOptions) {
  const { results, prNumber, latestCommitSha } = options;

  const firstResult = results[0];

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

function getCommentBody(options: GetMessageOptions) {
  if (!options.results.length) {
    return getNoPreviewReleaseMessage();
  }

  return getPreviewReleaseMessage(options);
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

    const pullRequest = await octokit.rest.pulls.get({
      repo: github.context.repo.repo,
      owner: github.context.repo.owner,
      pull_number: Number(prNumber),
    });

    const latestCommitSha = pullRequest.data.head.sha;

    const results = await publishPackages({
      prNumber,
      authToken,
      latestCommitSha,
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
      body: getCommentBody({
        results,
        prNumber,
        latestCommitSha,
      }),
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
