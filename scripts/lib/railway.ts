import fetch from "node-fetch";

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

function railwayToken(): string {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error("RAILWAY_API_TOKEN env var is not set");
  return token;
}

async function gql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${railwayToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Railway API HTTP ${res.status}`);

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Railway API error: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  return json.data as T;
}

export interface RailwayDeployResult {
  projectId: string;
  serviceId: string;
  deploymentUrl: string;
}

// Returns the Railway team ID for the authenticated user (first team found).
async function getTeamId(): Promise<string> {
  const data = await gql<{ me: { teams: { edges: { node: { id: string } }[] } } }>(`
    query {
      me {
        teams {
          edges {
            node { id }
          }
        }
      }
    }
  `);
  const teams = data.me.teams.edges;
  if (!teams.length) throw new Error("No Railway teams found for this token");
  return teams[0].node.id;
}

async function findProjectByName(name: string): Promise<string | null> {
  const data = await gql<{ projects: { edges: { node: { id: string; name: string } }[] } }>(`
    query {
      projects {
        edges {
          node { id name }
        }
      }
    }
  `);
  const match = data.projects.edges.find((e) => e.node.name === name);
  return match ? match.node.id : null;
}

async function createProject(name: string, teamId: string): Promise<string> {
  const data = await gql<{ projectCreate: { id: string } }>(
    `
    mutation CreateProject($name: String!, $teamId: String!) {
      projectCreate(input: { name: $name, teamId: $teamId }) {
        id
      }
    }
  `,
    { name, teamId }
  );
  return data.projectCreate.id;
}

async function getOrCreateService(
  projectId: string,
  serviceName: string
): Promise<string> {
  // Check if service already exists
  const data = await gql<{
    project: { services: { edges: { node: { id: string; name: string } }[] } };
  }>(
    `
    query GetServices($projectId: String!) {
      project(id: $projectId) {
        services {
          edges { node { id name } }
        }
      }
    }
  `,
    { projectId }
  );

  const existing = data.project.services.edges.find(
    (e) => e.node.name === serviceName
  );
  if (existing) return existing.node.id;

  const created = await gql<{ serviceCreate: { id: string } }>(
    `
    mutation CreateService($projectId: String!, $name: String!) {
      serviceCreate(input: { projectId: $projectId, name: $name }) {
        id
      }
    }
  `,
    { projectId, name: serviceName }
  );
  return created.serviceCreate.id;
}

async function setServiceVariables(
  projectId: string,
  serviceId: string,
  environmentId: string,
  vars: Record<string, string>
): Promise<void> {
  const variables: { name: string; value: string }[] = Object.entries(vars).map(
    ([name, value]) => ({ name, value })
  );

  await gql(
    `
    mutation UpsertVars($projectId: String!, $serviceId: String!, $environmentId: String!, $variables: [VariableUpsertInput!]!) {
      variableCollectionUpsert(input: {
        projectId: $projectId
        serviceId: $serviceId
        environmentId: $environmentId
        variables: $variables
      })
    }
  `,
    { projectId, serviceId, environmentId, variables }
  );
}

async function getProductionEnvironmentId(projectId: string): Promise<string> {
  const data = await gql<{
    project: { environments: { edges: { node: { id: string; name: string } }[] } };
  }>(
    `
    query GetEnvs($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges { node { id name } }
        }
      }
    }
  `,
    { projectId }
  );

  const prod = data.project.environments.edges.find(
    (e) => e.node.name.toLowerCase() === "production"
  );
  if (!prod) throw new Error("No production environment found in Railway project");
  return prod.node.id;
}

async function deployFromRepo(
  projectId: string,
  serviceId: string,
  environmentId: string,
  repo: string
): Promise<string> {
  // Connect the service to a GitHub repo and trigger a deploy
  const data = await gql<{ serviceConnect: { id: string } }>(
    `
    mutation ConnectRepo($serviceId: String!, $projectId: String!, $environmentId: String!, $repo: String!) {
      serviceConnect(
        id: $serviceId
        input: {
          projectId: $projectId
          source: { repo: $repo }
        }
      ) {
        id
      }
    }
  `,
    { serviceId, projectId, environmentId, repo }
  );
  return data.serviceConnect.id;
}

async function getServiceDomain(
  projectId: string,
  serviceId: string,
  environmentId: string
): Promise<string> {
  // Get or create a Railway domain for the service
  const data = await gql<{
    domains: {
      serviceDomains: { domain: string }[];
    };
  }>(
    `
    query GetDomains($projectId: String!, $serviceId: String!, $environmentId: String!) {
      domains(
        projectId: $projectId
        serviceId: $serviceId
        environmentId: $environmentId
      ) {
        serviceDomains {
          domain
        }
      }
    }
  `,
    { projectId, serviceId, environmentId }
  );

  const domains = data.domains.serviceDomains;
  if (domains.length > 0) return `https://${domains[0].domain}`;

  // Create a domain
  const created = await gql<{ serviceDomainCreate: { domain: string } }>(
    `
    mutation CreateDomain($projectId: String!, $serviceId: String!, $environmentId: String!) {
      serviceDomainCreate(input: {
        projectId: $projectId
        serviceId: $serviceId
        environmentId: $environmentId
      }) {
        domain
      }
    }
  `,
    { projectId, serviceId, environmentId }
  );

  return `https://${created.serviceDomainCreate.domain}`;
}

