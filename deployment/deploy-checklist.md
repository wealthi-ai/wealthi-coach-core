# Coach Deploy Checklist

## Prerequisites
- [ ] Supabase CLI installed (`supabase --version`)
- [ ] Logged in (`supabase login`)

## Steps

1. **Link project**
   ```
   supabase link --project-ref <SUPABASE_PROJECT_REF>
   ```

2. **Set secrets**
   ```
   supabase secrets set ANTHROPIC_API_KEY=<your-key> --project-ref <SUPABASE_PROJECT_REF>
   supabase secrets set COACH_MCP_SERVER_URL=https://wealthi-coach-mcp-server-production.up.railway.app --project-ref <SUPABASE_PROJECT_REF>
   ```
   Optional overrides:
   ```
   supabase secrets set INSTITUTION_NAME="My School" --project-ref <SUPABASE_PROJECT_REF>
   supabase secrets set COACH_PERSONA="Custom full system prompt here" --project-ref <SUPABASE_PROJECT_REF>
   ```

3. **Deploy**
   ```
   supabase functions deploy coach-respond --project-ref <SUPABASE_PROJECT_REF>
   ```

4. **Verify**
   ```
   curl -i https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/coach-respond
   ```
   Expected: `{"error":"Missing auth"}` with HTTP 401

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `COACH_MCP_SERVER_URL` | Recommended | MCP server URL for student context |
| `INSTITUTION_NAME` | No | Overrides "Wealthi" in system prompt |
| `COACH_PERSONA` | No | Full system prompt override (takes precedence over all) |
| `SUPABASE_URL` | Auto | Injected by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Injected by Supabase runtime |
| `SUPABASE_ANON_KEY` | Auto | Injected by Supabase runtime |
