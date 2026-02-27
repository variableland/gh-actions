import * as core from "@actions/core";
import * as github from "@actions/github";
import { markdownTable } from "markdown-table";
import { getPublishTag, type PublishResults, publishPackages } from "./core.js";

const COMMENT_TAG = "<!-- preview-release-action -->";

type GetMessageOptions = {
  results: PublishResults;
  prNumber: number;
  latestCommitSha: string;
};

function getPreviewReleaseMessage(options: GetMessageOptions) {
  const { results, prNumber, latestCommitSha } = options;

  const firstResult = results[0];

  return [
    COMMENT_TAG,
    "### Preview release",
    "",
    `Latest commit: ${latestCommitSha}`,
    "",
    "Some packages have been released:",
    markdownTable([
      ["Package", "Version", "Install"],
      ...results.map(({ packageName, nextVersion }) => [packageName, nextVersion, `\`${packageName}@${nextVersion}\``]),
    ]),
    "",
    "> [!NOTE]",
    "> Use the PR number as tag to install any package. For instance:",
    "> ```",
    `> pnpm add ${firstResult?.packageName}@${getPublishTag(prNumber)}`,
    "> ```",
  ].join("\n");
}

function getNoPreviewReleaseMessage(options: GetMessageOptions) {
  const { latestCommitSha } = options;

  return [
    COMMENT_TAG,
    "### Preview release",
    "",
    `Latest commit: ${latestCommitSha}`,
    "",
    "No packages have been released.",
  ].join("\n");
}

function getCommentBody(options: GetMessageOptions) {
  if (!options.results.length) {
    return getNoPreviewReleaseMessage(options);
  }

  return getPreviewReleaseMessage(options);
}

export async function main() {
  try {
    const githubToken = core.getInput("github_token", { required: true });

    const prNumber = github.context.payload.pull_request?.number;
    const latestCommitSha = github.context.payload.pull_request?.head?.sha;

    if (!prNumber) {
      throw new Error("PR number can not be determined");
    }

    if (!latestCommitSha) {
      throw new Error("Latest commit SHA can not be determined");
    }

    core.debug(`PR number: ${prNumber}`);
    core.debug(`Latest commit SHA: ${latestCommitSha}`);

    const octokit = github.getOctokit(githubToken);

    const results = await publishPackages({
      octokit,
      prNumber,
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
