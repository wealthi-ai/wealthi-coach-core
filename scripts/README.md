# Institution Deploy Script

Spins up a complete Coach instance (Railway MCP server + Supabase Edge Function) for an institution in one command.

## Prerequisites

- Node.js 18+
- `ts-node` installed (`npm install -g ts-node typescript`)
- Supabase CLI installed and authenticated (`supabase login`)
- `RAILWAY_API_TOKEN` set in your environment

## Usage

### Deploy a new institution

1. Copy `configs/example.json` to `configs/<institution-id>.json`
2. Fill in all non-secret fields
3. Run:

```bash
export RAILWAY_API_TOKEN=your_token_here
npx ts-node scripts/deploy-institution.ts --config configs/<institution-id>.json
```

The script will prompt you for any blank secret values at runtime. Secrets are **never** written to the config file.

### Deploy Wealthi's own instance

```bash
export RAILWAY_API_TOKEN=your_token_here
npx ts-node scripts/deploy-institution.ts --config configs/wealthi.json
```

## What the script does

1. **Loads and validates** the institution config
2. **Prompts** for any missing secrets (runtime only, never stored)
3. **Railway** — creates or reuses a project named `wealthi-coach-{institutionId}`, sets env vars, waits for deployment
4. **Supabase** — deploys `coach-respond` edge function and sets all required secrets
5. **Verifies** both endpoints are live
6. **Outputs** a summary with all URLs and next steps
7. **Updates** the config file with the Railway project ID and MCP server URL (secrets are always left blank)

## Idempotency

Running the script twice on the same config is safe:
- If a Railway project named `wealthi-coach-{institutionId}` already exists, it is reused
- Supabase `functions deploy` and `secrets set` are both idempotent

## Config schema

| Field | Required | Notes |
|---|---|---|
| `institutionId` | Yes | Lowercase, hyphen-separated. Used in Railway project name |
| `institutionName` | Yes | Human-readable name |
| `domainDescription` | Yes | Passed to the coach as context |
| `subjectMatter` | Yes | Passed to the coach as context |
| `supabaseProjectRef` | Yes | From Supabase dashboard |
| `railwayProjectId` | Auto | Written by the script after first deploy |
| `mcpServerUrl` | Auto | Written by the script after first deploy |
| `secrets.*` | Runtime | Always blank in file — prompted at runtime |

## Environment variables

| Variable | Required | Source |
|---|---|---|
| `RAILWAY_API_TOKEN` | Yes | Railway dashboard → Account Settings → Tokens |
