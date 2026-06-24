# wealthi-coach-core

Standalone AI Coach package extracted from WealthiHome. Contains the `coach-respond` Supabase Edge Function, shared persona config, frontend hook, and TypeScript types.

## Structure

```
wealthi-coach-core/
├── coach.config.example.json         # Configuration template
├── supabase/functions/coach-respond/ # Edge function
├── _shared/coach-persona.ts          # System prompt builder
├── hooks/useCoachResponse.ts         # React hook
├── types/coach.types.ts              # Shared TypeScript interfaces
└── deployment/deploy-checklist.md    # Deploy steps
```

## Quick Start

See `deployment/deploy-checklist.md` for full deploy steps.

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase secrets set ANTHROPIC_API_KEY=<your-key>
supabase secrets set COACH_MCP_SERVER_URL=https://wealthi-coach-mcp-server-production.up.railway.app
supabase functions deploy coach-respond
```

## Configuration

Copy `coach.config.example.json` and set the corresponding Supabase secrets to customize the coach persona for your institution.

The system prompt resolution order:
1. `COACH_PERSONA` env var (full prompt override)
2. `INSTITUTION_NAME` env var + built-in Wealthi defaults
3. Wealthi defaults (`_shared/coach-persona.ts`)
