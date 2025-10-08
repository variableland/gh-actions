/** biome-ignore-all lint/style/noNonNullAssertion: ensure by action itself */
import * as core from "@actions/core";
import { Client, fetchExchange } from "@urql/core";

type Deployments = {
  deployments: {
    edges: Array<{
      node: Deployment;
    }>;
  };
};

type Deployment = {
  id: string;
  projectId: string;
  environmentId: string;
  canRedeploy?: boolean;
  status: "SUCCESS" | "SLEEPING" | "FAILED" | string;
};

async function main() {
  const serviceId = process.env.SERVICE_ID;
  const railwayToken = process.env.RAILWAY_TOKEN;
  const railwayApi = process.env.RAILWAY_API!;

  if (!serviceId) {
    core.setFailed("🚨 Railway service ID is not set");
    return;
  }

  if (!railwayToken) {
    core.setFailed("🚨 Railway API token is not set");
    return;
  }

  const gqlClient = new Client({
    url: railwayApi,
    exchanges: [fetchExchange],
    preferGetMethod: false,
    fetchOptions: {
      headers: { authorization: `Bearer ${railwayToken}` },
    },
  });

  async function getLastActiveOrSleepingOrFailedDeployment() {
    const document = `#graphql
      query getLastDeployment($serviceId: String!) {
        deployments(first: 100, input: {
          serviceId: $serviceId
          status: { in: [SUCCESS, SLEEPING, FAILED] }
        }) {
          edges {
            node {
              id
              projectId
              environmentId
              canRedeploy
              status
            }
          }
        }
      }
    `;

    const result = await gqlClient.query<Deployments>(document, { serviceId }).toPromise();

    if (!result.data?.deployments?.edges?.length) {
      throw new Error("No active, sleeping, or failed deployments found");
    }

    // Find the most recent deployment with status SUCCESS, SLEEPING, or FAILED
    const edge = result?.data?.deployments?.edges?.find(
      ({ node: d }) => (d.status === "SUCCESS" || d.status === "SLEEPING" || d.status === "FAILED") && !!d.canRedeploy,
    );

    return edge?.node ?? null;
  }

  function deploymentRedeploy(deploymentId: string) {
    const document = `#graphql
      mutation redeploy($deploymentId: String!) {
        deploymentRedeploy(id: $deploymentId) {
          id
        }
      }
    `;

    return gqlClient.mutation(document, { deploymentId }).toPromise();
  }

  function getServicePanelUrl(deployment: Deployment) {
    return `https://railway.com/project/${deployment.projectId}/service/${serviceId}?environmentId=${deployment.environmentId}`;
  }

  try {
    const deployment = await getLastActiveOrSleepingOrFailedDeployment();

    if (!deployment) {
      throw new Error("No active, sleeping, or failed deployments found");
    }

    await deploymentRedeploy(deployment.id);

    const serviceUrl = getServicePanelUrl(deployment);

    core.info(`🚀 Deployment (ID: ${deployment.id}) redeploy launched: ${serviceUrl}`);

    core.setOutput("service_url", serviceUrl);
  } catch (error) {
    const msg = "Failed to redeploy railway service";

    if (error instanceof Error) {
      core.setFailed(`🚨 ${msg}: ${error.message}`);
    } else {
      core.setFailed(`🚨 ${msg}`);
    }
  }
}

main();