async function waitForDeployment(
  projectId: string,
  serviceId: string,
  environmentId: string,
  timeoutMs = 180_000
): Promise<void> {
  const start = Date.now();
  process.stdout.write("  Waiting for Railway deployment");

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000));
    process.stdout.write(".");

    const data = await gql<{
      deployments: {
        edges: {
          node: { status: string };
        }[];
      };
    }>(
      `
      query GetDeployments($projectId: String!, $serviceId: String!, $environmentId: String!) {
        deployments(
          first: 1
          input: {
            projectId: $projectId
            serviceId: $serviceId
            environmentId: $environmentId
          }
        ) {
          edges { node { status } }
        }
      }
    `,
      { projectId, serviceId, environmentId }
    );

    const latest = data.deployments.edges[0]?.node;
    if (!latest) continue;

    if (latest.status === "SUCCESS") {
      process.stdout.write(" done\n");
      return;
    }
    if (latest.status === "FAILED" || latest.status === "CRASHED") {
      process.stdout.write("\n");
      throw new Error(`Railway deployment ${latest.status}`);
    }
  }

  process.stdout.write("\n");
  throw new Error("Railway deployment timed out after 3 minutes");
}

export async function deployMcpServer(params: {
  institutionId: string;
  institutionName: string;
  existingProjectId?: string;
  existingMcpServerUrl?: string;
  secrets: {
    ANTHROPIC_API_KEY: string;
    COACH_MCP_SHARED_SECRET: string;
  };
}): Promise<RailwayDeployResult> {
  const projectName = `wealthi-coach-${params.institutionId}`;
  const serviceName = "wealthi-coach-mcp-server";

  console.log(`\n[Railway] Project: ${projectName}`);

  // Step 1: Resolve or create project
  let projectId = params.existingProjectId || "";

  if (!projectId) {
    console.log(`  Checking for existing Railway project...`);
    const found = await findProjectByName(projectName);

    if (found) {
      console.log(`  Found existing project: ${found}`);
      projectId = found;
    } else {
      console.log(`  Creating new Railway project...`);
      const teamId = await getTeamId();
      projectId = await createProject(projectName, teamId);
      console.log(`  Created project: ${projectId}`);
    }
  } else {
    console.log(`  Using existing project: ${projectId}`);
  }

  // Step 2: Get production environment
  const environmentId = await getProductionEnvironmentId(projectId);

  // Step 3: Get or create service
  console.log(`  Resolving service: ${serviceName}`);
  const serviceId = await getOrCreateService(projectId, serviceName);

  // Step 4: Set environment variables
  console.log(`  Setting environment variables...`);
  await setServiceVariables(projectId, serviceId, environmentId, {
    INSTITUTION_NAME: params.institutionName,
    ANTHROPIC_API_KEY: params.secrets.ANTHROPIC_API_KEY,
    COACH_MCP_SHARED_SECRET: params.secrets.COACH_MCP_SHARED_SECRET,
    TRANSPORT: "http",
  });

  // Step 5: Wait for deployment to be live
  await waitForDeployment(projectId, serviceId, environmentId);

  // Step 6: Get the deployment URL
  console.log(`  Fetching service domain...`);
  const deploymentUrl = await getServiceDomain(projectId, serviceId, environmentId);

  return { projectId, serviceId, deploymentUrl };
}
