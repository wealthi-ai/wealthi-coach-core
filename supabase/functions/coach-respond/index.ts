import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildSystemPrompt, WEALTHI_CONFIG } from "../../../_shared/coach-persona.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveSystemPrompt(): string {
  const envPrompt = Deno.env.get("COACH_PERSONA");
  if (envPrompt) return envPrompt;

  const institutionName = Deno.env.get("INSTITUTION_NAME") ?? WEALTHI_CONFIG.institutionName;
  return buildSystemPrompt({
    institutionName,
    domainDescription: WEALTHI_CONFIG.domainDescription,
    subjectMatter: WEALTHI_CONFIG.subjectMatter,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as { studentId?: string; trigger?: string };
    const { studentId, trigger } = body;

    // Only allow a student to fetch their own coach context — no cross-student access.
    if (!studentId || studentId !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const rawMcpUrl = (Deno.env.get("COACH_MCP_SERVER_URL") ?? "").trim();

    // Validate MCP URL — if invalid, proceed without MCP tools rather than 400-ing.
    let validMcpUrl: string | null = null;
    if (rawMcpUrl) {
      try {
        const u = new URL(rawMcpUrl);
        if (u.protocol === "https:" || u.protocol === "http:") validMcpUrl = u.toString();
      } catch {
        console.warn("[coach-respond] COACH_MCP_SERVER_URL is not a valid URL, skipping MCP:", rawMcpUrl);
      }
    }

    if (!anthropicKey) {
      console.error("[coach-respond] Missing ANTHROPIC_API_KEY");
      return new Response(
        JSON.stringify({ message: "Keep going — one small action today builds your momentum.", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SYSTEM_PROMPT = resolveSystemPrompt();

    const userMessage = `Generate a personalized coaching message for student with ID "${studentId}".${
      trigger ? ` Their current learning momentum can be described as: "${trigger}".` : ""
    } ${validMcpUrl ? "Use the available tools to look up their real progress and context, then write" : "Write"} a 1-3 sentence coaching note.`;

    const headers: Record<string, string> = {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    if (validMcpUrl) headers["anthropic-beta"] = "mcp-client-2025-04-04";

    const payload: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    };
    if (validMcpUrl) {
      payload.mcp_servers = [{ type: "url", url: validMcpUrl, name: "wealthi-coach-mcp-server" }];
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[coach-respond] Anthropic API error:", anthropicRes.status, errText);
      return new Response(
        JSON.stringify({ message: "Keep going — one small action today builds your momentum.", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicRes.json() as {
      content: { type: string; text: string }[];
    };

    const textBlock = anthropicData.content?.find((b) => b.type === "text");
    if (!textBlock?.text) {
      console.error("[coach-respond] No text block in Anthropic response:", JSON.stringify(anthropicData));
      return new Response(
        JSON.stringify({ message: "Keep going — one small action today builds your momentum.", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ message: textBlock.text.trim() }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[coach-respond] Unhandled error:", err);
    return new Response(JSON.stringify({ message: "Keep going — one small action today builds your momentum.", fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
