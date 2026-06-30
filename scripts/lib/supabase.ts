import { execSync } from "child_process";

function run(cmd: string, label: string): void {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch {
    throw new Error(`${label} failed`);
  }
}

export interface SupabaseDeployParams {
  projectRef: string;
  mcpServerUrl: string;
  institutionName: string;
  domainDescription: string;
  subjectMatter: string;
  secrets: {
    ANTHROPIC_API_KEY: string;
    COACH_MCP_SHARED_SECRET: string;
  };
}

export async function deployEdgeFunction(params: SupabaseDeployParams): Promise<string> {
  const { projectRef } = params;

  console.log(`\n[Supabase] Project ref: ${projectRef}`);

  // Deploy the edge function
  console.log(`  Deploying coach-respond edge function...`);
  run(
    `supabase functions deploy coach-respond --project-ref ${projectRef}`,
    "supabase functions deploy"
  );

  // Set secrets
  console.log(`  Setting secrets...`);
  const secretPairs = [
    `ANTHROPIC_API_KEY=${params.secrets.ANTHROPIC_API_KEY}`,
    `COACH_MCP_SERVER_URL=${params.mcpServerUrl}`,
    `COACH_MCP_SHARED_SECRET=${params.secrets.COACH_MCP_SHARED_SECRET}`,
    `INSTITUTION_NAME=${params.institutionName}`,
    `DOMAIN_DESCRIPTION=${params.domainDescription}`,
    `SUBJECT_MATTER=${params.subjectMatter}`,
  ]
    .map((s) => `'${s}'`)
    .join(" ");

  run(
    `supabase secrets set ${secretPairs} --project-ref ${projectRef}`,
    "supabase secrets set"
  );

  return `https://${projectRef}.supabase.co/functions/v1/coach-respond`;
}
