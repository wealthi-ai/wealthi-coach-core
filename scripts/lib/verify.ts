import fetch from "node-fetch";

async function checkWithRetry(
  label: string,
  fn: () => Promise<void>,
  retries = 3,
  delayMs = 5000
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(
        `  [${label}] Attempt ${attempt} failed, retrying in ${delayMs / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function verifyMcpServer(mcpServerUrl: string): Promise<void> {
  const url = `${mcpServerUrl.replace(/\/$/, "")}/health`;
  console.log(`\n[Verify] MCP server health: ${url}`);

  await checkWithRetry("MCP health", async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = (await res.json()) as { status?: string; service?: string };
    if (body.status !== "ok") {
      throw new Error(`Unexpected health response: ${JSON.stringify(body)}`);
    }
    console.log(`  OK — ${JSON.stringify(body)}`);
  });
}

export async function verifyEdgeFunction(
  projectRef: string,
  edgeFunctionUrl: string
): Promise<void> {
  console.log(`\n[Verify] Edge function auth gate: ${edgeFunctionUrl}`);

  await checkWithRetry("Edge function", async () => {
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: "test" }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await res.json()) as { error?: string };

    // We expect a 401/403/400 with an auth error — NOT a 500 or success
    if (res.status === 500) {
      throw new Error(`Edge function returned 500: ${JSON.stringify(body)}`);
    }

    const isAuthError =
      typeof body.error === "string" &&
      (body.error.toLowerCase().includes("auth") ||
        body.error.toLowerCase().includes("unauthorized") ||
        body.error.toLowerCase().includes("missing"));

    if (!isAuthError) {
      throw new Error(
        `Edge function did not return auth error. Got ${res.status}: ${JSON.stringify(body)}`
      );
    }

    console.log(`  OK — ${res.status}: ${JSON.stringify(body)}`);
  });
}
