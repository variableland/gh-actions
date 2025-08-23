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

  function getLastActiveOrSleepingDeployment() {
    const document = `
      query getLastDeployment($serviceId: String!) {
        deployments(first: 1, input: {
          serviceId: $serviceId
          status: { in: [SUCCESS, SLEEPING] }
        }) {
          edges {
            node {
              id
              projectId
              environmentId
              canRedeploy
            }
          }
        }
      }
    `;

    return gqlClient.query<Deployments>(document, { serviceId }).toPromise();
  }

  function deploymentRedeploy(deploymentId: string) {
    const document = `
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
    const result = await getLastActiveOrSleepingDeployment();

    if (!result.data?.deployments?.edges?.length) {
      throw new Error("No active or sleeping deployments found");
    }

    const deployment = result.data.deployments.edges[0]!.node;

    if (deployment.canRedeploy === false) {
      throw new Error(`Deployment (ID: ${deployment.id}) cannot be redeployed`);
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
