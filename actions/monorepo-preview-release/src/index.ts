import * as core from "@actions/core";
import * as github from "@actions/github";
import { HttpClient } from "@actions/http-client";
import { BearerCredentialHandler } from "@actions/http-client/lib/auth";
import { publishPackages } from "./core.js";

try {
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  const npmToken = process.env.NPM_TOKEN?.trim();
  const vlandBotUrl = process.env.VLAND_BOT_URL?.trim();

  const prNumber = github.context.payload.pull_request?.number;
  const latestCommitSha = github.context.payload.pull_request?.head?.sha;

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is not set");
  }

  if (!vlandBotUrl) {
    throw new Error("VLAND_BOT_URL is not set");
  }

  if (!prNumber) {
    throw new Error("PR number can not be determined");
  }

  if (!latestCommitSha) {
    throw new Error("Latest commit SHA can not be determined");
  }

  core.debug(`PR number: ${prNumber}`);
  core.debug(`Latest commit SHA: ${latestCommitSha}`);

  const octokit = github.getOctokit(githubToken);

  const packages = await publishPackages({
    octokit,
    prNumber,
    latestCommitSha,
    npmToken,
  });

  const { owner, repo } = github.context.repo;

  const oidcToken = await core.getIDToken("vland-bot");

  const http = new HttpClient("monorepo-preview-release", [new BearerCredentialHandler(oidcToken)], {
    allowRetries: true,
    maxRetries: 3,
  });

  const response = await http.postJson(`${vlandBotUrl}/v1/github/preview-release`, {
    owner,
    repo,
    prNumber,
    latestCommitSha,
    packages,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`vland-bot responded with ${response.statusCode}: ${JSON.stringify(response.result)}`);
  }
} catch (error) {
  core.setFailed(error as unknown as Error);
}
