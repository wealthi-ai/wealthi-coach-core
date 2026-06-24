#!/usr/bin/env ts-node
/**
 * deploy-institution.ts
 *
 * Deploys a new Coach instance for an institution.
 *
 * Usage:
 *   npx ts-node scripts/deploy-institution.ts --config configs/wealthi.json
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { deployMcpServer } from "./lib/railway";
import { deployEdgeFunction } from "./lib/supabase";
import { verifyMcpServer, verifyEdgeFunction } from "./lib/verify";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstitutionConfig {
  institutionId: string;
  institutionName: string;
  domainDescription: string;
  subjectMatter: string;
  supabaseProjectRef: string;
  railwayProjectId: string;
  mcpServerUrl: string;
  secrets: {
    ANTHROPIC_API_KEY: string;
    COACH_MCP_SHARED_SECRET: string;
    CURRICULUM_INGEST_KEY: string;
    WEALTHI_WEBHOOK_SECRET: string;
    [key: string]: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(): { configPath: string } {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--config");
  if (idx === -1 || !args[idx + 1]) {
    console.error("Usage: npx ts-node scripts/deploy-institution.ts --config configs/wealthi.json");
    process.exit(1);
  }
  return { configPath: args[idx + 1] };
}

function loadConfig(configPath: string): { config: InstitutionConfig; absolutePath: string } {
  const absolutePath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf-8");
  const config = JSON.parse(raw) as InstitutionConfig;

  // Validate required non-secret fields
  const required: (keyof InstitutionConfig)[] = [
    "institutionId",
    "institutionName",
    "domainDescription",
    "subjectMatter",
    "supabaseProjectRef",
  ];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Config is missing required field: ${field}`);
    }
  }

  return { config, absolutePath };
}

function saveConfig(absolutePath: string, config: InstitutionConfig): void {
  // Never write secret values — always blank them out before saving
  const toSave: InstitutionConfig = {
    ...config,
    secrets: Object.fromEntries(
      Object.keys(config.secrets).map((k) => [k, ""])
    ) as InstitutionConfig["secrets"],
  };
  fs.writeFileSync(absolutePath, JSON.stringify(toSave, null, 2) + "\n", "utf-8");
}

async function promptSecret(rl: readline.Interface, name: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`  Enter ${name}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function collectSecrets(
  config: InstitutionConfig
): Promise<Record<string, string>> {
  const secretKeys = Object.keys(config.secrets);
  const neededKeys = secretKeys.filter((k) => !config.secrets[k]);

  if (neededKeys.length === 0) return config.secrets;

  console.log(`\nThe following secrets are required (they will NOT be written to the config file):`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const resolved: Record<string, string> = { ...config.secrets };

  for (const key of neededKeys) {
    const value = await promptSecret(rl, key);
    if (!value) {
      rl.close();
      throw new Error(`Secret ${key} cannot be empty`);
    }
    resolved[key] = value;
  }

  rl.close();
  return resolved;
}

function printSummary(params: {
  institutionName: string;
  mcpServerUrl: string;
  edgeFunctionUrl: string;
  configPath: string;
  supabaseProjectRef: string;
}): void {
  const { institutionName, mcpServerUrl, edgeFunctionUrl, configPath, supabaseProjectRef } =
    params;

  const relConfig = path.relative(process.cwd(), configPath);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Institution:    ${institutionName}
✅ MCP Server:     ${mcpServerUrl}/health
✅ Edge Function:  ${edgeFunctionUrl}
✅ Config updated: ${relConfig}

Next steps:
- Set VITE_COACH_ENDPOINT in wealthihome to:
  ${edgeFunctionUrl}
- Run end-to-end test with a real student account
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { configPath } = parseArgs();

  // Step 1 — Load and validate config
  console.log(`\nLoading config: ${configPath}`);
  const { config, absolutePath } = loadConfig(configPath);
  console.log(`  Institution: ${config.institutionName} (${config.institutionId})`);

  // Collect any missing secrets interactively (never from file)
  const secrets = await collectSecrets(config);

  // Step 2 — Railway: deploy MCP server
  const railwayResult = await deployMcpServer({
    institutionId: config.institutionId,
    institutionName: config.institutionName,
    existingProjectId: config.railwayProjectId || undefined,
    existingMcpServerUrl: config.mcpServerUrl || undefined,
    secrets: {
      ANTHROPIC_API_KEY: secrets.ANTHROPIC_API_KEY,
      COACH_MCP_SHARED_SECRET: secrets.COACH_MCP_SHARED_SECRET,
    },
  });

  // Write Railway results back to config (no secrets)
  config.railwayProjectId = railwayResult.projectId;
  config.mcpServerUrl = railwayResult.deploymentUrl;
  saveConfig(absolutePath, config);
  console.log(`\n  Config updated with railwayProjectId and mcpServerUrl`);

  // Step 3 — Supabase: deploy edge function
  const edgeFunctionUrl = await deployEdgeFunction({
    projectRef: config.supabaseProjectRef,
    mcpServerUrl: railwayResult.deploymentUrl,
    institutionName: config.institutionName,
    domainDescription: config.domainDescription,
    subjectMatter: config.subjectMatter,
    secrets: {
      ANTHROPIC_API_KEY: secrets.ANTHROPIC_API_KEY,
      COACH_MCP_SHARED_SECRET: secrets.COACH_MCP_SHARED_SECRET,
    },
  });

  // Step 4 — Verify
  await verifyMcpServer(railwayResult.deploymentUrl);
  await verifyEdgeFunction(config.supabaseProjectRef, edgeFunctionUrl);

  // Step 5 — Summary
  printSummary({
    institutionName: config.institutionName,
    mcpServerUrl: railwayResult.deploymentUrl,
    edgeFunctionUrl,
    configPath: absolutePath,
    supabaseProjectRef: config.supabaseProjectRef,
  });
}

main().catch((err) => {
  console.error(`\n❌ Deploy failed: ${(err as Error).message}\n`);
  process.exit(1);
});
